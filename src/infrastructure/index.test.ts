import { createAppServices } from ".";

describe("unavailable production consent services", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed instead of simulating partnership capabilities", async () => {
    vi.stubEnv("VITE_DATA_ADAPTER", "supabase");
    const services = createAppServices();

    await expect(services.partnership.getMine()).rejects.toThrow("no está disponible");
    await expect(services.preferences.getMine()).rejects.toThrow("no está disponible");
    await expect(services.support.list()).rejects.toThrow("no está disponible");
  });
});
