import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { closeEvent, publishDraw, resetDraw, runDraw } from "@/lib/actions/draw";
import { createEvent, deleteEvent, updateEvent } from "@/lib/actions/events";
import { addExclusion, removeExclusions } from "@/lib/actions/exclusions";
import { markInviteCopied, regenerateInviteLink, sendInviteEmail, sendPendingInviteEmails } from "@/lib/actions/invites";
import { getParticipantView, revealRecipient } from "@/lib/actions/participant-view";
import {
  addParticipant,
  deleteParticipant,
  removeParticipantPhoto,
  updateParticipant,
  uploadParticipantPhoto,
} from "@/lib/actions/participants";

type Call = { table?: string; rpc?: string; args?: unknown; ops: { method: string; args: unknown[] }[] };
type Result = { data?: unknown; error?: unknown; count?: number };

/** Client Supabase finto: registra le chiamate e risponde tramite `handler`. */
function fakeSupabase(handler: (call: Call) => Result = () => ({ data: null, error: null })) {
  const calls: Call[] = [];
  const builder = (call: Call) => {
    const proxy: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            const result = { data: null, error: null, ...handler(call) };
            return (resolve: (value: unknown) => unknown) => resolve(result);
          }
          return (...args: unknown[]) => {
            call.ops.push({ method: prop, args });
            return proxy;
          };
        },
      },
    );
    return proxy;
  };
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      return builder(call);
    },
    rpc(name: string, args: unknown) {
      const call: Call = { rpc: name, args, ops: [] };
      calls.push(call);
      return builder(call);
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (...args: unknown[]) => {
            const call: Call = { table: `storage:${bucket}`, ops: [{ method: "upload", args }] };
            calls.push(call);
            return { data: null, error: null, ...handler(call) };
          },
          remove: async (...args: unknown[]) => {
            const call: Call = { table: `storage:${bucket}`, ops: [{ method: "remove", args }] };
            calls.push(call);
            return { data: null, error: null, ...handler(call) };
          },
        };
      },
    },
  };
  return { client, calls };
}

const EVENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P1 = "a0000000-0000-4000-8000-000000000001";
const P2 = "a0000000-0000-4000-8000-000000000002";
const P3 = "a0000000-0000-4000-8000-000000000003";
const TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function asAdmin(handler?: (call: Call) => Result) {
  const fake = fakeSupabase(handler);
  vi.mocked(requireAdminAction).mockResolvedValue({
    ok: true,
    context: { supabase: fake.client as never, userId: "u", email: "admin@example.com" },
  });
  return fake;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isEmailConfigured).mockReturnValue(false);
});

describe("protezione delle azioni amministrative", () => {
  const actions: [string, () => Promise<unknown>][] = [
    ["createEvent", () => createEvent(null, form({ name: "X" }))],
    ["updateEvent", () => updateEvent(EVENT, null, form({ name: "X" }))],
    ["deleteEvent", () => deleteEvent(EVENT)],
    ["addParticipant", () => addParticipant(EVENT, null, form({ name: "X" }))],
    ["updateParticipant", () => updateParticipant(P1, null, form({ name: "X" }))],
    ["deleteParticipant", () => deleteParticipant(P1)],
    ["uploadParticipantPhoto", () => uploadParticipantPhoto(P1, null, new FormData())],
    ["removeParticipantPhoto", () => removeParticipantPhoto(P1)],
    ["addExclusion", () => addExclusion(null, form({ eventId: EVENT, giverId: P1, receiverId: P2 }))],
    ["removeExclusions", () => removeExclusions(EVENT, [P1])],
    ["runDraw", () => runDraw(EVENT)],
    ["publishDraw", () => publishDraw(EVENT)],
    ["closeEvent", () => closeEvent(EVENT)],
    ["resetDraw", () => resetDraw(EVENT, null, new FormData())],
    ["markInviteCopied", () => markInviteCopied(P1)],
    ["regenerateInviteLink", () => regenerateInviteLink(P1)],
    ["sendInviteEmail", () => sendInviteEmail(P1)],
    ["sendPendingInviteEmails", () => sendPendingInviteEmails(EVENT)],
  ];

  it.each(actions)("%s rifiuta chi non è amministratore senza toccare il database", async (_name, action) => {
    vi.mocked(requireAdminAction).mockResolvedValue({ ok: false, error: "Sessione scaduta o permessi insufficienti." });
    const result = await action();
    expect(result).toEqual({ ok: false, error: "Sessione scaduta o permessi insufficienti." });
  });
});

