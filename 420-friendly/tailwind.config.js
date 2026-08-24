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
        "surface-container-lowest": "#0e0e0e",
        "on-error-container": "#ffdad6",
        "secondary": "#e9c349",
        "secondary-fixed": "#ffe088",
        "surface-dim": "#131313",
        "on-primary-fixed-variant": "#2f4d3b",
        "on-tertiary-container": "#00a626",
        "primary-container": "#0f2e1e",
        "on-tertiary": "#003907",
        "background": "#131313",
        "error-container": "#93000a",
        "on-primary-container": "#769781",
        "tertiary-fixed-dim": "#00e639",
        "outline": "#8c928c",
        "on-background": "#e5e2e1",
        "on-error": "#690005",
        "outline-variant": "#424843",
        "primary-fixed": "#c8ebd2",
        "surface-container": "#201f1f",
        "surface-container-low": "#1c1b1b",
        "tertiary-container": "#003005",
        "inverse-surface": "#e5e2e1",
        "on-surface": "#e5e2e1",
        "tertiary-fixed": "#72ff70",
        "on-secondary-fixed": "#241a00",
        "surface-container-highest": "#353534",
        "on-primary": "#183626",
        "on-tertiary-fixed-variant": "#00530e",
        "surface-variant": "#353534",
        "tertiary": "#00e639",
        "secondary-fixed-dim": "#e9c349",
        "on-tertiary-fixed": "#002203",
        "error": "#ffb4ab",
        "on-surface-variant": "#c2c8c1",
        "primary-fixed-dim": "#accfb7",
        "on-secondary-fixed-variant": "#574500",
        "surface-tint": "#accfb7",
        "on-primary-fixed": "#022112",
        "on-secondary": "#3c2f00",
        "on-secondary-container": "#342800",
        "surface-bright": "#393939",
        "inverse-primary": "#466552",
        "surface-container-high": "#2a2a2a",
        "inverse-on-surface": "#313030",
        "secondary-container": "#af8d11",
        "primary": "#accfb7",
        "surface": "#131313"
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
