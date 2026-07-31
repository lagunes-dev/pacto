import { expect, test, type Page } from "@playwright/test";

async function navigate(page: Page, path: string) {
  await page.evaluate((next) => { window.history.pushState({}, "", next); window.dispatchEvent(new PopStateEvent("popstate")); }, path);
}

async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("private-pass");
  await page.getByRole("button", { name: "Registrarme" }).click();
  await navigate(page, "/registro");
}

async function savePlan(page: Page) {
  await page.getByLabel("¿Qué ocurrió?").selectOption("Antojo");
  await page.getByLabel("¿Qué necesitabas?").selectOption("Reducir estrés");
  await page.getByLabel("Alternativa para la próxima vez").fill("tomaré agua y esperaré diez minutos");
  await page.getByPlaceholder("Sólo tú puedes leer esto.").fill("Nota que no debe salir");
  await expect(page.getByText(/Si vuelve el antojo después de cenar/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar plan y continuar" }).click();
  await expect(page.getByRole("status")).toContainText("Plan guardado");
}

test("saves Registro, renders its timeline and projects only the safe plan on Home", async ({ page }, testInfo) => {
  await register(page, `registro-${testInfo.project.name}@example.com`);
  await savePlan(page);
  await expect(page.getByText("Antojo · Después de cenar")).toBeVisible();
  await expect(page.getByText("Nota que no debe salir")).toHaveCount(0);
  await navigate(page, "/inicio");
  await expect(page.getByRole("heading", { name: "Después de cenar" })).toBeVisible();
  await expect(page.getByText("Nota que no debe salir")).toHaveCount(0);
});

for (const [width, height] of [[320, 700], [390, 844], [430, 932]] as const) {
  test(`${width}px Registro remains operable without horizontal overflow`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await register(page, `registro-${width}-${testInfo.project.name}@example.com`);
    await savePlan(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Limpiar" })).toBeVisible();
  });
}
