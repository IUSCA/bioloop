/** @type {import('tailwindcss').Config} */
/* eslint-env node */
module.exports = {
  content: ["./index.html", "./src/**/*.vue"],
  theme: {
    colors: {
      // Prefer to use Vuestic color presets
      // https://vuestic.dev/en/styles/colors#color-presets
      primary: "var(--va-primary)",
      secondary: "var(--va-secondary)",
      success: "var(--va-success)",
      danger: "var(--va-danger)",
      warning: "var(--va-warning)",
      info: "var(--va-info)",
      "background-primary": "var(--va-background-primary)",
      "background-secondary": "var(--va-background-secondary)",
      "background-element": "var(--va-background-element)",
      "background-border": "var(--va-background-border)",
      "text-primary": "var(--va-text-primary",
      "text-inverted": "var(--va-text-inverted)",
      shadow: "var(--va-shadow)",
      focus: "var(--va-focus)",
    },
    extend: {},
  },
  plugins: [],
};
