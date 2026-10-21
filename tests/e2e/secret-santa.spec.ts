import { expect, test, type Page } from "@playwright/test";
import {
  addExclusion,
  addParticipant,
  clickAndConfirm,
  createEvent,
  login,
  loginAsAdmin,
  NON_ADMIN,
  participantCard,
  personalLink,
  TINY_PNG,
  uniqueName,
} from "./helpers";

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

test.describe("protezione dell'area amministrativa", () => {
  test("senza login le pagine admin reindirizzano al login", async ({ page }) => {
    for (const path of ["/admin", "/admin/eventi/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "/admin/eventi/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/abbinamenti"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login$/);
    }
    await expect(page.getByRole("heading", { name: "Area organizzatore" })).toBeVisible();
  });

  test("credenziali errate mostrano un errore chiaro", async ({ page }) => {
    await login(page, { email: "admin@example.com", password: "sbagliata-123" });
    await expect(page.getByRole("alert").filter({ hasText: "Email o password non corretti" })).toBeVisible();
  });

  test("un utente autenticato ma non amministratore non entra", async ({ page }) => {
    await login(page, NON_ADMIN);
    await expect(page.getByRole("alert").filter({ hasText: "non è autorizzato" })).toBeVisible();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("login e logout dell'amministratore", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("button", { name: "Esci" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});

test.describe("pagina del partecipante con link non valido", () => {
  test("link mancante o non valido", async ({ page }) => {
    await page.goto("/p");
    await expect(page.getByRole("heading", { name: "Manca il link personale" })).toBeVisible();
    await page.goto(`/p#${"x".repeat(43)}`);
    await expect(page.getByRole("heading", { name: "Link non valido" })).toBeVisible();
    await page.goto("/p#abc");
    await expect(page.getByRole("heading", { name: "Link non valido" })).toBeVisible();
  });
});

test("flusso completo: configurazione, estrazione segreta, pubblicazione e rivelazione", async ({ page, browser }) => {
  const suffix = Date.now().toString(36).slice(-4);
  const names = [`Ottavia ${suffix}`, `Gualtiero ${suffix}`, `Ermenegilda ${suffix}`, `Fortunato ${suffix}`];
  const [ottavia, gualtiero, ermenegilda, fortunato] = names;
  const eventName = uniqueName("Natale E2E");

  await loginAsAdmin(page);
  await createEvent(page, eventName);

  // Partecipanti
  for (const [index, name] of names.entries()) {
    await addParticipant(page, name, index < 2 ? `${name.split(" ")[0].toLowerCase()}.${suffix}@example.com` : "");
  }
  await expect(page.getByTestId("participant-card")).toHaveCount(4);

  // Validazione: nome duplicato rifiutato con messaggio chiaro
  const addForm = page.getByTestId("add-participant-form");
  await addForm.getByLabel("Nome").fill(ottavia);
  await addForm.getByRole("button", { name: /Aggiungi partecipante/ }).click();
  await expect(addForm.getByRole("alert")).toContainText("Esiste già un partecipante con questo nome");
  await addForm.getByLabel("Nome").fill("");

  // Modifica partecipante: email e foto
  const card = participantCard(page, fortunato);
  await card.getByRole("button", { name: /Modifica/ }).click();
  // Validazione lato client: il browser blocca un'email non valida prima dell'invio
  // (la validazione lato server è coperta dai test unitari).
  await card.getByLabel("Email (facoltativa)").fill("email-non-valida");
  await card.getByRole("button", { name: "Salva modifiche" }).click();
  expect(await card.getByLabel("Email (facoltativa)").evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);
  await card.getByLabel("Email (facoltativa)").fill(`fortunato.${suffix}@example.com`);
  await card.getByRole("button", { name: "Salva modifiche" }).click();
  await expect(card.getByText(`fortunato.${suffix}@example.com`, { exact: true })).toBeVisible();

  await card.getByLabel("Carica una nuova foto").setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: TINY_PNG });
  await card.getByRole("button", { name: /Carica foto/ }).click();
  await expect(card.getByRole("img", { name: `Foto di ${fortunato}` }).first()).toBeVisible();

  // Esclusioni: Ottavia ↔ Gualtiero (coppia) e Ermenegilda → Fortunato
  await addExclusion(page, ottavia, gualtiero, true);
  await expect(page.getByTestId("exclusion-list")).toContainText("non si fanno il regalo a vicenda");
  await addExclusion(page, ermenegilda, fortunato, false);
  await expect(page.getByTestId("exclusion-list")).toContainText(`${ermenegilda} non regala a ${fortunato}`);
  await expect(page.getByText("Tutto pronto per l'estrazione")).toBeVisible();
  await shot(page, "01-admin-evento-draft");

  // Link personale di Ermenegilda (prima dell'estrazione)
  const ermenegildaLink = await personalLink(page, ermenegilda);
  expect(ermenegildaLink).toMatch(/\/p#[A-Za-z0-9_-]{43}$/);

  // Invito manuale: copia del messaggio e stato "Invito copiato"
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const gCard = participantCard(page, gualtiero);
  await gCard.getByRole("button", { name: /Invito/ }).click();
  await gCard.getByRole("button", { name: "Copia messaggio" }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain(`Ciao ${gualtiero}! 🎅 Quest'anno partecipi al nostro Secret Santa`);
  expect(clipboard.match(/\/p#/g)).toHaveLength(1);
  await expect(gCard.getByText("Invito copiato")).toBeVisible();

  // Estrazione segreta
  await clickAndConfirm(page, /Genera estrazione/, "Estrai ora");
  await expect(page.getByText("Estrazione completata, ancora segreta")).toBeVisible();
  await expect(page.getByText("Estratto · segreto").first()).toBeVisible();
  // Dopo l'estrazione non si possono aggiungere/eliminare partecipanti
  await expect(page.getByTestId("add-participant-form")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Elimina$/ })).toHaveCount(0);

  // Il partecipante NON vede nulla prima della pubblicazione (nemmeno nelle risposte di rete)
  const participantContext = await browser.newContext();
  const participant = await participantContext.newPage();
  const bodies: string[] = [];
  participant.on("response", async (response) => {
    if (response.request().method() === "POST") bodies.push(await response.text().catch(() => ""));
  });
  await participant.goto(ermenegildaLink);
  await expect(participant.getByRole("heading", { name: `Ciao ${ermenegilda}!` })).toBeVisible();
  await expect(participant.getByTestId("waiting-message")).toContainText(
    "L'estrazione è pronta, ma Babbo Natale non ha ancora dato il via libera. Torna più tardi!",
  );
  await expect(participant.getByRole("button", { name: /Scopri/ })).toHaveCount(0);
  await shot(participant, "02-partecipante-attesa");
  const html = await participant.content();
  for (const other of [ottavia, gualtiero, fortunato]) {
    expect(html).not.toContain(other);
    for (const body of bodies) expect(body).not.toContain(other);
  }

  // Verifica privata degli abbinamenti
  await page.getByRole("link", { name: /Verifica abbinamenti/ }).click();
  const table = page.getByTestId("assignments-table");
  await expect(table.locator("tbody tr")).toHaveCount(4);
  await expect(table).toContainText("Non pubblicato");
  const pairs = new Map<string, string>();
  for (const row of await table.locator("tbody tr").all()) {
    const giverCell = await row.locator("td").nth(0).innerText();
    const receiverCell = await row.locator("td").nth(1).innerText();
    pairs.set(names.find((n) => giverCell.includes(n))!, names.find((n) => receiverCell.includes(n))!);
  }
  // Vincoli rispettati
  expect(new Set(pairs.values()).size).toBe(4);
  expect(pairs.get(ottavia)).not.toBe(gualtiero);
  expect(pairs.get(gualtiero)).not.toBe(ottavia);
  expect(pairs.get(ermenegilda)).not.toBe(fortunato);
  for (const [giver, receiver] of pairs) expect(giver).not.toBe(receiver);
  await shot(page, "03-admin-abbinamenti");
  await page.getByRole("link", { name: /Torna all'evento/ }).click();

  // Pubblicazione
  await clickAndConfirm(page, /Pubblica estrazione/, "Pubblica");
  await expect(page.getByText("Estrazione pubblicata").first()).toBeVisible();

  // Il partecipante ora scopre SOLO il proprio destinatario
  await participant.reload();
  await participant.getByRole("button", { name: /Scopri a chi fai il regalo/ }).click();
  const revealed = participant.getByTestId("revealed-recipient");
  await expect(revealed).toBeVisible();
  const expected = pairs.get(ermenegilda)!;
  await expect(revealed.getByRole("heading", { name: expected })).toBeVisible();
  await shot(participant, "04-partecipante-rivelazione");
  const others = names.filter((n) => n !== ermenegilda && n !== expected);
  const revealedHtml = await participant.content();
  for (const other of others) expect(revealedHtml).not.toContain(other);
  await participantContext.close();

  // L'admin vede che Ermenegilda ha scoperto il destinatario
  await page.reload();
  await expect(participantCard(page, ermenegilda).getByText("Ha scoperto il destinatario")).toBeVisible();
  await expect(page.getByText("1 su 4 partecipanti")).toBeVisible();

  // Annullamento sicuro: nome sbagliato rifiutato
  await page.getByText("Procedura sicura").click();
  await page.getByLabel(/Per confermare scrivi il nome/).fill("nome sbagliato");
  await page.getByRole("button", { name: "Annulla l'estrazione pubblicata" }).click();
  await expect(page.getByText("non corrisponde a quello dell'evento")).toBeVisible();

  // Chiusura evento
  await clickAndConfirm(page, /Chiudi evento/, "Chiudi evento");
  await expect(page.getByText("Evento chiuso").first()).toBeVisible();
  await shot(page, "05-admin-chiuso");
});

test("estrazione impossibile: diagnosi chiara e nessun salvataggio", async ({ page }) => {
  const suffix = Date.now().toString(36).slice(-4);
  const [a, b, c] = [`Primo ${suffix}`, `Secondo ${suffix}`, `Terzo ${suffix}`];
  await loginAsAdmin(page);
  await createEvent(page, uniqueName("Impossibile"));

  await addParticipant(page, a);
  await addParticipant(page, b);
  await expect(page.getByTestId("feasibility-problems")).toContainText("Servono almeno 3 partecipanti");
  await addParticipant(page, c);

  // Con 3 persone, se A e B non possono regalarsi a vicenda nessuna estrazione è valida.
  await addExclusion(page, a, b, true);
  await expect(page.getByTestId("feasibility-problems")).toBeVisible();
  await shot(page, "06-admin-impossibile");

  await clickAndConfirm(page, /Genera estrazione/, "Estrai ora");
  await expect(page.getByRole("alert").filter({ hasText: "Nessuna estrazione valida" })).toBeVisible();
  await expect(page.getByText("In preparazione").first()).toBeVisible();

  // Rimuovendo l'esclusione l'estrazione torna possibile
  await page.getByTestId("exclusion-list").getByRole("button", { name: "Rimuovi" }).click();
  await expect(page.getByText("Tutto pronto per l'estrazione")).toBeVisible();

  // Eliminazione di un partecipante e dell'evento
  await participantCard(page, c).getByRole("button", { name: /Elimina/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Elimina" }).click();
  await expect(page.getByTestId("participant-card")).toHaveCount(2);
  await clickAndConfirm(page, /Elimina evento/, "Elimina definitivamente");
  await expect(page.getByRole("heading", { name: "I tuoi Secret Santa" })).toBeVisible();
});

test("annullamento sicuro di un'estrazione pubblicata e nuova estrazione", async ({ page, browser }) => {
  const suffix = Date.now().toString(36).slice(-4);
  const eventName = uniqueName("Rifacciamo");
  const people = [`Uno ${suffix}`, `Due ${suffix}`, `Tre ${suffix}`];
  await loginAsAdmin(page);
  await createEvent(page, eventName);
  for (const name of people) await addParticipant(page, name);
  const link = await personalLink(page, people[0]);

  await clickAndConfirm(page, /Genera estrazione/, "Estrai ora");
  await clickAndConfirm(page, /Pubblica estrazione/, "Pubblica");
  await expect(page.getByText("Estrazione pubblicata").first()).toBeVisible();

  await page.getByText("Procedura sicura").click();
  await page.getByLabel(/Per confermare scrivi il nome/).fill(eventName);
  await page.getByRole("button", { name: "Annulla l'estrazione pubblicata" }).click();
  await expect(page.getByText("In preparazione").first()).toBeVisible();
  await expect(page.getByTestId("add-participant-form")).toBeVisible();

  // Dopo l'annullamento il partecipante torna a non vedere nulla
  const context = await browser.newContext();
  const participant = await context.newPage();
  await participant.goto(link);
  await expect(participant.getByTestId("waiting-message")).toBeVisible();
  await context.close();

  // Nuova estrazione e annullamento semplice (non pubblicata)
  await clickAndConfirm(page, /Genera estrazione/, "Estrai ora");
  await expect(page.getByText("Estrazione completata, ancora segreta")).toBeVisible();
  await clickAndConfirm(page, /Annulla estrazione/, "Annulla estrazione");
  await expect(page.getByText("In preparazione").first()).toBeVisible();
});

test("invio automatico delle email (SMTP locale Mailpit): un messaggio per persona con il solo proprio link", async ({ page, request }) => {
  const mailpit = "http://127.0.0.1:54324";
  const suffix = Date.now().toString(36);
  const people = [`Posta ${suffix}`, `Lettera ${suffix}`, `Senzamail ${suffix}`];
  const emails = [`posta.${suffix}@example.com`, `lettera.${suffix}@example.com`];

  await loginAsAdmin(page);
  await createEvent(page, uniqueName("Email"));
  await addParticipant(page, people[0], emails[0]);
  await addParticipant(page, people[1], emails[1]);
  await addParticipant(page, people[2]);
  await expect(page.getByText("Invio automatico attivo")).toBeVisible();

  const links = [await personalLink(page, people[0]), await personalLink(page, people[1])];

  // Invio singolo
  const card = participantCard(page, people[0]);
  await card.getByRole("button", { name: /Invito/ }).click();
  await card.getByRole("button", { name: /Invia email automatica/ }).click();
  await expect(page.getByText(`Email inviata a ${people[0]}`)).toBeVisible();
  await expect(card.getByText("Email inviata")).toBeVisible();

  // Invio a chi manca: solo Lettera (Posta l'ha già ricevuta, Senzamail non ha indirizzo)
  await clickAndConfirm(page, "Invia a chi manca", "Invia");
  await expect(page.getByText(/Email inviate: 1\. Senza indirizzo/)).toBeVisible();

  for (const [index, address] of emails.entries()) {
    const search = await request.get(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    expect(messages).toHaveLength(1);
    const message = (await (await request.get(`${mailpit}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string; HTML: string };
    expect(message.Text).toContain(links[index]);
    expect(message.Text).toContain(`Ciao ${people[index]}!`);
    expect(message.Text).not.toContain(links[1 - index].split("#")[1]);
    expect(message.HTML).not.toContain(links[1 - index].split("#")[1]);
  }
});
