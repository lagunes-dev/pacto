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
    lang: "es",
    scope: "/",
    start_url: "/",
    display: "standalone" as const,
    theme_color: "#0b100d",
    background_color: "#0b100d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" as const },
    ],
  },
  workbox: {
    importScripts: ["/push-handler.js"],
    globPatterns: ["**/*.{html,js,css,png}"],
    navigateFallback: "index.html",
    runtimeCaching: [],
  },
};

export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions)],
  test: {
    environment: "jsdom",
    globals: true,
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    include: ["src/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
    setupFiles: "./src/test/setup.ts",
  },
});
