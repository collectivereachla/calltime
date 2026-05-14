import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Calltime palette — light mode default
        paper: "#FAF7F1",
        card: "#FFFFFF",
        ink: "#1A1A1B",
        brick: "#C4522D",
        ash: "#7A726A",
        bone: "#E8E1D2",

        // Status colors
        confirmed: "#1A6D4A",
        tentative: "#B5772A",
        conflict: "#C4522D", // Same as brick — intentional

        // Functional grays
        muted: "#A39E96",
      },
      fontFamily: {
        display: ['"Newsreader"', "Georgia", "serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      fontSize: {
        // Display scale — Newsreader
        "display-lg": ["2.25rem", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        "display-md": ["1.75rem", { lineHeight: "1.25", letterSpacing: "-0.015em" }],
        "display-sm": ["1.25rem", { lineHeight: "1.3", letterSpacing: "-0.01em" }],
        // Body scale — Inter
        "body-lg": ["1rem", { lineHeight: "1.6" }],
        "body-md": ["0.875rem", { lineHeight: "1.5" }],
        "body-sm": ["0.8125rem", { lineHeight: "1.5" }],
        "body-xs": ["0.75rem", { lineHeight: "1.4" }],
        // Data scale — JetBrains Mono
        "data-md": ["0.875rem", { lineHeight: "1.4" }],
        "data-sm": ["0.75rem", { lineHeight: "1.4" }],
      },
      borderRadius: {
        card: "0.5rem",
      },
      boxShadow: {
        card: "0 1px 3px rgba(26, 26, 27, 0.04), 0 1px 2px rgba(26, 26, 27, 0.06)",
        "card-hover": "0 4px 12px rgba(26, 26, 27, 0.08), 0 2px 4px rgba(26, 26, 27, 0.04)",
      },
      spacing: {
        // Calltime spacing — generous, deliberate
        18: "4.5rem",
        22: "5.5rem",
      },
    },
  },
  plugins: [],
};
export default config;
