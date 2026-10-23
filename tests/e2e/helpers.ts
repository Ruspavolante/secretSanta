import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: "admin@example.com", password: "password-locale-123" };
export const OTHER_ORGANIZER = { email: "utente@example.com", password: "password-locale-123" };

/** PNG 1×1 valido, usato come fotografia di prova. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function login(page: Page, credentials = ADMIN) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Accedi" }).click();
}

export async function loginAsAdmin(page: Page) {
  await login(page);
  await expect(page.getByRole("heading", { name: "I tuoi Secret Santa" })).toBeVisible();
}

/**
 * Crea un nuovo account organizzatore dal sito e resta collegato. Ogni test usa
 * il proprio account: parte senza eventi e non raggiunge il limite di 20 eventi.
 */
export async function registerOrganizer(page: Page, password = "password-di-prova-123") {
  const email = `organizzatore.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/admin/registrati");
  const form = page.getByTestId("register-form");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByLabel("Ripeti la password").fill(password);
  await form.getByRole("button", { name: "Crea l'account" }).click();
  await expect(page.getByRole("heading", { name: "I tuoi Secret Santa" })).toBeVisible();
  return { email, password };
}

export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}`;
}

export async function createEvent(page: Page, name: string) {
  await page.goto("/admin");
  await page.getByLabel("Nome dell'evento").fill(name);
  await page.getByLabel("Budget (facoltativo)").fill("20 €");
  await page.getByRole("button", { name: "Crea evento" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

export async function addParticipant(page: Page, name: string, email = "") {
  const form = page.getByTestId("add-participant-form");
  await form.getByLabel("Nome").fill(name);
  await form.getByLabel("Email (facoltativa)").fill(email);
  await form.getByRole("button", { name: /Aggiungi partecipante/ }).click();
  await expect(page.getByTestId("participant-card").filter({ hasText: name })).toBeVisible();
  await expect(form.getByLabel("Nome")).toHaveValue("");
}

export function participantCard(page: Page, name: string) {
  return page.getByTestId("participant-card").filter({ has: page.getByText(name, { exact: true }) });
}

export async function addExclusion(page: Page, giver: string, receiver: string, both = true) {
  const form = page.getByTestId("exclusion-form");
  await form.getByLabel("Chi regala…").selectOption({ label: giver });
  await form.getByLabel("…non può regalare a").selectOption({ label: receiver });
  const checkbox = form.getByLabel(/entrambe le direzioni/);
  if (both) await checkbox.check();
  else await checkbox.uncheck();
  await form.getByRole("button", { name: /Aggiungi esclusione/ }).click();
}

/** Clic su un pulsante e conferma nel dialog che si apre. */
export async function clickAndConfirm(page: Page, buttonName: string | RegExp, confirmName: string | RegExp) {
  await page.getByRole("button", { name: buttonName }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: confirmName }).click();
}

export async function personalLink(page: Page, name: string): Promise<string> {
  const card = participantCard(page, name);
  await card.getByRole("button", { name: /Invito/ }).click();
  const link = await card.getByLabel(`Link personale di ${name}`).inputValue();
  await card.getByRole("button", { name: /Invito/ }).click();
  return link;
}
