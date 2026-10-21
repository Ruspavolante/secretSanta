import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: "admin@example.com", password: "password-locale-123" };
export const NON_ADMIN = { email: "utente@example.com", password: "password-locale-123" };

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
