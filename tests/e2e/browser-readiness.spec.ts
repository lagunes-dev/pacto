import { expect, test, type Page } from "@playwright/test";

async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("private-pass");
  await page.getByRole("button", { name: "Registrarme" }).click();
  await expect(page.getByRole("heading", { name: "Tu progreso personal" })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  )).toBe(true);
}

test("redirects an unauthenticated private deep link to the public auth layout", async ({ page }) => {
  const response = await page.goto("/partnership/preferences");

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Vuelve a tus decisiones." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Barra lateral" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Navegación móvil" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("renders deterministic owner-scoped fixture data", async ({ page }, testInfo) => {
  const suffix = testInfo.project.name.replace(/\W/g, "-");
  await register(page, `owner-${suffix}@example.com`);
  const createHabit = page.getByRole("link", { name: "Crear hábito" }).first();
  await expect(createHabit).toBeVisible();
  await createHabit.click();
  await page.getByLabel("Nombre").fill("Owner private walk");
  await page.getByRole("button", { name: "Crear hábito" }).click();
  await expect(page.getByRole("heading", { name: "Owner private walk" })).toBeVisible();
  await expect(page.getByText("observer@example.com")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("serves the generated manifest, worker, and declared icons", async ({ request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json() as { icons: Array<{ src: string }> };
  expect(manifest.icons.length).toBeGreaterThan(0);

  const workerResponse = await request.get("/sw.js");
  expect(workerResponse.ok()).toBe(true);
  await expect(workerResponse.text()).resolves.toContain("push-handler.js");

  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok()).toBe(true);
  }
});

test.describe("narrow mobile shell", () => {
  for (const viewport of [320, 390, 430]) {
    test(`${viewport}px keeps the private shell usable`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: viewport, height: viewport === 320 ? 700 : viewport === 390 ? 844 : 932 });
      await register(page, `mobile-${viewport}-${testInfo.project.name}@example.com`);
      await expectNoHorizontalOverflow(page);
      await expect(page.locator(".safe-area-top")).toHaveClass(/safe-area-top/);
      await expect(page.locator(".safe-area-bottom")).toHaveClass(/safe-area-bottom/);
      await expect(page.locator(".topbar")).toHaveCSS("top", "10px");
      await expect(page.locator(".mobile-nav")).toBeVisible();
    });
  }
});
