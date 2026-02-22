import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Geist", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["Geist Mono", "monospace"],
      },
      colors: {
        background: "#f7f7f5",
        surface: "#ffffff",
        border: "#e8e8e4",
        "border-subtle": "#f0f0ec",
        "text-primary": "#0a0a0a",
        "text-secondary": "#6b6b6b",
        "text-muted": "#a0a0a0",
        // Sidebar
        "sidebar-bg": "#111111",
        "sidebar-border": "#1f1f1f",
        "sidebar-text": "#8a8a8a",
        // Accents
        accent: "#2563eb",
        green: "#16a34a",
        amber: "#d97706",
        red: "#dc2626",
      },
      borderRadius: {
        DEFAULT: "5px",
        md: "5px",
        lg: "7px",
        xl: "7px",
        "2xl": "7px",
      },
      fontSize: {
        "2xs": ["10px", "14px"],
        xs: ["11px", "16px"],
        sm: ["12px", "18px"],
        base: ["13px", "20px"],
        md: ["14px", "20px"],
        lg: ["15px", "22px"],
        xl: ["17px", "24px"],
        "2xl": ["20px", "28px"],
      },
    },
  },
  plugins: [],
};

export default config;