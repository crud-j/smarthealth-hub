import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next 16+ ships native flat configs — the old FlatCompat
// wrapper crashes on them ("Converting circular structure to JSON").
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "types/api.generated.d.ts",
  ]),
  {
    rules: {
      // React Compiler rules introduced by eslint-plugin-react-hooks v7.
      // Existing code predates them and works correctly at runtime; kept as
      // warnings so they stay visible and can be refactored incrementally.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",

      // Allow parameters/variables prefixed with _ to be intentionally unused
      // (standard TypeScript convention for stub functions and future-phase placeholders)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
