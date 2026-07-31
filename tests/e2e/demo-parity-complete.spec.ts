import { expect, test, type Page } from "@playwright/test";

async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill("private-pass");
  await page.getByRole("button", { name: "Registrarme" }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

test("keeps support explicit and online-only with privacy-safe copy", async ({ context, page }, testInfo) => {
  await register(page, `complete-${testInfo.project.name}@example.com`);
  await page.getByRole("button", { name: "Pedir el apoyo correcto" }).click();

  const dialog = page.getByRole("dialog", { name: "¿Qué necesitas ahora?" });
  await expect(dialog.getByRole("radio")).toHaveCount(5);
  await expect(dialog.getByText("Las notas privadas, el nivel de antojo y los detalles de comida no se incluyen.")).toBeVisible();

  await context.setOffline(true);
  await dialog.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Necesitas conexión para enviar apoyo. No se guardó ni se puso en espera.");
  await context.setOffline(false);
});
