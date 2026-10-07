import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // supabase/functions is Deno server code, not part of the browser app.
  // legacy-functions: read-only downloaded copies of old Supabase functions (git-ignored, not app code)
  { ignores: ["dist", "supabase/functions", "legacy-functions"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
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
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      // Existing code uses `any` in ~55 places; warn so new code avoids it without
      // blocking the build on a codebase-wide retype.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  }
);
