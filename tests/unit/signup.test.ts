import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAdminAction: vi.fn() }));
vi.mock("@/lib/site", () => ({ getBaseUrl: vi.fn(async () => "https://santa.test") }));
vi.mock("@/lib/email", () => ({ isEmailConfigured: vi.fn(() => false), sendEmail: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ createSupabasePublicClient: vi.fn() }));

import { requireAdminAction } from "@/lib/auth";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { deleteEvent, removeEventCover, uploadEventCover } from "@/lib/actions/events";
import { getParticipantView, updateParticipantProfile } from "@/lib/actions/participant-view";
import { getSignupInfo, registerParticipant } from "@/lib/actions/signup";
import { regenerateSignupLink, setSignupOpen } from "@/lib/actions/signup-admin";
import { buildSignupLink, buildSignupMessage } from "@/lib/invite";
import { QUOTES, randomQuoteIndex } from "@/lib/quotes";
import { fakeSupabase, type Call, type Result } from "../support/fake-supabase";

const EVENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SIGNUP = "SIGNUPabcdefghijklmnopqrstuvwxyzABCDEFGHIJK";
const PERSONAL = "PERSONALabcdefghijklmnopqrstuvwxyzABCDEFGHI";
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function form(values: Record<string, string | Blob>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const SIGNUP_ROW = {
  event_id: EVENT,
  event_name: "Natale tra amici",
  event_description: null,
  event_budget: "20 €",
  event_exchange_date: null,
  event_cover_path: null,
  is_open: true,
};

function asPublic(handler?: (call: Call) => Result) {
  const fake = fakeSupabase(handler);
  vi.mocked(createSupabasePublicClient).mockReturnValue(fake.client as never);
  return fake;
}

function asAdmin(handler?: (call: Call) => Result) {
  const fake = fakeSupabase(handler);
  vi.mocked(requireAdminAction).mockResolvedValue({
    ok: true,
    context: { supabase: fake.client as never, userId: "u", email: "admin@example.com" },
  });
  return fake;
}

/** Iscrizione che va a buon fine: l'evento è aperto e il database restituisce il token personale. */
const openSignup = (overrides: (call: Call) => Result | undefined = () => undefined) => (call: Call): Result =>
  overrides(call) ??
  (call.rpc === "signup_info" ? { data: [SIGNUP_ROW] } : call.rpc === "register_participant" ? { data: PERSONAL } : {});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isEmailConfigured).mockReturnValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://progetto.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "chiave-pubblica");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("iscrizione dal link di gruppo", () => {
  it("token o dati non validi non arrivano al database", async () => {
    const fake = asPublic(openSignup());
    expect(await registerParticipant("corto", form({ name: "Mario", email: "mario@example.com" }))).toMatchObject({ ok: false });
    expect(await registerParticipant(SIGNUP, form({ name: "Mario", email: "" }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("email"),
    });
    expect(await registerParticipant(SIGNUP, form({ name: "  ", email: "mario@example.com" }))).toMatchObject({ ok: false });
    expect(fake.calls).toEqual([]);
  });

  it("iscrive con i dati normalizzati e restituisce il link personale (senza SMTP non dichiara invii)", async () => {
    const fake = asPublic(openSignup());
    const result = await registerParticipant(SIGNUP, form({ name: "  Mario   Rossi ", email: " Mario@Example.COM ", avatar: "elf" }));
    expect(result).toEqual({
      ok: true,
      participantName: "Mario Rossi",
      personalLink: `https://santa.test/p#${PERSONAL}`,
      email: "mario@example.com",
      emailSent: false,
    });
    const register = fake.calls.find((c) => c.rpc === "register_participant");
    expect(register?.args).toEqual({
      p_token: SIGNUP,
      p_name: "Mario Rossi",
      p_email: "mario@example.com",
      p_avatar: "elf",
      p_photo_path: undefined,
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(fake.calls.some((c) => c.rpc === "participant_mark_emailed")).toBe(false);
  });

  it("con SMTP invia un'email con il solo link personale e la segna come inviata", async () => {
    vi.mocked(isEmailConfigured).mockReturnValue(true);
    const fake = asPublic(openSignup());
    const result = await registerParticipant(SIGNUP, form({ name: "Mario", email: "mario@example.com" }));
    expect(result).toMatchObject({ ok: true, emailSent: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const message = vi.mocked(sendEmail).mock.calls[0][0];
    expect(message.to).toBe("mario@example.com");
    expect(message.text).toContain(`https://santa.test/p#${PERSONAL}`);
    expect(message.text).not.toContain(SIGNUP);
    expect(fake.calls.find((c) => c.rpc === "participant_mark_emailed")?.args).toEqual({ p_token: PERSONAL });
  });

  it("se l'email non parte l'iscrizione resta valida e lo dice", async () => {
    vi.mocked(isEmailConfigured).mockReturnValue(true);
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("SMTP down"));
    const fake = asPublic(openSignup());
    const result = await registerParticipant(SIGNUP, form({ name: "Mario", email: "mario@example.com" }));
    expect(result).toMatchObject({ ok: true, emailSent: false, personalLink: `https://santa.test/p#${PERSONAL}` });
    expect(fake.calls.some((c) => c.rpc === "participant_mark_emailed")).toBe(false);
  });

  it("link sconosciuto o iscrizioni chiuse: niente iscrizione", async () => {
    let fake = asPublic(() => ({ data: [] }));
    expect(await registerParticipant(SIGNUP, form({ name: "Mario", email: "mario@example.com" }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("non è valido"),
    });
    fake = asPublic(() => ({ data: [{ ...SIGNUP_ROW, is_open: false }] }));
    expect(await registerParticipant(SIGNUP, form({ name: "Mario", email: "mario@example.com" }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("chiuse"),
    });
    expect(fake.calls.some((c) => c.rpc === "register_participant")).toBe(false);
  });

  it("email o nome già iscritti: messaggi chiari, senza rivelare link altrui", async () => {
    asPublic(
      openSignup((call) =>
        call.rpc === "register_participant"
          ? { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "participants_event_email_unique"' } }
          : undefined,
      ),
    );
    const email = await registerParticipant(SIGNUP, form({ name: "Mario", email: "mario@example.com" }));
    expect(email).toEqual({ ok: false, error: expect.stringContaining("già iscritta") });
    expect(JSON.stringify(email)).not.toContain(PERSONAL);

    asPublic(
      openSignup((call) =>
        call.rpc === "register_participant"
          ? { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "participants_event_name_unique"' } }
          : undefined,
      ),
    );
    expect(await registerParticipant(SIGNUP, form({ name: "Mario", email: "altro@example.com" }))).toEqual({
      ok: false,
      error: expect.stringContaining("iniziale del cognome"),
    });
  });

  it("carica la foto nella cartella dell'evento e la passa all'iscrizione", async () => {
    const fake = asPublic(openSignup());
    const result = await registerParticipant(SIGNUP, form({ name: "Mario", email: "mario@example.com", photo: new Blob([PNG], { type: "image/png" }) }));
    expect(result.ok).toBe(true);
    const upload = fake.calls.find((c) => c.table === "storage:photos");
    const path = upload?.ops[0].args[0] as string;
    expect(path).toMatch(new RegExp(`^${EVENT}/[0-9a-f-]{36}\\.png$`));
    expect(fake.calls.find((c) => c.rpc === "register_participant")?.args).toMatchObject({ p_photo_path: path });
  });

  it("rifiuta file che non sono immagini senza caricarli", async () => {
    const fake = asPublic(openSignup());
    const result = await registerParticipant(SIGNUP, form({ name: "Mario", email: "mario@example.com", photo: new Blob(["<html>"], { type: "image/png" }) }));
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Formato") });
    expect(fake.calls.some((c) => c.table === "storage:photos" || c.rpc === "register_participant")).toBe(false);
  });

  it("getSignupInfo restituisce i dati dell'evento con l'URL della copertina", async () => {
    asPublic(() => ({ data: [{ ...SIGNUP_ROW, event_cover_path: `${EVENT}/cover-x.jpg` }] }));
    const result = await getSignupInfo(SIGNUP);
    expect(result).toMatchObject({ ok: true, event: { eventName: "Natale tra amici", isOpen: true } });
    expect(result.ok && result.event.coverUrl).toMatch(new RegExp(`/storage/v1/object/public/photos/${EVENT}/cover-x\\.jpg$`));
    expect(await getSignupInfo("x")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("profilo modificabile dal partecipante", () => {
  const PROFILE = { event_id: EVENT, participant_name: "Mario", participant_avatar: "gift", participant_photo_path: null, can_edit: true };

  it("dopo l'estrazione non modifica nulla", async () => {
    const fake = asPublic((call) => (call.rpc === "participant_profile" ? { data: [{ ...PROFILE, can_edit: false }] } : {}));
    expect(await updateParticipantProfile(PERSONAL, form({ name: "Mario R.", avatar: "elf" }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("estrazione"),
    });
    expect(fake.calls.some((c) => c.rpc === "participant_update_profile")).toBe(false);
  });

  it("aggiorna nome e immagine e può rimuovere la foto", async () => {
    const fake = asPublic((call) => (call.rpc === "participant_profile" ? { data: [PROFILE] } : {}));
    expect(await updateParticipantProfile(PERSONAL, form({ name: " Mario  R. ", avatar: "elf", removePhoto: "on" }))).toMatchObject({ ok: true });
    expect(fake.calls.find((c) => c.rpc === "participant_update_profile")?.args).toEqual({
      p_token: PERSONAL,
      p_name: "Mario R.",
      p_avatar: "elf",
      p_photo_path: undefined,
      p_remove_photo: true,
    });
    expect(fake.calls.some((c) => c.table === "storage:photos")).toBe(false);
  });

  it("nome già usato: messaggio chiaro", async () => {
    asPublic((call) =>
      call.rpc === "participant_profile"
        ? { data: [PROFILE] }
        : call.rpc === "participant_update_profile"
          ? { error: { code: "23505", message: "participants_event_name_unique" } }
          : {},
    );
    expect(await updateParticipantProfile(PERSONAL, form({ name: "Luca", avatar: "gift" }))).toMatchObject({
      ok: false,
      error: expect.stringContaining("iniziale del cognome"),
    });
  });

  it("token non valido: nessuna chiamata", async () => {
    const fake = asPublic();
    expect((await updateParticipantProfile("x", form({ name: "Mario", avatar: "gift" }))).ok).toBe(false);
    expect(fake.calls).toEqual([]);
  });

  it("la pagina personale riceve la copertina dell'evento", async () => {
    asPublic(() => ({
      data: [
        {
          participant_name: "Mario",
          event_name: "Natale",
          event_description: null,
          event_budget: null,
          event_exchange_date: null,
          event_status: "DRAFT",
          has_revealed: false,
          event_cover_path: `${EVENT}/cover-y.png`,
        },
      ],
    }));
    const result = await getParticipantView(PERSONAL);
    expect(result.ok && result.view.coverUrl).toMatch(/cover-y\.png$/);
  });
});

describe("azioni dell'admin per iscrizioni e copertina", () => {
  it("richiedono l'admin e un evento valido", async () => {
    vi.mocked(requireAdminAction).mockResolvedValue({ ok: false, error: "Accesso negato" });
    for (const run of [
      () => setSignupOpen(EVENT, true),
      () => regenerateSignupLink(EVENT),
      () => uploadEventCover(EVENT, null, new FormData()),
      () => removeEventCover(EVENT),
    ]) {
      expect(await run()).toEqual({ ok: false, error: "Accesso negato" });
    }
    const fake = asAdmin();
    expect((await setSignupOpen("non-uuid", true)).ok).toBe(false);
    expect((await regenerateSignupLink("x")).ok).toBe(false);
    expect(fake.calls).toEqual([]);
  });

  it("aprono, chiudono e rigenerano il link tramite le funzioni del database", async () => {
    const fake = asAdmin(() => ({ data: SIGNUP }));
    expect((await setSignupOpen(EVENT, true)).ok).toBe(true);
    expect((await setSignupOpen(EVENT, false)).ok).toBe(true);
    expect((await regenerateSignupLink(EVENT)).ok).toBe(true);
    expect(fake.calls.map((c) => [c.rpc, c.args])).toEqual([
      ["set_signup_open", { p_event_id: EVENT, p_open: true }],
      ["set_signup_open", { p_event_id: EVENT, p_open: false }],
      ["regenerate_signup_token", { p_event_id: EVENT }],
    ]);
  });

  it("dopo l'estrazione non si riaprono le iscrizioni", async () => {
    asAdmin(() => ({ error: { message: "SS_EVENT_LOCKED" } }));
    expect(await setSignupOpen(EVENT, true)).toMatchObject({ ok: false, error: expect.stringContaining("estrazione") });
  });

  it("la copertina viene caricata come cover-<uuid> e sostituisce la precedente", async () => {
    const old = `${EVENT}/cover-vecchia.png`;
    const fake = asAdmin((call) => (call.table === "events" && call.ops[0]?.method === "select" ? { data: { cover_path: old } } : {}));
    const result = await uploadEventCover(EVENT, null, form({ photo: new Blob([PNG], { type: "image/png" }) }));
    expect(result.ok).toBe(true);
    const storage = fake.calls.filter((c) => c.table === "storage:photos");
    expect(storage[0].ops[0].method).toBe("upload");
    const path = storage[0].ops[0].args[0] as string;
    expect(path).toMatch(new RegExp(`^${EVENT}/cover-[0-9a-f-]{36}\\.png$`));
    const update = fake.calls.find((c) => c.table === "events" && c.ops[0]?.method === "update");
    expect(update?.ops[0].args[0]).toEqual({ cover_path: path });
    expect(storage[1].ops[0]).toEqual({ method: "remove", args: [[old]] });
  });

  it("eliminare l'evento rimuove tutti i file della sua cartella, anche le foto sostituite", async () => {
    const fake = asAdmin((call) => {
      if (call.ops[0]?.method === "list") return { data: [{ name: "a.jpg" }, { name: "cover-b.png" }] };
      if (call.table === "events") return { data: [{ id: EVENT }] };
      return {};
    });
    await expect(deleteEvent(EVENT)).rejects.toThrow("REDIRECT:/admin");
    const remove = fake.calls.find((c) => c.ops[0]?.method === "remove");
    expect(remove?.ops[0].args[0]).toEqual([`${EVENT}/a.jpg`, `${EVENT}/cover-b.png`]);
  });
});

describe("messaggio per il gruppo e citazioni", () => {
  it("il messaggio d'iscrizione contiene solo il link d'iscrizione", () => {
    const link = buildSignupLink("https://santa.test/", SIGNUP);
    expect(link).toBe(`https://santa.test/iscrizione#${SIGNUP}`);
    const message = buildSignupMessage({ eventName: "Natale", link, budget: "20 €", exchangeDate: "2026-12-20" });
    expect(message).toContain(link);
    expect(message).toContain("💰 Budget: 20 €");
    expect(message).toContain("20 dicembre 2026");
    expect(message).not.toContain("/p#");
  });

  it("le citazioni hanno autore e ruolo; le battute sono solo di personaggi immaginari", () => {
    expect(QUOTES.length).toBeGreaterThan(5);
    for (const quote of QUOTES) {
      expect(quote.text.length).toBeGreaterThan(10);
      expect(quote.author).not.toBe("");
      expect(quote.role).not.toBe("");
      // Le frasi di persone reali riportano una fonte o sono citazioni celebri senza commento inventato nel testo
      if (!quote.fictional) expect(quote.text).not.toMatch(/Polo Nord|renne|panettone/i);
    }
    expect(QUOTES.some((q) => q.fictional)).toBe(true);
  });

  it("'un'altra citazione' ne sceglie sempre una diversa", () => {
    for (let current = 0; current < QUOTES.length; current++) {
      for (const r of [0, 0.3, 0.5, 0.99]) {
        const next = randomQuoteIndex(current, () => r);
        expect(next).not.toBe(current);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(QUOTES.length);
      }
    }
  });
});
