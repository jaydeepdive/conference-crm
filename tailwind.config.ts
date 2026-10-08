import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Theme tokens are CSS variables (see globals.css) so the Above &
        // Beyond admin console (.ab-admin) can re-skin the shared components.
        brand: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
          accent: "rgb(var(--c-accent) / <alpha-value>)",
          light: "rgb(var(--c-utility) / <alpha-value>)",
        },
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        utility: "rgb(var(--c-utility) / <alpha-value>)",
        // Legacy alias — older buttons reference text-cream / bg-cream. Map to white.
        cream: "#FFFFFF",
      },
      fontFamily: {
        // Cardo — the same headline serif thedeepdive.ca uses.
        serif: ['"Cardo"', "Georgia", "serif"],
        display: ['"Cardo"', "Georgia", "serif"],
        // Bitter — same body slab-serif thedeepdive.ca uses.
        sans: ['"Bitter"', "Georgia", "serif"],
        body: ['"Bitter"', "Georgia", "serif"],
      },
      letterSpacing: {
        widest2: "0.2em",
      },
    },
  },
  plugins: [],
};
export default config;
