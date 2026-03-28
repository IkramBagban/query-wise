import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./types/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "color-bg": "#0a0a0f",
        "color-surface": "#13131a",
        "color-surface-2": "#1c1c27",
        "color-border": "#2a2a3a",
        "color-border-2": "#3a3a52",
        "color-accent": "#6366f1",
        "color-accent-2": "#8b5cf6",
        "color-success": "#10b981",
        "color-warning": "#f59e0b",
        "color-danger": "#ef4444",
        "color-text-1": "#f1f5f9",
        "color-text-2": "#94a3b8",
        "color-text-3": "#475569",
      },
      fontFamily: {
        syne: ["var(--font-syne)"],
        inter: ["var(--font-inter)"],
        jetbrains: ["var(--font-mono)"],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "slide-up": "slide-up 250ms ease-out",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
      },
    },
  },
};

export default config;
