/** All in 1 Events — Tailwind build config.
 *
 * Lifted verbatim from the inline `tailwind.config` that used to sit in a
 * <script> tag in index.html and be interpreted by the Tailwind CDN at runtime.
 * The values are unchanged; only where they are read from has moved.
 *
 * Why this exists at all: the CDN build compiles CSS in the browser on every
 * page load. Tailwind's own docs say it is for development and not for
 * production. In practice it means the page ships unstyled until a
 * third-party script downloads and runs, a visible flash on a slow connection,
 * and a hard dependency on cdn.tailwindcss.com being reachable — anyone on a
 * network that blocks it sees raw HTML. 420 Friendly was moved off the CDN
 * earlier for the same reasons; this brings the events site in line.
 *
 * Build:  npm run build:events   (from the repo root)
 */
module.exports = {
  content: ["index.html", "js/*.js"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "surface-container": "#1e2024",
        "surface-container-highest": "#333539",
        "tertiary": "#ffb1c3",
        "surface-bright": "#37393e",
        "primary": "#ecb2ff",
        "secondary-container": "#00eefc",
        "surface-container-low": "#1a1c20",
        "on-primary": "#520071",
        "on-surface-variant": "#d4c0d7",
        "on-surface": "#e2e2e8",
        "primary-container": "#bd00ff",
        "secondary-fixed": "#7df4ff",
        "outline": "#9d8ba0",
        "outline-variant": "#514255",
        "error": "#ffb4ab",
        "background": "#111317",
        "on-background": "#e2e2e8",
        "surface": "#111317",
        "secondary": "#d3fbff",
        "surface-container-high": "#282a2e",
        "surface-container-lowest": "#0c0e12",
        "tertiary-container": "#e7006e"
      },
      borderRadius: { DEFAULT: "0.25rem", lg: "0.5rem", xl: "0.75rem", full: "9999px" },
      spacing: {
        "margin-mobile": "16px",
        "gutter": "24px",
        "margin-desktop": "64px",
        "container-max-width": "1280px"
      },
      fontFamily: {
        "body-md": ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        "headline-lg": ["Sora", "ui-sans-serif", "system-ui", "sans-serif"],
        "headline-xl": ["Sora", "ui-sans-serif", "system-ui", "sans-serif"],
        "label-sm": ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      fontSize: {
        "body-md": ["16px", { lineHeight: "24px", fontWeight: "400" }],
        "headline-lg": ["32px", { lineHeight: "40px", fontWeight: "600" }],
        "headline-xl": ["48px", { lineHeight: "56px", letterSpacing: "-0.02em", fontWeight: "700" }],
        "label-sm": ["12px", { lineHeight: "16px", letterSpacing: "0.05em", fontWeight: "600" }]
      }
    }
  },
  // The CDN was loaded as `?plugins=forms,container-queries`, so both must be
  // here or form controls and @container queries silently lose their styling.
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/container-queries")]
};
