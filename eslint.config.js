import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      "src/routeTree.gen.ts",
    ],
  },

  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],

    files: ["**/*.{ts,tsx}"],

    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },

    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },

    rules: {
      ...reactHooks.configs.recommended.rules,

      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],

      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],

      /*
       * This project deliberately uses `any` in a few generic
       * Supabase/data compatibility helpers.
       *
       * Do not make that a fatal CI error.
       */
      "@typescript-eslint/no-explicit-any": "off",

      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  eslintPluginPrettier,

  {
    rules: {
      /*
       * Formatting differences should be visible,
       * but they should not block preview/build.
       */
      "prettier/prettier": "warn",

      /*
       * Re-assert this after the Prettier preset so no later
       * config accidentally restores it.
       */
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
