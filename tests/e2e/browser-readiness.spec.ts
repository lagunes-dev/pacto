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
      await expect(await page.locator("button:visible, a:visible").evaluateAll((elements) => elements.every((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width >= 44 && rect.height >= 44;
      }))).toBe(true);
      await page.getByRole("link", { name: "Crear hábito" }).first().click();
      await expect(page.getByRole("heading", { name: "Crear un hábito" })).toBeVisible();
      await page.getByLabel("Nombre").fill(`Decisión ${viewport}`);
      await page.getByRole("button", { name: "Crear hábito" }).click();
      await page.getByRole("link", { name: "Progreso" }).first().click();
      await expect(page.getByRole("heading", { name: "Siguiente decisión" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Hábitos activos" })).toBeVisible();
      await expect(page.getByRole("article", { name: `Hábito Decisión ${viewport}` })).toContainText("Prioridad 2 · Activo");
      await expect(page.locator(".active-habits-list")).toContainText("Administrar");
      await expect(page.locator(".progress-habits")).toHaveCount(0);
      const manageHabits = page.getByRole("link", { name: "Administrar hábitos" });
      await expect(manageHabits).toHaveCSS("min-height", "44px");
      const actionLayout = await manageHabits.evaluate((element) => {
        const action = element.getBoundingClientRect();
        const headingCopy = document.querySelector(".progress-heading-copy")!.getBoundingClientRect();
        return { width: action.width, height: action.height, viewport: window.innerWidth, topGap: action.top - headingCopy.bottom };
      });
      expect(actionLayout.height).toBeGreaterThanOrEqual(44);
      expect(actionLayout.width).toBeGreaterThanOrEqual(viewport === 320 ? 250 : 280);
      expect(actionLayout.width).toBeLessThanOrEqual(actionLayout.viewport);
      expect(actionLayout.topGap).toBeGreaterThanOrEqual(0);
      await manageHabits.click();
      await page.getByRole("button", { name: `Eliminar Decisión ${viewport}` }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }
});
