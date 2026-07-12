import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0E0E0E",
          accent: "#C8102E",
          light: "#F5F5F5",
        },
        ink: "#0E0E0E",
        muted: "#6B6B6B",
        line: "#E5E5E5",
        utility: "#F5F5F5",
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
