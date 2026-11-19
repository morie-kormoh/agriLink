// Shared ESLint flat config for all AgriLink packages.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

/** @param {{ react?: boolean }} [opts] */
export function config(opts = {}) {
  return tseslint.config(
    {
      ignores: [
        "**/node_modules/**",
        "**/.next/**",
        "**/dist/**",
        "**/src/generated/**",
        "**/coverage/**",
        "**/public/sw.js",
        "**/next-env.d.ts",
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      languageOptions: {
        globals: { ...globals.node, ...globals.browser },
      },
      rules: {
        "@typescript-eslint/no-unused-vars": [
          "warn",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/consistent-type-imports": "warn",
        "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      },
    },
    ...(opts.react
      ? [
          {
            plugins: { "react-hooks": reactHooks },
            rules: {
              "react-hooks/rules-of-hooks": "error",
              "react-hooks/exhaustive-deps": "warn",
            },
          },
        ]
      : []),
  );
}
