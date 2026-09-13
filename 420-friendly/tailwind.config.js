/** 420 FRIENDLY — Tailwind build config.
 * Compiled to assets/tailwind.css via `npm run build:420` (run from repo root).
 * The committed CSS is the deploy artifact; this config is the source of truth
 * for the theme (mirrors the original seed-page CDN config).
 */
module.exports = {
  content: ["420-friendly/**/*.html", "420-friendly/assets/*.js"],
  // Built at runtime via string concat in product.html, invisible to the scanner:
  safelist: ["grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "surface-container-lowest": "#ffffff",
        "on-error-container": "#410004",
        "secondary": "#8a6a05",
        "secondary-fixed": "#f6e7ab",
        "surface-dim": "#e7e5df",
        "on-primary-fixed-variant": "#33453a",
        "on-tertiary-container": "#04270f",
        "primary-container": "#dfe6e0",
        "on-tertiary": "#ffffff",
        "background": "#f4f3ef",
        "error-container": "#ffdad6",
        "on-primary-container": "#101613",
        "tertiary-fixed-dim": "#12752f",
        "outline": "#5a615c",
        "on-background": "#161a17",
        "on-error": "#ffffff",
        "outline-variant": "#d3d5cf",
        "primary-fixed": "#dfe6e0",
        "surface-container": "#f0eee9",
        "surface-container-low": "#faf9f6",
        "tertiary-container": "#cdeacf",
        "inverse-surface": "#1d2320",
        "on-surface": "#161a17",
        "tertiary-fixed": "#cdeacf",
        "on-secondary-fixed": "#2b2100",
        "surface-container-highest": "#e2dfd8",
        "on-primary": "#f7f7f4",
        "on-tertiary-fixed-variant": "#0d5a24",
        "surface-variant": "#e4e2db",
        "tertiary": "#12752f",
        "secondary-fixed-dim": "#d8b63a",
        "on-tertiary-fixed": "#04270f",
        "error": "#a4232a",
        "on-surface-variant": "#4c5350",
        "primary-fixed-dim": "#9dc4a8",
        "on-secondary-fixed-variant": "#5c4600",
        "surface-tint": "#1d6b39",
        "on-primary-fixed": "#101613",
        "on-secondary": "#ffffff",
        "on-secondary-container": "#2b2100",
        "surface-bright": "#fdfcfa",
        "inverse-primary": "#9dc4a8",
        "surface-container-high": "#e9e7e1",
        "inverse-on-surface": "#f2f1ed",
        "secondary-container": "#f6e7ab",
        "primary": "#1d2320",
        "surface": "#f4f3ef"
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px"
      },
      spacing: {
        "container-max": "1440px",
        "margin-desktop": "64px",
        "margin-mobile": "20px",
        "gutter": "24px",
        "unit": "8px"
      },
      fontFamily: {
        "headline-xl-mobile": ["Montserrat", "ui-sans-serif", "system-ui", "sans-serif"],
        "headline-md": ["Montserrat", "ui-sans-serif", "system-ui", "sans-serif"],
        "headline-xl": ["Montserrat", "ui-sans-serif", "system-ui", "sans-serif"],
        "label-caps": ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        "display-lg": ["Montserrat", "ui-sans-serif", "system-ui", "sans-serif"],
        "body-lg": ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        "body-md": ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      fontSize: {
        "headline-xl-mobile": ["32px", { lineHeight: "1.2", fontWeight: "800" }],
        "headline-md": ["24px", { lineHeight: "1.3", fontWeight: "700" }],
        "headline-xl": ["48px", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "800" }],
        "label-caps": ["12px", { lineHeight: "1.0", letterSpacing: "0.1em", fontWeight: "500" }],
        "display-lg": ["80px", { lineHeight: "1.0", letterSpacing: "-0.04em", fontWeight: "900" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
        "body-md": ["16px", { lineHeight: "1.5", fontWeight: "400" }]
      }
    }
  },
  plugins: []
};
