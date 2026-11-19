import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0F2742", soft: "#3B526B", faint: "#5F738A" },
        paper: "#F5F7FA",
        line: "#D9E0E8",
        brand: { DEFAULT: "#1546C0", dark: "#0E3391", tint: "#E8EEFB" },
        safe: { DEFAULT: "#0B7A55", tint: "#E3F4EC" },
        caution: { DEFAULT: "#9A5B00", tint: "#FCF1DC" },
        danger: { DEFAULT: "#B3261E", tint: "#FBE7E5" },
      },
      fontFamily: {
        display: ["Georgia", "Cambria", "'Times New Roman'", "serif"],
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "'Segoe UI'",
          "Roboto",
          "'Helvetica Neue'",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
