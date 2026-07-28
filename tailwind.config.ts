import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pacto: {
          background: "var(--color-background)",
          panel: "var(--color-panel)",
          sage: "var(--color-sage)",
          text: "var(--color-text)",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
