import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export const pwaOptions = {
  strategies: "generateSW" as const,
  injectRegister: false as const,
  registerType: "prompt" as const,
  manifest: {
    name: "Pacto",
    short_name: "Pacto",
    scope: "/",
    start_url: "/",
    display: "standalone" as const,
    theme_color: "#7c3aed",
    background_color: "#f8fafc",
  },
  workbox: {
    globPatterns: ["**/*.{html,js,css}"],
    navigateFallback: "index.html",
    runtimeCaching: [],
  },
};

export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions)],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
    setupFiles: "./src/test/setup.ts",
  },
});
