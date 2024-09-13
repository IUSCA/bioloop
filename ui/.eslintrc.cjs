/* eslint-env node */
require("@rushstack/eslint-patch/modern-module-resolution");

module.exports = {
  root: true,
  extends: [
    "./.eslintrc-auto-import.json",
    "plugin:vue/vue3-essential",
    "eslint:recommended", //https://github.com/eslint/eslint/blob/main/conf/eslint-recommended.js
    "@vue/eslint-config-prettier",
    "plugin:vuejs-accessibility/recommended",
    "plugin:comment-length/recommended",
  ],
  parserOptions: {
    ecmaVersion: "latest",
  },
  rules: {
    "vue/multi-word-component-names": "off",
    "no-unused-vars": [
      "error", // or "warn"
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "comment-length/limit-multi-line-comments": [
      "warn",
      {
        mode: "overflow-only",
        maxLength: 80,
        logicalWrap: true,
        ignoreUrls: true,
        ignoreCommentsWithCode: true,
        tabSize: 2,
      },
    ],
  },
};