describe("validazione degli input nelle azioni", () => {
  it("rifiuta identificativi non validi prima di interrogare il database", async () => {
    const fake = asAdmin();
    for (const result of [
      await deleteEvent("1; drop table events"),
      await updateParticipant("../../etc", null, form({ name: "X", email: "", avatar: "gift" })),
      await runDraw("non-un-uuid"),
      await publishDraw(""),
      await markInviteCopied("x"),
    ]) {
      expect(result.ok).toBe(false);
    }
    expect(fake.calls).toEqual([]);
  });

  it("rifiuta dati non validi con un messaggio comprensibile", async () => {
    const fake = asAdmin();
    expect(await addParticipant(EVENT, null, form({ name: "   ", email: "", avatar: "gift" }))).toEqual({ ok: false, error: "Inserisci il nome." });
    expect(await addParticipant(EVENT, null, form({ name: "Mario", email: "mario@", avatar: "gift" }))).toEqual({
      ok: false,
      error: "Indirizzo email non valido.",
    });
    expect(await createEvent(null, form({ name: "", description: "", budget: "", exchangeDate: "" }))).toMatchObject({ ok: false });
    expect(await addExclusion(null, form({ eventId: EVENT, giverId: P1, receiverId: P1 }))).toEqual({
      ok: false,
      error: "Scegli due persone diverse.",
    });
    expect(fake.calls).toEqual([]);
  });

  it("rifiuta foto mancanti o con contenuto non immagine", async () => {
    asAdmin();
    expect(await uploadParticipantPhoto(P1, null, new FormData())).toEqual({ ok: false, error: "Seleziona una fotografia." });
    const fake = new FormData();
    fake.set("photo", new Blob(["<script>alert(1)</script>"], { type: "image/jpeg" }), "x.jpg");
    expect(await uploadParticipantPhoto(P1, null, fake)).toMatchObject({ ok: false, error: expect.stringContaining("Formato") });
  });

  it("passa al database i dati normalizzati", async () => {
    const fake = asAdmin();
    const result = await addParticipant(EVENT, null, form({ name: "  Mario  Rossi ", email: " Mario@Example.com ", avatar: "elf" }));
    expect(result.ok).toBe(true);
    expect(fake.calls[0].ops[0]).toEqual({
      method: "insert",
      args: [{ event_id: EVENT, name: "Mario Rossi", email: "mario@example.com", avatar: "elf" }],
    });
  });
});

describe("errori del database", () => {
  const internal = { code: "XX000", message: "connection to 10.0.0.5 failed: password=segreta", details: "stack" };

  it("mostrano un messaggio generico senza dettagli interni", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    asAdmin(() => ({ error: internal }));
    for (const result of [
      await addParticipant(EVENT, null, form({ name: "Mario", email: "", avatar: "gift" })),
      await publishDraw(EVENT),
      await closeEvent(EVENT),
      await regenerateInviteLink(P1),
    ]) {
      expect(result).toEqual({ ok: false, error: "Si è verificato un errore imprevisto. Riprova tra poco." });
    }
    error.mockRestore();
  });

  it("traducono gli errori applicativi", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    asAdmin(() => ({ error: { code: "P0001", message: "SS_EVENT_LOCKED" } }));
    const result = await addParticipant(EVENT, null, form({ name: "Mario", email: "", avatar: "gift" }));
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("annullarla") });
  });

  it("gestiscono dati mancanti (elemento non trovato)", async () => {
    asAdmin(() => ({ data: [] }));
    expect(await updateEvent(EVENT, null, form({ name: "Nuovo nome" }))).toEqual({ ok: false, error: "Evento non trovato." });
    asAdmin(() => ({ data: null }));
    expect(await deleteParticipant(P1)).toEqual({ ok: false, error: "Partecipante non trovato." });
    asAdmin(() => ({ data: null }));
    expect(await runDraw(EVENT)).toEqual({ ok: false, error: "Evento non trovato." });
  });
});

