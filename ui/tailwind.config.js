/** @type {import('tailwindcss').Config} */
/* eslint-env node */
module.exports = {
  content: ["./index.html", "./src/**/*.vue"],
  theme: {
    extend: {
      // Two v2 steps between Tailwind's own, in rem so they follow the root font size.
      // A string value sets font-size only, leaving line-height inherited.
      // @see docs/contributing/v2-design-system.md - Typography
      fontSize: {
        "2xs": "0.6875rem", // 11px at a 16px root
        "xs-plus": "0.8125rem", // 13px at a 16px root
      },
    },
  },
  plugins: [],
  darkMode: "class", // https://tailwindcss.com/docs/dark-mode
};
