import { expect, test, type Page } from "@playwright/test";
import { addParticipant, clickAndConfirm, createEvent, registerOrganizer, personalLink, uniqueName } from "./helpers";

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test("smartphone: pagine pubbliche, area admin e rivelazione senza scroll orizzontale", async ({ page, browser }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto("/admin/login");
  await expectNoHorizontalScroll(page);
  await page.goto("/admin/registrati");
  await expectNoHorizontalScroll(page);

  await registerOrganizer(page);
  await expectNoHorizontalScroll(page);

  const suffix = Date.now().toString(36).slice(-4);
  await createEvent(page, uniqueName("Mobile"));
  for (const name of [`Alfa ${suffix}`, `Beta ${suffix}`, `Gamma ${suffix}`]) await addParticipant(page, name);
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/screens/10-mobile-admin.png", fullPage: true });

  // Pagina d'iscrizione dal link di gruppo
  await page.getByRole("button", { name: /Apri le iscrizioni/ }).click();
  const signupLink = await page.getByTestId("signup-panel").getByLabel("Link d'iscrizione").inputValue();
  await expectNoHorizontalScroll(page);
  const signupContext = await browser.newContext({ ...test.info().project.use });
  const signupPage = await signupContext.newPage();
  await signupPage.goto(signupLink);
  await expect(signupPage.getByTestId("signup-form")).toBeVisible();
  await expect(signupPage.getByTestId("quote-banner")).toBeVisible();
  await expectNoHorizontalScroll(signupPage);
  await signupPage.screenshot({ path: "test-results/screens/12-mobile-iscrizione.png", fullPage: true });
  await signupContext.close();

  const link = await personalLink(page, `Alfa ${suffix}`);
  await clickAndConfirm(page, /Genera estrazione/, "Estrai ora");
  await page.getByRole("link", { name: /Verifica abbinamenti/ }).click();
  await expect(page.getByTestId("assignments-table").locator("tbody tr")).toHaveCount(3);
  await expectNoHorizontalScroll(page);
  await page.goBack();
  await clickAndConfirm(page, /Pubblica estrazione/, "Pubblica");
  await expect(page.getByText("Estrazione pubblicata").first()).toBeVisible();

  const context = await browser.newContext({ ...test.info().project.use });
  const participant = await context.newPage();
  await participant.goto(link);
  await participant.getByRole("button", { name: /Scopri a chi fai il regalo/ }).click();
  await expect(participant.getByTestId("revealed-recipient")).toBeVisible();
  await expectNoHorizontalScroll(participant);
  await participant.waitForTimeout(1500);
  await participant.screenshot({ path: "test-results/screens/11-mobile-rivelazione.png", fullPage: true });
  await context.close();
});
