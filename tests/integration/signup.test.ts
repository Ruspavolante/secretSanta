import { beforeAll, describe, expect, it } from "vitest";
import { adminClient, createFixture, newClient, pairs, userClient, type Client } from "./helpers";

let admin: Client;
let user: Client;
let anon: Client;

beforeAll(async () => {
  admin = await adminClient();
  user = await userClient();
  anon = newClient();
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function openSignup(eventId: string): Promise<string> {
  const { data, error } = await admin.rpc("set_signup_open", { p_event_id: eventId, p_open: true });
  if (error) throw error;
  return data;
}

async function register(token: string, name: string, extra: { email?: string; photo?: string | null } = {}) {
  return anon.rpc("register_participant", {
    p_token: token,
    p_name: name,
    p_email: extra.email ?? `${name.toLowerCase().replace(/\s+/g, ".")}.${crypto.randomUUID().slice(0, 6)}@example.com`,
    p_avatar: "star",
    p_photo_path: extra.photo ?? undefined,
  });
}

async function uploadAsAnon(eventId: string) {
  const path = `${eventId}/${crypto.randomUUID()}.png`;
  const { error } = await anon.storage.from("photos").upload(path, png, { contentType: "image/png" });
  return { path, error };
}

describe("link d'iscrizione: gestione da parte dell'admin", () => {
  it("solo l'admin apre, chiude e rigenera il link; il token non è scrivibile direttamente", async () => {
    const f = await createFixture(admin, []);
    expect((await user.rpc("set_signup_open", { p_event_id: f.eventId, p_open: true })).error?.message).toContain("SS_FORBIDDEN");
    expect((await anon.rpc("set_signup_open", { p_event_id: f.eventId, p_open: true })).error).not.toBeNull();
    expect((await user.rpc("regenerate_signup_token", { p_event_id: f.eventId })).error?.message).toContain("SS_FORBIDDEN");

    const token = await openSignup(f.eventId);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Riaprire non cambia il link
    expect(await openSignup(f.eventId)).toBe(token);

    const direct = await admin.from("events").update({ signup_token: "x".repeat(43), signup_open: true } as never).eq("id", f.eventId);
    expect(direct.error?.code).toBe("42501");

    const { data: regenerated } = await admin.rpc("regenerate_signup_token", { p_event_id: f.eventId });
    expect(regenerated).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(regenerated).not.toBe(token);
    expect((await anon.rpc("signup_info", { p_token: token })).data).toEqual([]);
    expect((await anon.rpc("signup_info", { p_token: regenerated! })).data?.[0]?.is_open).toBe(true);

    await admin.rpc("set_signup_open", { p_event_id: f.eventId, p_open: false });
    expect((await anon.rpc("signup_info", { p_token: regenerated! })).data?.[0]?.is_open).toBe(false);
  });

  it("non si possono aprire le iscrizioni dopo l'estrazione", async () => {
    const f = await createFixture(admin, ["A", "B", "C"]);
    await admin.rpc("save_draw", { p_event_id: f.eventId, p_pairs: pairs(f, [["A", "B"], ["B", "C"], ["C", "A"]]) });
    expect((await admin.rpc("set_signup_open", { p_event_id: f.eventId, p_open: true })).error?.message).toContain("SS_EVENT_LOCKED");
  });
});

describe("iscrizione dal link di gruppo", () => {
  it("restituisce solo il token personale del nuovo iscritto, che funziona come link personale", async () => {
    const f = await createFixture(admin, []);
    const token = await openSignup(f.eventId);

    const info = await anon.rpc("signup_info", { p_token: token });
    expect(info.data?.[0]).toMatchObject({ event_id: f.eventId, is_open: true });
    expect(Object.keys(info.data?.[0] ?? {})).not.toContain("signup_token");

    const { data: personal, error } = await register(token, "Giulia", { email: "  Giulia@Example.com " });
    expect(error).toBeNull();
    expect(personal).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(personal).not.toBe(token);

    const status = await anon.rpc("participant_status", { p_token: personal! });
    expect(status.data?.[0]).toMatchObject({ participant_name: "Giulia", event_status: "DRAFT" });

    const { data: row } = await admin.from("participants").select("email, avatar, invite_method").eq("event_id", f.eventId).single();
    expect(row).toEqual({ email: "giulia@example.com", avatar: "star", invite_method: null });

    // Il token d'iscrizione non è un link personale e non apre nulla
    expect((await anon.rpc("participant_status", { p_token: token })).data).toEqual([]);
    expect((await anon.rpc("participant_reveal", { p_token: token })).data).toEqual([]);
  });

  it("rifiuta token non validi, iscrizioni chiuse, email mancanti e duplicati", async () => {
    const f = await createFixture(admin, []);
    const token = await openSignup(f.eventId);

    expect((await register("x".repeat(43), "Mario")).error?.message).toContain("SS_SIGNUP_INVALID");
    expect((await register("corto", "Mario")).error?.message).toContain("SS_SIGNUP_INVALID");
    expect((await register(token, "Mario", { email: "  " })).error?.message).toContain("SS_INVALID_INPUT");

    expect((await register(token, "Mario", { email: "mario@example.com" })).error).toBeNull();
    const sameName = await register(token, "mario");
    expect(sameName.error?.code).toBe("23505");
    expect(sameName.error?.message).toContain("participants_event_name_unique");
    const sameEmail = await register(token, "Mario Rossi", { email: "MARIO@example.com" });
    expect(sameEmail.error?.message).toContain("participants_event_email_unique");

    await admin.rpc("set_signup_open", { p_event_id: f.eventId, p_open: false });
    expect((await register(token, "Luca")).error?.message).toContain("SS_SIGNUP_CLOSED");
  });

  it("le iscrizioni si chiudono da sole con l'estrazione", async () => {
    const f = await createFixture(admin, ["A", "B", "C"]);
    const token = await openSignup(f.eventId);
    await admin.rpc("save_draw", { p_event_id: f.eventId, p_pairs: pairs(f, [["A", "B"], ["B", "C"], ["C", "A"]]) });

    expect((await anon.rpc("signup_info", { p_token: token })).data?.[0]?.is_open).toBe(false);
    expect((await register(token, "Ritardatario")).error?.message).toContain("SS_SIGNUP_CLOSED");
  });

  it("al massimo 100 partecipanti per evento", async () => {
    const names = Array.from({ length: 99 }, (_, i) => `P${i}`);
    const f = await createFixture(admin, names);
    const token = await openSignup(f.eventId);
    expect((await register(token, "Centesimo")).error).toBeNull();
    expect((await register(token, "Centunesimo")).error?.message).toContain("SS_SIGNUP_FULL");
  });

  it("la foto deve essere già caricata nella cartella dell'evento e non usata da altri", async () => {
    const f = await createFixture(admin, []);
    const other = await createFixture(admin, []);
    const token = await openSignup(f.eventId);

    const missing = `${f.eventId}/${crypto.randomUUID()}.png`;
    expect((await register(token, "Senza file", { photo: missing })).error?.message).toContain("SS_PHOTO_INVALID");

    const foreign = await uploadAsAnon(other.eventId);
    expect(foreign.error).toBeNull();
    expect((await register(token, "Straniero", { photo: foreign.path })).error?.message).toContain("SS_PHOTO_INVALID");

    const own = await uploadAsAnon(f.eventId);
    expect(own.error).toBeNull();
    expect((await register(token, "Con foto", { photo: own.path })).error).toBeNull();
    expect((await register(token, "Copione", { photo: own.path })).error?.message).toContain("SS_PHOTO_INVALID");
  });
});

describe("foto caricate dagli anonimi", () => {
  it("consentite solo nella cartella di un evento in preparazione, senza leggere, sovrascrivere o cancellare", async () => {
    const f = await createFixture(admin, ["A", "B", "C"]);
    const uploaded = await uploadAsAnon(f.eventId);
    expect(uploaded.error).toBeNull();

    expect((await anon.storage.from("photos").list(f.eventId)).data ?? []).toEqual([]);
    const overwrite = await anon.storage.from("photos").upload(uploaded.path, png, { contentType: "image/png", upsert: true });
    expect(overwrite.error).not.toBeNull();
    await anon.storage.from("photos").remove([uploaded.path]);
    const publicUrl = anon.storage.from("photos").getPublicUrl(uploaded.path).data.publicUrl;
    expect((await fetch(publicUrl)).status).toBe(200);

    // Nomi fuori formato rifiutati
    const bad = await anon.storage.from("photos").upload(`${f.eventId}/../x.png`, png, { contentType: "image/png" });
    expect(bad.error).not.toBeNull();
    const nested = await anon.storage.from("photos").upload(`${f.eventId}/a/b.png`, png, { contentType: "image/png" });
    expect(nested.error).not.toBeNull();

    await admin.rpc("save_draw", { p_event_id: f.eventId, p_pairs: pairs(f, [["A", "B"], ["B", "C"], ["C", "A"]]) });
    expect((await uploadAsAnon(f.eventId)).error).not.toBeNull();
  });
});

describe("profilo modificabile dal link personale", () => {
  it("nome, immagine e foto si cambiano solo in preparazione; l'email no", async () => {
    const f = await createFixture(admin, []);
    const token = await openSignup(f.eventId);
    const { data: personal } = await register(token, "Anna", { email: "anna@example.com" });
    await register(token, "Bruno");
    await register(token, "Carla");

    const profile = await anon.rpc("participant_profile", { p_token: personal! });
    expect(profile.data?.[0]).toMatchObject({ participant_name: "Anna", participant_avatar: "star", participant_photo_path: null, can_edit: true });

    const photo = await uploadAsAnon(f.eventId);
    const update = await anon.rpc("participant_update_profile", {
      p_token: personal!,
      p_name: "Anna Maria",
      p_avatar: "elf",
      p_photo_path: photo.path,
    });
    expect(update.error).toBeNull();
    const { data: row } = await admin.from("participants").select("name, avatar, photo_path, email").eq("event_id", f.eventId).eq("name", "Anna Maria").single();
    expect(row).toEqual({ name: "Anna Maria", avatar: "elf", photo_path: photo.path, email: "anna@example.com" });

    // Nome già usato da un altro iscritto
    const clash = await anon.rpc("participant_update_profile", { p_token: personal!, p_name: "bruno", p_avatar: "elf" });
    expect(clash.error?.message).toContain("participants_event_name_unique");

    // Rimozione della foto
    await anon.rpc("participant_update_profile", { p_token: personal!, p_name: "Anna Maria", p_avatar: "elf", p_remove_photo: true });
    expect((await anon.rpc("participant_profile", { p_token: personal! })).data?.[0]?.participant_photo_path).toBeNull();

    // Token inesistente
    const ghost = await anon.rpc("participant_update_profile", { p_token: "x".repeat(43), p_name: "X", p_avatar: "elf" });
    expect(ghost.error?.message).toContain("SS_NOT_FOUND");

    // Dopo l'estrazione è tutto bloccato
    const { data: ids } = await admin.from("participants").select("id").eq("event_id", f.eventId);
    const [a, b, c] = ids!.map((p) => p.id);
    await admin.rpc("save_draw", {
      p_event_id: f.eventId,
      p_pairs: [
        { giver_id: a, receiver_id: b },
        { giver_id: b, receiver_id: c },
        { giver_id: c, receiver_id: a },
      ],
    });
    expect((await anon.rpc("participant_profile", { p_token: personal! })).data?.[0]?.can_edit).toBe(false);
    const locked = await anon.rpc("participant_update_profile", { p_token: personal!, p_name: "Anna", p_avatar: "gift" });
    expect(locked.error?.message).toContain("SS_EVENT_LOCKED");
  });

  it("segnare l'email come inviata funziona solo con un token valido e una volta sola", async () => {
    const f = await createFixture(admin, []);
    const token = await openSignup(f.eventId);
    const { data: personal } = await register(token, "Dario");

    await anon.rpc("participant_mark_emailed", { p_token: "x".repeat(43) });
    let { data: row } = await admin.from("participants").select("invite_method, invited_at").eq("event_id", f.eventId).single();
    expect(row?.invite_method).toBeNull();

    expect((await anon.rpc("participant_mark_emailed", { p_token: personal! })).error).toBeNull();
    ({ data: row } = await admin.from("participants").select("invite_method, invited_at").eq("event_id", f.eventId).single());
    expect(row?.invite_method).toBe("email");
    expect(row?.invited_at).not.toBeNull();
  });

  it("le funzioni interne non sono eseguibili dai client", async () => {
    const f = await createFixture(admin, []);
    const internal = await anon.rpc("assert_photo_available" as never, {
      p_event_id: f.eventId,
      p_photo_path: "x",
      p_participant_id: f.eventId,
    } as never);
    expect((internal as { error: unknown }).error).not.toBeNull();
    const asUser = await user.rpc("photo_upload_allowed", { p_name: `${f.eventId}/x.png` });
    expect(asUser.error).not.toBeNull();
  });
});

describe("foto di copertina dell'evento", () => {
  it("la imposta solo l'admin e la vedono la pagina d'iscrizione e i link personali", async () => {
    const f = await createFixture(admin, ["A", "B", "C"]);
    const token = await openSignup(f.eventId);
    const cover = `${f.eventId}/cover-${crypto.randomUUID()}.png`;
    expect((await admin.storage.from("photos").upload(cover, png, { contentType: "image/png" })).error).toBeNull();

    // Percorso fuori dalla cartella dell'evento o senza prefisso: rifiutato
    const wrong = await admin.from("events").update({ cover_path: `${f.eventId}/${crypto.randomUUID()}.png` }).eq("id", f.eventId);
    expect(wrong.error?.code).toBe("23514");
    const user1 = await user.from("events").update({ cover_path: cover }).eq("id", f.eventId).select();
    expect(user1.data ?? []).toEqual([]);

    expect((await admin.from("events").update({ cover_path: cover }).eq("id", f.eventId)).error).toBeNull();
    expect((await anon.rpc("signup_info", { p_token: token })).data?.[0]?.event_cover_path).toBe(cover);
    expect((await anon.rpc("participant_status", { p_token: f.tokens.A })).data?.[0]?.event_cover_path).toBe(cover);

    // La copertina non può diventare la foto di un partecipante
    expect((await register(token, "Furbo", { photo: cover })).error?.message).toContain("SS_PHOTO_INVALID");
    // Gli anonimi non possono caricare file con nomi diversi da <uuid>.<ext>
    const anonCover = await anon.storage.from("photos").upload(`${f.eventId}/cover-${crypto.randomUUID()}.png`, png, { contentType: "image/png" });
    expect(anonCover.error).not.toBeNull();
  });
});
