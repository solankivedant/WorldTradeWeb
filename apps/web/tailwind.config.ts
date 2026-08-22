import type { Config } from "tailwindcss";

/**
 * Colors resolve to CSS custom properties defined in globals.css, so a theme change is a
 * single attribute flip on <html> rather than a class rewrite across the app.
 *
 * The `rgb(var(--x) / <alpha-value>)` form is required — not `var(--x)` directly —
 * because Tailwind's opacity modifiers (`bg-series-1/15`, `border-series-1/40`) only work
 * when the channel values are exposed separately.
 *
 * Status colors are FIXED hex, never themed: they must stay distinguishable from the
 * categorical slots in both modes, and they always ship with an icon + label so hue never
 * carries the meaning alone.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        plane: "rgb(var(--plane) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        raised: "rgb(var(--raised) / <alpha-value>)",
        hairline: "rgb(var(--hairline) / <alpha-value>)",
        baseline: "rgb(var(--baseline) / <alpha-value>)",

        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          secondary: "rgb(var(--ink-secondary) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
        },

        // Categorical — fixed order, never cycled. A 9th series folds into "Other".
        series: {
          1: "rgb(var(--series-1) / <alpha-value>)",
          2: "rgb(var(--series-2) / <alpha-value>)",
          3: "rgb(var(--series-3) / <alpha-value>)",
          4: "rgb(var(--series-4) / <alpha-value>)",
          5: "rgb(var(--series-5) / <alpha-value>)",
          6: "rgb(var(--series-6) / <alpha-value>)",
          7: "rgb(var(--series-7) / <alpha-value>)",
          8: "rgb(var(--series-8) / <alpha-value>)",
        },

        // Reserved. Never reused as a series color. Always with icon + label.
        status: {
          good: "#0ca30c",
          warning: "#fab219",
          serious: "#ec835a",
          critical: "#d03b3b",
        },

        delta: {
          up: "rgb(var(--delta-up) / <alpha-value>)",
          down: "rgb(var(--delta-down) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
    },
  },
  plugins: [],
};

export default config;
