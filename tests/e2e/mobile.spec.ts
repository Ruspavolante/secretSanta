import { expect, test, type Page } from "@playwright/test";
import { addParticipant, clickAndConfirm, createEvent, loginAsAdmin, personalLink, uniqueName } from "./helpers";

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

  await loginAsAdmin(page);
  await expectNoHorizontalScroll(page);

  const suffix = Date.now().toString(36).slice(-4);
  await createEvent(page, uniqueName("Mobile"));
  for (const name of [`Alfa ${suffix}`, `Beta ${suffix}`, `Gamma ${suffix}`]) await addParticipant(page, name);
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/screens/10-mobile-admin.png", fullPage: true });

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
