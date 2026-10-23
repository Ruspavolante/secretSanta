import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFixture, newClient, newOrganizer, pairs, userClient, type Client } from "./helpers";

const TABLES = ["events", "participants", "invite_tokens", "exclusions", "assignments", "admins"] as const;

let admin: Client;
let user: Client;
let anon: Client;

beforeAll(async () => {
  user = await userClient();
  anon = newClient();
});

// Ogni test usa un organizzatore appena registrato (proprietario dei propri eventi).
beforeEach(async () => {
  admin = await newOrganizer();
});

const CYCLE = (a: string, b: string, c: string, d: string): [string, string][] => [
  [a, b],
  [b, c],
  [c, d],
  [d, a],
];

describe("Row Level Security e permessi", () => {
  it("anon non può leggere nessuna tabella", async () => {
    for (const table of TABLES) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(error?.code, table).toBe("42501");
      expect(data).toBeNull();
    }
  });

  it("anon non può scrivere né chiamare le funzioni amministrative", async () => {
    const insert = await anon.from("events").insert({ name: "Hack" });
    expect(insert.error?.code).toBe("42501");
    for (const fn of ["publish_event", "close_event"] as const) {
      const { error } = await anon.rpc(fn, { p_event_id: crypto.randomUUID() });
      expect(error, fn).not.toBeNull();
    }
    const draw = await anon.rpc("save_draw", { p_event_id: crypto.randomUUID(), p_pairs: [] });
    expect(draw.error).not.toBeNull();
  });

  it("un altro organizzatore non vede né modifica gli eventi altrui", async () => {
    const fixture = await createFixture(admin, ["A", "B", "C"]);
    const other = await newOrganizer();
    for (const table of TABLES.filter((t) => t !== "admins")) {
      const { data, error } = await other.from(table).select("*");
      expect(error, table).toBeNull();
      expect(data, table).toEqual([]);
    }
    const update = await other.from("participants").update({ name: "Hack" }).eq("id", fixture.ids.A).select();
    expect(update.data ?? []).toEqual([]);
    const del = await other.from("events").delete().eq("id", fixture.eventId).select();
    expect(del.data ?? []).toEqual([]);
    const intruder = await other.from("participants").insert({ event_id: fixture.eventId, name: "Intruso" });
    expect(intruder.error).not.toBeNull();
    const exclusion = await other.from("exclusions").insert({ event_id: fixture.eventId, giver_id: fixture.ids.A, receiver_id: fixture.ids.B });
    expect(exclusion.error).not.toBeNull();

    const draw = await other.rpc("save_draw", { p_event_id: fixture.eventId, p_pairs: pairs(fixture, [["A", "B"], ["B", "C"], ["C", "A"]]) });
    expect(draw.error?.message).toContain("SS_FORBIDDEN");
    for (const fn of ["publish_event", "close_event", "regenerate_signup_token"] as const) {
      expect((await other.rpc(fn, { p_event_id: fixture.eventId })).error?.message, fn).toContain("SS_FORBIDDEN");
    }
    expect((await other.rpc("reset_draw", { p_event_id: fixture.eventId })).error?.message).toContain("SS_FORBIDDEN");
    expect((await other.rpc("set_signup_open", { p_event_id: fixture.eventId, p_open: true })).error?.message).toContain("SS_FORBIDDEN");
    expect((await other.rpc("regenerate_invite_token", { p_participant_id: fixture.ids.A })).error?.message).toContain("SS_FORBIDDEN");

    // L'evento esiste ancora ed è intatto
    const { data } = await admin.from("events").select("status").eq("id", fixture.eventId).single();
    expect(data?.status).toBe("DRAFT");
    const { data: people } = await admin.from("participants").select("name").eq("event_id", fixture.eventId);
    expect(people?.map((p) => p.name).sort()).toEqual(["A", "B", "C"]);
  });

  it("ogni organizzatore crea e gestisce i propri eventi, che restano invisibili agli altri", async () => {
    const other = await newOrganizer();
    const mine = await createFixture(other, ["X", "Y", "Z"]);
    const { data: owned } = await other.from("events").select("id, created_by");
    expect(owned?.map((e) => e.id)).toEqual([mine.eventId]);

    // Non può intestare un evento a un altro utente
    const { data: userId } = await admin.auth.getUser();
    const spoof = await other.from("events").insert({ name: "Finto", created_by: userId.user!.id } as never);
    expect(spoof.error).not.toBeNull();

    const draw = await other.rpc("save_draw", { p_event_id: mine.eventId, p_pairs: pairs(mine, [["X", "Y"], ["Y", "Z"], ["Z", "X"]]) });
    expect(draw.error).toBeNull();
    expect((await other.rpc("publish_event", { p_event_id: mine.eventId })).error).toBeNull();

    expect((await admin.from("events").select("id").eq("id", mine.eventId)).data).toEqual([]);
    expect((await user.from("events").select("id").eq("id", mine.eventId)).data).toEqual([]);
  });

  it("limiti anti-abuso: 20 eventi per organizzatore e 100 partecipanti per evento", async () => {
    for (let i = 0; i < 20; i++) {
      expect((await admin.from("events").insert({ name: `Evento ${i}` })).error).toBeNull();
    }
    const extra = await admin.from("events").insert({ name: "Ventunesimo" });
    expect(extra.error?.message).toContain("SS_TOO_MANY_EVENTS");

    const other = await newOrganizer();
    const f = await createFixture(other, Array.from({ length: 100 }, (_, i) => `P${i}`));
    const overflow = await other.from("participants").insert({ event_id: f.eventId, name: "Centunesimo" });
    expect(overflow.error?.message).toContain("SS_EVENT_FULL");
  });

  it("eliminare il proprio account elimina i propri eventi e nient'altro", async () => {
    const other = await newOrganizer();
    const mine = await createFixture(other, ["X", "Y", "Z"]);
    const theirs = await createFixture(admin, ["A", "B", "C"]);
    expect((await anon.rpc("delete_my_account")).error).not.toBeNull();

    expect((await other.rpc("delete_my_account")).error).toBeNull();
    expect((await anon.rpc("participant_status", { p_token: mine.tokens.X })).data).toEqual([]);
    expect((await admin.from("events").select("id").eq("id", theirs.eventId)).data).toHaveLength(1);
    // L'account eliminato non può più creare eventi
    const after = await other.from("events").insert({ name: "Fantasma" });
    expect(after.error).not.toBeNull();
  });

  it("anche l'admin non può cambiare lo stato o scrivere abbinamenti saltando le funzioni", async () => {
    const fixture = await createFixture(admin, ["A", "B", "C"]);
    const status = await admin.from("events").update({ status: "PUBLISHED" } as never).eq("id", fixture.eventId);
    expect(status.error?.code).toBe("42501");
    const assignment = await admin
      .from("assignments")
      .insert({ event_id: fixture.eventId, giver_id: fixture.ids.A, receiver_id: fixture.ids.B } as never);
    expect(assignment.error?.code).toBe("42501");
    const token = await admin.from("invite_tokens").update({ token: "x".repeat(43) } as never).eq("participant_id", fixture.ids.A);
    expect(token.error?.code).toBe("42501");
  });
});

