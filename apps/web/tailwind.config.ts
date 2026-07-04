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
        bg: "var(--bg)",
        "bg-2": "var(--bg2)",
        surface: "var(--surface)",
        "surface-2": "var(--surface2)",
        border: "var(--border)",
        "border-2": "var(--border2)",
        text: "var(--text)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        accent: "var(--accent)",
        "accent-strong": "var(--accent-strong)",
        "accent-ink": "var(--accent-ink)",
        "accent-soft": "var(--accent-soft)",
        "accent-line": "var(--accent-line)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        "code-bg": "var(--code-bg)",
        "nav-bg": "var(--nav-bg)",
      },
      fontFamily: {
        syne: ["var(--font-syne)"],
        sans: ["var(--font-inter)"],
        mono: ["var(--font-mono)"],
      },
      backgroundImage: {
        "hero-glow":
          "radial-gradient(circle at 18% 24%, rgba(99, 102, 241, 0.22), transparent 42%), radial-gradient(circle at 82% 18%, rgba(139, 92, 246, 0.16), transparent 36%)",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseAccent: {
          "0%,100%": { boxShadow: "0 0 0 0 rgba(99,102,241,0)" },
          "50%": { boxShadow: "0 0 0 4px rgba(99,102,241,0.2)" },
        },
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.25s ease-out",
        "spin-slow": "spin 2s linear infinite",
        "pulse-accent": "pulseAccent 2s ease-in-out infinite",
      },
    },
  },
};

export default config;
