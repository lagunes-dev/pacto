import { expect, test, type Page } from "@playwright/test";

async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill("private-pass");
  await page.getByRole("button", { name: "Registrarme" }).click();
  await expect(page.getByRole("heading", { name: "Tu progreso personal" })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
}

test("redirects an unauthenticated private deep link through the built shell", async ({ page }) => {
  const response = await page.goto("/partnership/preferences");

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Volvé a tus decisiones." })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("renders deterministic owner-scoped fixture data", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name.replace(/\W/g, "-");
  await register(page, `owner-${suffix}@example.com`);
  await page.getByRole("link", { name: "Crear hábito" }).first().click();
  await page.getByLabel("Nombre").fill("Owner private walk");
  await page.getByRole("button", { name: "Crear hábito" }).click();
  await expect(page.getByRole("heading", { name: "Owner private walk" })).toBeVisible();
  await expect(page.getByText("observer@example.com")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});
