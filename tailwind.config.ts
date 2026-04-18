import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          900: "#0f172a",
          800: "#1e293b",
          700: "#334155",
        },
        fg: {
          100: "#e2e8f0",
          300: "#94a3b8",
          500: "#64748b",
          600: "#475569",
        },
        brand: {
          sky: "#38bdf8",
          emerald: "#34d399",
          amber: "#fbbf24",
          rose: "#f87171",
          violet: "#a78bfa",
          orange: "#fb923c",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
