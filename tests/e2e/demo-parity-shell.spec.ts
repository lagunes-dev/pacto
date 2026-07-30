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

test("restores setup focus and gives temporary notification feedback", async ({ page }, testInfo) => {
  await register(page, `feedback-${testInfo.project.name}@example.com`);

  const setup = page.getByRole("button", { name: "Abrir configuración inicial" });
  await setup.click();
  const dialog = page.getByRole("dialog", { name: "Configura tu Pacto" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cerrar configuración" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(setup).toBeFocused();

  await page.getByRole("button", { name: "Consultar notificaciones" }).click();
  const toast = page.getByRole("status").filter({ hasText: "Notificaciones" });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(/no (están|está)|desactivadas|bloqueado|admite|activadas/i);
  await page.waitForTimeout(4_500);
  await expect(toast).toBeVisible();
  await expect(toast).toBeHidden({ timeout: 1_500 });
});

test("topbar reports capability and offline boundaries truthfully", async ({ context, page }, testInfo) => {
  await register(page, `status-${testInfo.project.name}@example.com`);

  const install = page.getByText("Instalar", { exact: true });
  await expect(install).toBeVisible();
  await install.click();
  await expect(page.getByText(/elige Instalar cuando esté disponible|instalación desde este navegador/i)).toBeVisible();

  await context.setOffline(true);
  const connection = page.getByLabel("Estado de conexión");
  await expect(connection).toContainText("Sin conexión");
  await expect(connection).toContainText("no se guardan para enviar después");
  await context.setOffline(false);
});

for (const width of [320, 390, 430]) {
  test(`${width}px keeps all parity routes active and free of horizontal overflow`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 700 : width === 390 ? 844 : 932 });
    await register(page, `parity-${width}-${testInfo.project.name}@example.com`);

    for (const [label, path] of [["Inicio", "/inicio"], ["Registro", "/registro"], ["Progreso", "/progreso"], ["Acuerdo", "/acuerdo"]] as const) {
      await page.getByRole("navigation", { name: "Navegación móvil" }).getByRole("link", { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expectNavigation(page, label);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }

    await page.goBack();
    await expect(page).toHaveURL(/\/progreso$/);
    await expectNavigation(page, "Progreso");
  });
}
