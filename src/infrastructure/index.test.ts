import { createAppServices, type AppEnvironment } from ".";

const environment = (overrides: Partial<AppEnvironment> = {}): AppEnvironment => ({
  adapter: "supabase",
  isDevelopment: false,
  supabaseUrl: "",
  supabasePublishableKey: "",
  ...overrides,
});

describe("unavailable production consent services", () => {
  it("fails closed instead of simulating partnership capabilities", async () => {
    const services = createAppServices(environment());

    await expect(services.auth.getSession()).rejects.toThrow("Falta configurar");
    await expect(services.partnership.getMine()).rejects.toThrow("no está disponible");
    await expect(services.preferences.getMine()).rejects.toThrow("no está disponible");
    await expect(services.support.list()).rejects.toThrow("no está disponible");
  });

  it("rejects fixture selection outside development", async () => {
    const services = createAppServices(environment({ adapter: "fixture" }));

    await expect(services.auth.getSession()).rejects.toThrow("deshabilitado fuera de desarrollo");
  });

  it("uses the fixture only when explicitly selected in development", async () => {
    const services = createAppServices(environment({ adapter: "fixture", isDevelopment: true }));

    expect(await services.auth.getSession()).toBeNull();
  });
});
