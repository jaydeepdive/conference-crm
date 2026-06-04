import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1F3864",
          light: "#D9E1F2",
        },
      },
    },
  },
  plugins: [],
};
export default config;
