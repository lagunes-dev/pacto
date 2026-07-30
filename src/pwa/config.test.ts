import { pwaOptions } from "../../vite.config";

describe("PWA generation", () => {
  it("uses one generated worker with explicit registration", () => {
    expect(pwaOptions).toMatchObject({
      strategies: "generateSW",
      injectRegister: false,
      registerType: "prompt",
    });
  });

  it("precaches only emitted public shell assets and imports the fixed push handler", () => {
    expect(pwaOptions.workbox).toEqual({
      importScripts: ["/push-handler.js"],
      globPatterns: ["**/*.{html,js,css,png}"],
      navigateFallback: "index.html",
      runtimeCaching: [],
    });

    const serialized = JSON.stringify(pwaOptions.workbox);
    expect(serialized).not.toMatch(/supabase|auth|token|private|https?:/i);
  });

  it("declares purpose-specific install icons", () => {
    expect(pwaOptions.manifest.lang).toBe("es");
    expect(pwaOptions.manifest.icons).toEqual([
      expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192" }),
      expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512" }),
      expect.objectContaining({ src: "/icons/maskable-512.png", purpose: "maskable" }),
    ]);
  });
});
