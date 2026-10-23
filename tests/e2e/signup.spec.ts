import { expect, test, type Browser, type Page } from "@playwright/test";
import { addExclusion, clickAndConfirm, createEvent, loginAsAdmin, participantCard, TINY_PNG, uniqueName } from "./helpers";

const MAILPIT = "http://127.0.0.1:54324";
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: true });

async function signUp(browser: Browser, link: string, name: string, email: string, withPhoto = false) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(link);
  const form = page.getByTestId("signup-form");
  await form.getByLabel("Il tuo nome").fill(name);
  await form.getByLabel("La tua email").fill(email);
  if (withPhoto) await form.getByLabel(/La tua foto/).setInputFiles({ name: "io.png", mimeType: "image/png", buffer: TINY_PNG });
  await form.getByRole("button", { name: /Partecipo/ }).click();
  const done = page.getByTestId("signup-done");
  await expect(done.getByRole("heading", { name: `Sei dentro, ${name}!` })).toBeVisible();
  const personal = await done.getByLabel("Il tuo link personale").inputValue();
  return { context, page, personal };
}

test("iscrizione dal link di gruppo: copertina, citazioni, email, modifica del profilo ed estrazione", async ({ page, browser, request }) => {
  const suffix = Date.now().toString(36);
  const [anna, bruno, carla, dario] = ["Anna", "Bruno", "Carla", "Dario"].map((n) => `${n} ${suffix}`);
  const email = (name: string) => `${name.split(" ")[0].toLowerCase()}.${suffix}@example.com`;
  const eventName = uniqueName("Iscrizioni");

  // L'admin crea l'evento, carica la copertina e apre le iscrizioni
  await loginAsAdmin(page);
  await createEvent(page, eventName);
  const cover = page.getByTestId("cover-panel");
  await cover.getByLabel("Carica una foto").setInputFiles({ name: "copertina.png", mimeType: "image/png", buffer: TINY_PNG });
  await cover.getByRole("button", { name: /Carica copertina/ }).click();
  await expect(cover.getByRole("img", { name: `Copertina di ${eventName}` })).toBeVisible();

  await page.getByRole("button", { name: /Apri le iscrizioni/ }).click();
  const signupPanel = page.getByTestId("signup-panel");
  await expect(signupPanel.getByText("Iscrizioni aperte")).toBeVisible();
  const signupLink = await signupPanel.getByLabel("Link d'iscrizione").inputValue();
  expect(signupLink).toMatch(/\/iscrizione#[A-Za-z0-9_-]{43}$/);

  // Il messaggio per il gruppo contiene solo il link d'iscrizione
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signupPanel.getByRole("button", { name: "Copia messaggio per il gruppo" }).click();
  const groupMessage = await page.evaluate(() => navigator.clipboard.readText());
  expect(groupMessage).toContain(signupLink);
  expect(groupMessage).not.toContain("/p#");

  // Anna si iscrive con la foto: vede copertina, citazione e il proprio link
  const first = await signUp(browser, signupLink, anna, email(anna), true);
  await expect(first.page.getByTestId("event-cover")).toBeVisible();
  await expect(first.page.getByTestId("quote-banner")).toBeVisible();
  await expect(first.page.getByTestId("signup-done")).toContainText(`Ti abbiamo inviato il link personale a ${email(anna)}`);
  expect(first.personal).toMatch(/\/p#[A-Za-z0-9_-]{43}$/);
  await shot(first.page, "10-iscrizione-completata");

  // "Un'altra citazione" ne mostra una diversa
  const banner = first.page.getByTestId("quote-banner");
  const before = await banner.locator("blockquote").innerText();
  await banner.getByRole("button", { name: /altra citazione/ }).click();
  await expect(banner.locator("blockquote")).not.toHaveText(before);

  // La stessa email non può iscriversi due volte
  const again = await browser.newContext();
  const againPage = await again.newPage();
  await againPage.goto(signupLink);
  const againForm = againPage.getByTestId("signup-form");
  await againForm.getByLabel("Il tuo nome").fill(`Altra ${suffix}`);
  await againForm.getByLabel("La tua email").fill(email(anna).toUpperCase());
  await againForm.getByRole("button", { name: /Partecipo/ }).click();
  await expect(againForm.getByRole("alert")).toContainText("Questa email è già iscritta");
  await again.close();

  const others = [];
  for (const name of [bruno, carla, dario]) others.push(await signUp(browser, signupLink, name, email(name)));

  // L'email di Anna contiene solo il suo link personale
  const search = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email(anna)}`)}`);
  const { messages } = (await search.json()) as { messages: { ID: string }[] };
  expect(messages).toHaveLength(1);
  const message = (await (await request.get(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string };
  expect(message.Text).toContain(first.personal);
  expect(message.Text).not.toContain(signupLink.split("#")[1]);
  for (const other of others) expect(message.Text).not.toContain(other.personal.split("#")[1]);

  // Anna apre il suo link e cambia nome prima dell'estrazione
  const annaPage = first.page;
  await annaPage.goto(first.personal);
  await expect(annaPage.getByRole("heading", { name: `Ciao ${anna}!` })).toBeVisible();
  await expect(annaPage.getByTestId("event-cover")).toBeVisible();
  await expect(annaPage.getByTestId("quote-banner")).toBeVisible();
  const editor = annaPage.getByTestId("profile-editor");
  await expect(editor.getByRole("img", { name: `Foto di ${anna}` })).toBeVisible();
  await editor.getByRole("button", { name: /Modifica/ }).click();
  const annaMaria = `Anna Maria ${suffix}`;
  await editor.getByLabel("Nome").fill(annaMaria);
  await editor.getByRole("button", { name: "Salva" }).click();
  await expect(annaPage.getByRole("heading", { name: `Ciao ${annaMaria}!` })).toBeVisible();
  await shot(annaPage, "11-partecipante-profilo");

  // L'admin vede gli iscritti (con email già inviata), imposta la coppia ed estrae
  await page.reload();
  await expect(page.getByTestId("participant-card")).toHaveCount(4);
  await expect(participantCard(page, annaMaria).getByText("Email inviata")).toBeVisible();
  await expect(participantCard(page, annaMaria).getByRole("img", { name: `Foto di ${annaMaria}` })).toBeVisible();
  await addExclusion(page, annaMaria, bruno, true);
  await expect(page.getByText("Tutto pronto per l'estrazione")).toBeVisible();
  await clickAndConfirm(page, /Genera estrazione/, "Estrai ora");
  await expect(page.getByText("Estrazione completata, ancora segreta")).toBeVisible();
  await expect(page.getByText("Le iscrizioni sono chiuse perché l'estrazione è stata fatta")).toBeVisible();

  // Dopo l'estrazione: niente iscrizioni né modifiche del profilo
  const late = await browser.newContext();
  const latePage = await late.newPage();
  await latePage.goto(signupLink);
  await expect(latePage.getByTestId("signup-closed")).toBeVisible();
  await late.close();
  await annaPage.reload();
  await expect(annaPage.getByTestId("waiting-message")).toBeVisible();
  await expect(annaPage.getByTestId("profile-editor")).toHaveCount(0);

  // Pubblicazione: Anna scopre il destinatario, che non è Bruno
  await clickAndConfirm(page, /Pubblica estrazione/, "Pubblica");
  await expect(page.getByText("Estrazione pubblicata").first()).toBeVisible();
  await annaPage.reload();
  await annaPage.getByRole("button", { name: /Scopri a chi fai il regalo/ }).click();
  const revealed = annaPage.getByTestId("revealed-recipient");
  await expect(revealed).toBeVisible();
  const recipient = await revealed.getByRole("heading").innerText();
  expect([carla, dario]).toContain(recipient);

  for (const other of others) await other.context.close();
  await first.context.close();
});

test("pagina d'iscrizione con link mancante o non valido", async ({ page }) => {
  await page.goto("/iscrizione");
  await expect(page.getByRole("heading", { name: "Manca il link d'iscrizione" })).toBeVisible();
  await page.goto(`/iscrizione#${"x".repeat(43)}`);
  await expect(page.getByRole("heading", { name: "Link non valido" })).toBeVisible();
});
