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
  // The three .d.ts files at the root of ui/ are generated: unplugin-auto-import writes
  // auto-imports.d.ts, unplugin-vue-components writes components.d.ts, and the router plugin
  // writes typed-router.d.ts. They are TypeScript declarations, and no TypeScript parser is
  // configured here, so espree stops at `declare global` with a parsing error. Their own
  // `/* eslint-disable */` header cannot help, because parsing fails before any rule runs.
  ignorePatterns: ["/*.d.ts"],
  rules: {
    "vue/multi-word-component-names": "off",
    "vuejs-accessibility/label-has-for": "off",
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
        maxLength: 120,
        logicalWrap: true,
        ignoreUrls: true,
        ignoreCommentsWithCode: true,
        tabSize: 2,
      },
    ],
    "comment-length/limit-single-line-comments": [
      "warn",
      {
        mode: "overflow-only",
        maxLength: 120,
        logicalWrap: true,
        ignoreUrls: true,
        ignoreCommentsWithCode: true,
        tabSize: 2,
      },
    ],
    // Ignore parsing errors for custom tags like <route>
    "vue/no-parsing-error": [
      "error",
      {
        "invalid-first-character-of-tag-name": false,
      },
    ],
    // Ignore unknown at-rules in CSS (e.g., @apply for Tailwind)
    "vue/no-unknown-css-at-rules": "off",
  },
  overrides: [
    {
      // These two forms receive a composable-backed store through `formState`, rather than
      // data the parent owns. The modal builds one `useRequestAccessForm` /
      // `useReviewRequestForm` instance and passes it down, because two instances meant the
      // Submit button read a state the form never filled in. The composable returns
      // `reactive()`, so `v-model="formState.purpose"` is the intended way to write to it.
      //
      // `shallowOnly` keeps the half of the rule that still matters here: reassigning
      // `formState` itself stays an error, because that would detach the child from the
      // instance the modal submits.
      files: [
        "src/components/v2/access-requests/RequestAccessForm.vue",
        "src/components/v2/access-requests/ReviewRequestForm.vue",
      ],
      rules: {
        "vue/no-mutating-props": ["error", { shallowOnly: true }],
      },
    },
  ],
};
