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
        // Legacy alias — many older buttons reference text-cream / bg-cream.
        // Map to white so those classes resolve to the right thing in the new palette.
        cream: "#FFFFFF",
      },
      fontFamily: {
        serif: ['"Playfair Display"', "Georgia", "serif"],
        display: ['"Playfair Display"', "Georgia", "serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
      letterSpacing: {
        widest2: "0.2em",
      },
    },
  },
  plugins: [],
};
export default config;
