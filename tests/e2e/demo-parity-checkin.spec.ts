import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const password = "private-pass";

async function clientNavigate(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

async function registerWithGoal(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Registrarme" }).click();
  await expect(page).toHaveURL(/\/inicio$/);

  await clientNavigate(page, "/habits/new");
  await page.getByLabel("Nombre").fill("Elegir agua");
  await page.getByLabel("Prioridad").selectOption("1");
  await page.getByRole("button", { name: "Crear hábito" }).click();
  await clientNavigate(page, "/inicio");
  await expect(page.getByRole("heading", { name: "¿Cómo va tu día?" })).toBeVisible();
}

async function confirmTimezoneIfRequested(page: Page) {
  const confirmation = page.getByRole("checkbox", { name: /Confirmo usar la zona horaria/ });
  if (await confirmation.count()) {
    await confirmation.dispatchEvent("click");
    await expect(confirmation).toHaveCount(0);
  }
}

async function chooseCompleted(page: Page, craving: number) {
  await page.getByRole("button", { name: "Cumplido" }).click();
  await page.getByRole("button", { name: `Antojo ${craving} de 5` }).click();
}

async function save(page: Page) {
  await page.getByRole("button", { name: /Guardar check-in|Reintentar guardar/ }).click();
}

async function setOffline(context: BrowserContext, offline: boolean) {
  await context.setOffline(offline);
  await expect.poll(async () => context.pages()[0]?.evaluate(() => navigator.onLine)).toBe(!offline);
}

test("requires authentication and preserves the reference visual and privacy boundaries", async ({ page }, testInfo) => {
  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/sign-in$/);

  await registerWithGoal(page, `checkin-boundary-${testInfo.project.name}@example.com`);
  await expect.poll(() => page.evaluate(() => ({
    cream: getComputedStyle(document.documentElement).getPropertyValue("--color-cream").trim(),
    sage: getComputedStyle(document.documentElement).getPropertyValue("--color-sage").trim(),
  }))).toEqual({ cream: "#e5d9bf", sage: "#b7dfbf" });
  await expect(page.getByText(/Tu información personal permanece privada/)).toBeVisible();
  const checkin = page.locator('[aria-labelledby="daily-checkin-title"]');
  await expect(checkin.getByText(/culpa|ranking|calorías|porcentaje|foto|ubicación|vigilancia|nota privada|datos de pareja|alerta automática/i)).toHaveCount(0);
});

test("updates the same local-day check-in instead of creating a second journey", async ({ page }, testInfo) => {
  await registerWithGoal(page, `checkin-update-${testInfo.project.name}@example.com`);
  await confirmTimezoneIfRequested(page);
  await chooseCompleted(page, 2);
  await save(page);
  await expect(page.getByRole("status")).toContainText("Check-in guardado");

  await page.getByRole("button", { name: "Hubo evento" }).click();
  await page.getByRole("button", { name: "Estrés" }).click();
  await page.getByRole("button", { name: "Antojo 3 de 5" }).click();
  await save(page);
  await expect(page.getByRole("status")).toContainText("Check-in guardado");

  await expect(page.getByRole("button", { name: "Hubo evento" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Estrés" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Antojo 3 de 5" })).toHaveAttribute("aria-pressed", "true");
});

test("keeps an online failure unsaved and retries the retained draft", async ({ page }, testInfo) => {
  await registerWithGoal(page, `checkin-retry-${testInfo.project.name}@example.com`);
  await confirmTimezoneIfRequested(page);
  await chooseCompleted(page, 2);

  await page.evaluate(() => {
    const target = window as typeof window & { restoreRandomUuid?: () => void };
    const original = crypto.randomUUID.bind(crypto);
    target.restoreRandomUuid = () => Object.defineProperty(crypto, "randomUUID", { configurable: true, value: original });
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: () => { throw new Error("Falla temporal simulada"); },
    });
  });
  await save(page);
  await expect(page.getByRole("alert")).toContainText("No se guardó tu check-in");
  await expect(page.getByRole("button", { name: "Cumplido" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Check-in guardado/)).toHaveCount(0);

  await page.evaluate(() => (window as typeof window & { restoreRandomUuid?: () => void }).restoreRandomUuid?.());
  await save(page);
  await expect(page.getByRole("status")).toContainText("Check-in guardado");
});

test("blocks offline saving without queueing and succeeds only after an explicit online save", async ({ context, page }, testInfo) => {
  await registerWithGoal(page, `checkin-offline-${testInfo.project.name}@example.com`);
  await confirmTimezoneIfRequested(page);
  await chooseCompleted(page, 1);

  await setOffline(context, true);
  await save(page);
  await expect(page.getByRole("alert")).toContainText("no se guardaron ni se pusieron en espera");
  await expect(page.getByText(/Check-in guardado/)).toHaveCount(0);

  await setOffline(context, false);
  await save(page);
  await expect(page.getByRole("status")).toContainText("Check-in guardado");
});

for (const [width, height] of [[320, 700], [390, 844], [430, 932]] as const) {
  test(`${width}px check-in and intervention remain operable without overflow`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await registerWithGoal(page, `checkin-${width}-${testInfo.project.name}@example.com`);
    await confirmTimezoneIfRequested(page);

    const craving = page.getByRole("button", { name: "Antojo 4 de 5" });
    await craving.focus();
    await craving.press("Enter");
    const intervention = page.getByRole("dialog", { name: "El antojo está alto" });
    await expect(intervention).toBeVisible();
    await expect.poll(() => intervention.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(intervention).toBeHidden();
    await expect(craving).toBeFocused();

    await expect(page.getByRole("button", { name: /Elegir una alternativa/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
