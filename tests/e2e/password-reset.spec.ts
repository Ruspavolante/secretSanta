import { expect, test, type APIRequestContext } from "@playwright/test";
import { login, registerOrganizer } from "./helpers";

const MAILPIT = "http://127.0.0.1:54324";

/** Link dell'ultima email di recupero ricevuta da `address` (Mailpit locale). */
async function recoveryLink(request: APIRequestContext, address: string, baseURL: string): Promise<string> {
  let messages: { ID: string }[] = [];
  for (let attempt = 0; attempt < 20 && messages.length === 0; attempt++) {
    const search = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
    ({ messages } = (await search.json()) as { messages: { ID: string }[] });
    if (messages.length === 0) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  expect(messages.length).toBeGreaterThan(0);
  const message = (await (await request.get(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { HTML: string; Subject: string };
  expect(message.Subject).toBe("Reimposta la password del tuo Secret Santa");
  const href = message.HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1];
  expect(href).toBeTruthy();
  const url = new URL(href!.replaceAll("&amp;", "&"));
  expect(url.searchParams.get("type")).toBe("recovery");
  // Il modello usa il Site URL di Supabase (127.0.0.1): si apre sullo stesso server dei test.
  return `${baseURL}${url.pathname}${url.search}`;
}

test("recupero password: email, nuova password, link usabile una volta sola", async ({ page, request, baseURL }) => {
  const { email, password } = await registerOrganizer(page);

  // Con una sessione normale la pagina della nuova password non si usa senza link
  await page.goto("/admin/nuova-password");
  await expect(page.getByText("Serve il link di recupero")).toBeVisible();
  await expect(page.getByTestId("new-password-form")).toHaveCount(0);

  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);

  // Stessa risposta per un'email inesistente (non rivela chi è registrato)
  await page.getByRole("link", { name: "Password dimenticata?" }).click();
  const form = page.getByTestId("password-reset-form");
  await form.getByLabel("Email del tuo account").fill(`nessuno.${Date.now()}@example.com`);
  await form.getByRole("button", { name: "Mandami il link" }).click();
  await expect(form.getByRole("status")).toContainText("Se esiste un account con");

  await form.getByLabel("Email del tuo account").fill(email);
  await form.getByRole("button", { name: "Mandami il link" }).click();
  await expect(form.getByRole("status")).toContainText(`Se esiste un account con ${email}`);

  const link = await recoveryLink(request, email, baseURL!);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Scegli una nuova password" })).toBeVisible();
  const newPassword = page.getByTestId("new-password-form");
  await newPassword.getByLabel("Nuova password", { exact: true }).fill("password-recuperata-789");
  await newPassword.getByLabel("Ripeti la nuova password").fill("password-recuperata-789");
  await newPassword.getByRole("button", { name: "Salva la nuova password" }).click();
  await expect(page.getByText("D'ora in poi accedi con la nuova password.")).toBeVisible();

  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await login(page, { email, password });
  await expect(page.getByRole("alert").filter({ hasText: "Email o password non corretti" })).toBeVisible();
  await login(page, { email, password: "password-recuperata-789" });
  await expect(page.getByRole("heading", { name: "I tuoi Secret Santa" })).toBeVisible();

  // Il link è già stato usato: non funziona una seconda volta
  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goto(link);
  await expect(page).toHaveURL(/\/admin\/password-dimenticata\?errore=link$/);
  await expect(page.getByText("Link non valido o scaduto")).toBeVisible();
});