describe("runDraw", () => {
  const participants = [
    { id: P1, name: "A" },
    { id: P2, name: "B" },
    { id: P3, name: "C" },
  ];

  it("non salva nulla se non esiste una soluzione e spiega il motivo", async () => {
    const fake = asAdmin((call) => {
      if (call.table === "events") return { data: { status: "DRAFT" } };
      if (call.table === "participants") return { data: participants };
      if (call.table === "exclusions")
        return {
          data: [
            { giver_id: P1, receiver_id: P2 },
            { giver_id: P2, receiver_id: P1 },
          ],
        };
      return {};
    });
    const result = await runDraw(EVENT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.details?.length).toBeGreaterThan(0);
    expect(fake.calls.some((c) => c.rpc === "save_draw")).toBe(false);
  });

  it("salva con save_draw un'estrazione valida", async () => {
    const fake = asAdmin((call) => {
      if (call.table === "events") return { data: { status: "DRAFT" } };
      if (call.table === "participants") return { data: participants };
      if (call.table === "exclusions") return { data: [{ giver_id: P1, receiver_id: P2 }] };
      return {};
    });
    expect((await runDraw(EVENT)).ok).toBe(true);
    const save = fake.calls.find((c) => c.rpc === "save_draw")!;
    const { p_pairs } = save.args as { p_pairs: { giver_id: string; receiver_id: string }[] };
    expect(p_pairs).toHaveLength(3);
    expect(new Set(p_pairs.map((p) => p.receiver_id)).size).toBe(3);
    for (const pair of p_pairs) expect(pair.giver_id).not.toBe(pair.receiver_id);
    expect(p_pairs).not.toContainEqual({ giver_id: P1, receiver_id: P2 });
  });

  it("non rifà un'estrazione già pubblicata", async () => {
    const fake = asAdmin((call) => (call.table === "events" ? { data: { status: "PUBLISHED" } } : { data: participants }));
    expect((await runDraw(EVENT)).ok).toBe(false);
    expect(fake.calls.some((c) => c.rpc === "save_draw")).toBe(false);
  });
});