describe("vincoli del database", () => {
  it("rifiuta nomi duplicati, email non valide e foto fuori dalla cartella dell'evento", async () => {
    const fixture = await createFixture(admin, ["Mario", "Giulia", "Luca"]);
    const dup = await admin.from("participants").insert({ event_id: fixture.eventId, name: "mario" });
    expect(dup.error?.code).toBe("23505");
    const email = await admin.from("participants").insert({ event_id: fixture.eventId, name: "Sara", email: "non valida" });
    expect(email.error?.code).toBe("23514");
    const photo = await admin.from("participants").update({ photo_path: "altro-evento/x.jpg" }).eq("id", fixture.ids.Mario);
    expect(photo.error?.code).toBe("23514");
    const self = await admin
      .from("exclusions")
      .insert({ event_id: fixture.eventId, giver_id: fixture.ids.Mario, receiver_id: fixture.ids.Mario });
    expect(self.error?.code).toBe("23514");
  });

  it("le esclusioni non possono collegare partecipanti di eventi diversi", async () => {
    const one = await createFixture(admin, ["A", "B", "C"]);
    const two = await createFixture(admin, ["X", "Y", "Z"]);
    const cross = await admin.from("exclusions").insert({ event_id: one.eventId, giver_id: one.ids.A, receiver_id: two.ids.X });
    expect(cross.error?.code).toBe("23503");
  });

  it("ogni partecipante riceve un token casuale di 43 caratteri, unico", async () => {
    const fixture = await createFixture(admin, ["A", "B", "C", "D"]);
    const tokens = Object.values(fixture.tokens);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});

describe("save_draw rivalida l'estrazione", () => {
  it("rifiuta auto-assegnazioni, destinatari duplicati, partecipanti mancanti o estranei", async () => {
    const f = await createFixture(admin, ["A", "B", "C", "D"]);
    const other = await createFixture(admin, ["X", "Y", "Z"]);
    const attempts = [
      pairs(f, [["A", "A"], ["B", "C"], ["C", "D"], ["D", "B"]]), // auto-assegnazione
      pairs(f, [["A", "B"], ["B", "A"], ["C", "A"], ["D", "C"]]), // destinatario duplicato
      pairs(f, [["A", "B"], ["B", "C"], ["C", "A"]]), // manca D
      [...pairs(f, [["A", "B"], ["B", "C"], ["C", "A"]]), { giver_id: f.ids.D, receiver_id: other.ids.X }], // estraneo
      [],
    ];
    for (const attempt of attempts) {
      const { error } = await admin.rpc("save_draw", { p_event_id: f.eventId, p_pairs: attempt });
      expect(error?.message).toContain("SS_INVALID_DRAW");
    }
    const { data } = await admin.from("assignments").select("*").eq("event_id", f.eventId);
    expect(data).toEqual([]);
  });

  it("rifiuta un'estrazione che viola un'esclusione", async () => {
    const f = await createFixture(admin, ["A", "B", "C", "D"]);
    await admin.from("exclusions").insert({ event_id: f.eventId, giver_id: f.ids.A, receiver_id: f.ids.B });
    const { error } = await admin.rpc("save_draw", { p_event_id: f.eventId, p_pairs: pairs(f, CYCLE("A", "B", "C", "D")) });
    expect(error?.message).toContain("SS_DRAW_VIOLATES_EXCLUSIONS");
    const ok = await admin.rpc("save_draw", { p_event_id: f.eventId, p_pairs: pairs(f, CYCLE("A", "C", "B", "D")) });
    expect(ok.error).toBeNull();
  });

  it("richiede almeno 3 partecipanti", async () => {
    const f = await createFixture(admin, ["A", "B"]);
    const { error } = await admin.rpc("save_draw", { p_event_id: f.eventId, p_pairs: pairs(f, [["A", "B"], ["B", "A"]]) });
    expect(error?.message).toContain("SS_TOO_FEW_PARTICIPANTS");
  });
});

describe("stati dell'evento e accesso dei partecipanti", () => {
  it("ciclo completo: niente risultati prima della pubblicazione, solo il proprio dopo", async () => {
    const f = await createFixture(admin, ["A", "B", "C", "D"]);

    // Token non valido o malformato: nessun dato
    expect((await anon.rpc("participant_status", { p_token: "x".repeat(43) })).data).toEqual([]);
    expect((await anon.rpc("participant_status", { p_token: "' or 1=1 --" })).data).toEqual([]);
    expect((await anon.rpc("participant_reveal", { p_token: "" })).data).toEqual([]);

    // DRAFT
    const status = await anon.rpc("participant_status", { p_token: f.tokens.A });
    expect(status.data?.[0]).toMatchObject({ participant_name: "A", event_status: "DRAFT", has_revealed: false });
    expect((await anon.rpc("participant_reveal", { p_token: f.tokens.A })).data).toEqual([
      { event_status: "DRAFT", recipient_name: null, recipient_avatar: null, recipient_photo_path: null },
    ]);

    // Pubblicare senza estrazione non è consentito
    expect((await admin.rpc("publish_event", { p_event_id: f.eventId })).error?.message).toContain("SS_INVALID_STATE");

    // DRAWN: ancora nessun risultato
    expect((await admin.rpc("save_draw", { p_event_id: f.eventId, p_pairs: pairs(f, CYCLE("A", "B", "C", "D")) })).error).toBeNull();
    expect((await anon.rpc("participant_reveal", { p_token: f.tokens.A })).data).toEqual([
      { event_status: "DRAWN", recipient_name: null, recipient_avatar: null, recipient_photo_path: null },
    ]);
    expect((await admin.rpc("close_event", { p_event_id: f.eventId })).error?.message).toContain("SS_INVALID_STATE");

    // Dopo l'estrazione: niente aggiunte/eliminazioni di partecipanti o esclusioni, ma i nomi si possono correggere
    expect((await admin.from("participants").insert({ event_id: f.eventId, name: "E" })).error?.message).toContain("SS_EVENT_LOCKED");
    expect((await admin.from("participants").delete().eq("id", f.ids.A)).error?.message).toContain("SS_EVENT_LOCKED");
    expect(
      (await admin.from("exclusions").insert({ event_id: f.eventId, giver_id: f.ids.A, receiver_id: f.ids.C })).error?.message,
    ).toContain("SS_EVENT_LOCKED");
    expect((await admin.from("participants").update({ email: "a@example.com" }).eq("id", f.ids.A)).error).toBeNull();

    // PUBLISHED: ognuno vede solo il proprio destinatario
    expect((await admin.rpc("publish_event", { p_event_id: f.eventId })).error).toBeNull();
    const expected: Record<string, string> = { A: "B", B: "C", C: "D", D: "A" };
    for (const [giver, receiver] of Object.entries(expected)) {
      const { data } = await anon.rpc("participant_reveal", { p_token: f.tokens[giver] });
      expect(data).toHaveLength(1);
      expect(data?.[0]).toMatchObject({ event_status: "PUBLISHED", recipient_name: receiver });
    }
    const after = await anon.rpc("participant_status", { p_token: f.tokens.A });
    expect(after.data?.[0].has_revealed).toBe(true);

    const { data: tracked } = await admin.from("participants").select("name, opened_at, revealed_at").eq("event_id", f.eventId);
    for (const row of tracked ?? []) {
      expect(row.opened_at, row.name).not.toBeNull();
      expect(row.revealed_at, row.name).not.toBeNull();
    }

    // Annullamento di un'estrazione pubblicata: serve il nome esatto dell'evento
    const { data: event } = await admin.from("events").select("name").eq("id", f.eventId).single();
    expect((await admin.rpc("reset_draw", { p_event_id: f.eventId })).error?.message).toContain("SS_CONFIRMATION_MISMATCH");
    expect((await admin.rpc("reset_draw", { p_event_id: f.eventId, p_confirmation: "sbagliato" })).error?.message).toContain(
      "SS_CONFIRMATION_MISMATCH",
    );
    expect((await admin.rpc("reset_draw", { p_event_id: f.eventId, p_confirmation: ` ${event!.name.toUpperCase()} ` })).error).toBeNull();
    expect((await admin.from("assignments").select("*").eq("event_id", f.eventId)).data).toEqual([]);
    expect((await anon.rpc("participant_reveal", { p_token: f.tokens.A })).data?.[0].recipient_name).toBeNull();

    // Nuova estrazione, pubblicazione e chiusura
    expect((await admin.rpc("save_draw", { p_event_id: f.eventId, p_pairs: pairs(f, CYCLE("A", "C", "B", "D")) })).error).toBeNull();
    expect((await admin.rpc("publish_event", { p_event_id: f.eventId })).error).toBeNull();
    expect((await admin.rpc("close_event", { p_event_id: f.eventId })).error).toBeNull();
    expect((await anon.rpc("participant_reveal", { p_token: f.tokens.A })).data?.[0]).toMatchObject({ event_status: "CLOSED", recipient_name: "C" });

    // CLOSED: l'estrazione non si può più rifare né modificare
    expect((await admin.rpc("save_draw", { p_event_id: f.eventId, p_pairs: pairs(f, CYCLE("A", "B", "C", "D")) })).error?.message).toContain("SS_INVALID_STATE");
    expect((await admin.from("participants").update({ name: "Nuovo" }).eq("id", f.ids.A)).error?.message).toContain("SS_EVENT_CLOSED");
  });

  it("rigenerare il link invalida quello precedente", async () => {
    const f = await createFixture(admin, ["A", "B", "C"]);
    const { data: newToken, error } = await admin.rpc("regenerate_invite_token", { p_participant_id: f.ids.A });
    expect(error).toBeNull();
    expect(newToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken).not.toBe(f.tokens.A);
    expect((await anon.rpc("participant_status", { p_token: f.tokens.A })).data).toEqual([]);
    expect((await anon.rpc("participant_status", { p_token: newToken! })).data?.[0].participant_name).toBe("A");
  });

  it("eliminare un evento pubblicato elimina tutto in cascata", async () => {
    const f = await createFixture(admin, ["A", "B", "C"]);
    await admin.rpc("save_draw", { p_event_id: f.eventId, p_pairs: pairs(f, [["A", "B"], ["B", "C"], ["C", "A"]]) });
    await admin.rpc("publish_event", { p_event_id: f.eventId });
    const { error } = await admin.from("events").delete().eq("id", f.eventId);
    expect(error).toBeNull();
    expect((await admin.from("participants").select("id").eq("event_id", f.eventId)).data).toEqual([]);
    expect((await anon.rpc("participant_status", { p_token: f.tokens.A })).data).toEqual([]);
  });
});

describe("concorrenza", () => {
  it("un'aggiunta di partecipante concorrente non lascia mai un'estrazione incompleta", async () => {
    for (let round = 0; round < 5; round++) {
      const f = await createFixture(admin, ["A", "B", "C"]);
      const [draw, insert] = await Promise.all([
        admin.rpc("save_draw", { p_event_id: f.eventId, p_pairs: pairs(f, [["A", "B"], ["B", "C"], ["C", "A"]]) }),
        admin.from("participants").insert({ event_id: f.eventId, name: "Ritardatario" }),
      ]);
      // Esattamente una delle due operazioni può riuscire.
      expect(Boolean(draw.error) !== Boolean(insert.error)).toBe(true);

      const [{ data: event }, { count: participants }, { count: assignments }] = await Promise.all([
        admin.from("events").select("status").eq("id", f.eventId).single(),
        admin.from("participants").select("*", { count: "exact", head: true }).eq("event_id", f.eventId),
        admin.from("assignments").select("*", { count: "exact", head: true }).eq("event_id", f.eventId),
      ]);
      if (event?.status === "DRAWN") expect(assignments).toBe(participants);
      else expect(assignments).toBe(0);
      // La pubblicazione accetta solo estrazioni complete
      const publish = await admin.rpc("publish_event", { p_event_id: f.eventId });
      expect(Boolean(publish.error)).toBe(event?.status !== "DRAWN");
    }
  });

  it("due pubblicazioni simultanee: una sola riesce", async () => {
    const f = await createFixture(admin, ["A", "B", "C"]);
    await admin.rpc("save_draw", { p_event_id: f.eventId, p_pairs: pairs(f, [["A", "B"], ["B", "C"], ["C", "A"]]) });
    const results = await Promise.all([1, 2, 3].map(() => admin.rpc("publish_event", { p_event_id: f.eventId })));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
  });
});

describe("storage delle fotografie", () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  it("solo l'admin può caricare ed eliminare foto (gli anonimi solo negli eventi in preparazione)", async () => {
    const f = await createFixture(admin, ["A", "B", "C"]);
    const path = `${f.eventId}/${crypto.randomUUID()}.png`;

    // Cartella di un evento inesistente: rifiutato anche per anon (vedi signup.test.ts per gli eventi DRAFT)
    const ghost = `${crypto.randomUUID()}/${crypto.randomUUID()}.png`;
    expect((await anon.storage.from("photos").upload(ghost, png, { contentType: "image/png" })).error).not.toBeNull();
    expect((await user.storage.from("photos").upload(path, png, { contentType: "image/png" })).error).not.toBeNull();
    expect((await admin.storage.from("photos").upload(path, png, { contentType: "image/png" })).error).toBeNull();

    // Lettura pubblica tramite URL non indovinabile; elenco dei file negato agli anonimi
    const publicUrl = anon.storage.from("photos").getPublicUrl(path).data.publicUrl;
    expect((await fetch(publicUrl)).status).toBe(200);
    expect((await anon.storage.from("photos").list(f.eventId)).data ?? []).toEqual([]);

    // Un file non immagine viene rifiutato dal bucket
    const html = await admin.storage.from("photos").upload(`${f.eventId}/x.html`, "<html></html>", { contentType: "text/html" });
    expect(html.error).not.toBeNull();

    await user.storage.from("photos").remove([path]);
    expect((await fetch(publicUrl)).status).toBe(200);
    expect((await admin.storage.from("photos").remove([path])).error).toBeNull();
    expect((await fetch(publicUrl)).status).not.toBe(200);
  });
});
