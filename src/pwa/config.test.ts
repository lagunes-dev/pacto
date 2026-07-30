import { pwaOptions } from "../../vite.config";

describe("PWA generation", () => {
  it("uses one generated worker with explicit registration", () => {
    expect(pwaOptions).toMatchObject({
      strategies: "generateSW",
      injectRegister: false,
      registerType: "prompt",
    });
  });

  it("precaches only emitted public shell assets and has no runtime cache", () => {
    expect(pwaOptions.workbox).toEqual({
      globPatterns: ["**/*.{html,js,css}"],
      navigateFallback: "index.html",
      runtimeCaching: [],
    });

    const serialized = JSON.stringify(pwaOptions.workbox);
    expect(serialized).not.toMatch(/supabase|auth|token|private|https?:/i);
  });
});
