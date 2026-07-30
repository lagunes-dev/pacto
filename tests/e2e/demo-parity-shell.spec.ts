import { expect, test, type Page } from "@playwright/test";

async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("private-pass");
  await page.getByRole("button", { name: "Registrarme" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByRole("heading", { name: "La próxima decisión sí cuenta." })).toBeVisible();
}

async function expectNavigation(page: Page, activeLabel: string) {
  for (const name of ["Navegación principal", "Navegación móvil"]) {
    const navigation = page.locator(`nav[aria-label="${name}"]`);
    await expect(navigation.locator("a")).toHaveCount(4);
    await expect(navigation.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(navigation.getByRole("link", { name: activeLabel, includeHidden: true })).toHaveAttribute("aria-current", "page");
  }
}

async function clientNavigate(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

test("guards Inicio and canonicalizes legacy authenticated routes", async ({ page }, testInfo) => {
  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/sign-in$/);

  await register(page, `canonical-${testInfo.project.name}@example.com`);
  await clientNavigate(page, "/progress");
  await expect(page).toHaveURL(/\/progreso$/);
  await expectNavigation(page, "Progreso");
  await clientNavigate(page, "/partnership");
  await expect(page).toHaveURL(/\/acuerdo$/);
  await expectNavigation(page, "Acuerdo");
});

test("navigates the four canonical views with a sole active item", async ({ page }, testInfo) => {
  await register(page, `nav-${testInfo.project.name}@example.com`);

  const routes = [
    ["Inicio", "/inicio", "La próxima decisión sí cuenta."],
    ["Registro", "/registro", "Entender, corregir, continuar."],
    ["Progreso", "/progreso", "Tu progreso personal"],
    ["Acuerdo", "/acuerdo", null],
  ] as const;

  const mobile = (page.viewportSize()?.width ?? 1440) <= 980;
  const navigation = page.getByRole("navigation", { name: mobile ? "Navegación móvil" : "Navegación principal" });
  for (const [label, path, heading] of routes) {
    await navigation.getByRole("link", { name: label }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    if (heading) await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    else await expect(page.locator(".topbar strong")).toHaveText("Acuerdo compartido");
    await expectNavigation(page, label);
  }
});