describe("inviti via email", () => {
  it("senza SMTP configurato non dichiara alcun invio", async () => {
    asAdmin();
    const result = await sendInviteEmail(P1);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("non è configurato") });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("ognuno riceve un'email separata con il solo proprio link", async () => {
    vi.mocked(isEmailConfigured).mockReturnValue(true);
    const rows = [
      { id: P1, name: "Anna", email: "anna@example.com", invite_method: null, invite_tokens: { token: "A".repeat(43) }, events: { name: "Natale", budget: null, exchange_date: null } },
      { id: P2, name: "Bruno", email: "bruno@example.com", invite_method: null, invite_tokens: { token: "B".repeat(43) }, events: { name: "Natale", budget: null, exchange_date: null } },
      { id: P3, name: "Carla", email: null, invite_method: null, invite_tokens: { token: "C".repeat(43) }, events: { name: "Natale", budget: null, exchange_date: null } },
    ];
    asAdmin((call) => (call.table === "participants" && call.ops[0].method === "select" ? { data: rows } : {}));
    const result = await sendPendingInviteEmails(EVENT);
    expect(result).toMatchObject({ ok: true, message: expect.stringContaining("Email inviate: 2") });
    expect(sendEmail).toHaveBeenCalledTimes(2);
    const [first, second] = vi.mocked(sendEmail).mock.calls.map(([message]) => message);
    expect(first.to).toBe("anna@example.com");
    expect(first.text).toContain(`https://santa.test/p#${"A".repeat(43)}`);
    expect(first.text).not.toContain("B".repeat(43));
    expect(first.html).not.toContain("B".repeat(43));
    expect(second.to).toBe("bruno@example.com");
    expect(second.text).not.toContain("A".repeat(43));
  });

  it("segnala un invio fallito senza fingere successo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(isEmailConfigured).mockReturnValue(true);
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("SMTP down"));
    asAdmin(() => ({
      data: [{ id: P1, name: "Anna", email: "anna@example.com", invite_method: null, invite_tokens: { token: TOKEN }, events: { name: "N", budget: null, exchange_date: null } }],
    }));
    const result = await sendInviteEmail(P1);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("non riuscito") });
  });
});

describe("azioni del partecipante", () => {
  function publicClient(rpc: (name: string, args: unknown) => Result) {
    const fn = vi.fn(async (name: string, args: unknown) => ({ data: null, error: null, ...rpc(name, args) }));
    vi.mocked(createSupabasePublicClient).mockReturnValue({ rpc: fn } as never);
    return fn;
  }

  it("un token malformato o mancante non arriva nemmeno al database", async () => {
    const rpc = publicClient(() => ({}));
    for (const token of [undefined, null, "", "abc", `${TOKEN}x`, "../admin", { token: TOKEN }]) {
      expect(await getParticipantView(token)).toEqual({ ok: false, reason: "invalid" });
      expect(await revealRecipient(token)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("un token sconosciuto è segnalato come non valido", async () => {
    publicClient(() => ({ data: [] }));
    expect(await getParticipantView(TOKEN)).toEqual({ ok: false, reason: "invalid" });
  });

  it("prima della pubblicazione non restituisce alcun destinatario", async () => {
    publicClient(() => ({ data: [{ event_status: "DRAWN", recipient_name: null, recipient_avatar: null, recipient_photo_path: null }] }));
    expect(await revealRecipient(TOKEN)).toEqual({ ok: true, status: "DRAWN", recipient: null });
  });

  it("dopo la pubblicazione restituisce il destinatario con l'URL della foto", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://progetto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "chiave-pubblica");
    const rpc = publicClient(() => ({
      data: [{ event_status: "PUBLISHED", recipient_name: "Bruno", recipient_avatar: "tree", recipient_photo_path: `${EVENT}/foto.jpg` }],
    }));
    expect(await revealRecipient(TOKEN)).toEqual({
      ok: true,
      status: "PUBLISHED",
      recipient: { name: "Bruno", avatar: "tree", photoUrl: `https://progetto.supabase.co/storage/v1/object/public/photos/${EVENT}/foto.jpg` },
    });
    expect(rpc).toHaveBeenCalledWith("participant_reveal", { p_token: TOKEN });
    vi.unstubAllEnvs();
  });

  it("in caso di errore del database risponde 'non disponibile' senza registrare il token nei log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    publicClient(() => ({ error: { code: "PGRST000", message: "database offline" } }));
    expect(await getParticipantView(TOKEN)).toEqual({ ok: false, reason: "unavailable" });
    expect(await revealRecipient(TOKEN)).toEqual({ ok: false, reason: "unavailable" });
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
    log.mockRestore();
  });

  it("se la configurazione manca risponde 'non disponibile'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createSupabasePublicClient).mockImplementation(() => {
      throw new Error("Variabile d'ambiente mancante");
    });
    expect(await getParticipantView(TOKEN)).toEqual({ ok: false, reason: "unavailable" });
  });
});
