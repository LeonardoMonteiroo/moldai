import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next/core-web-vitals already registers the "jsx-a11y"
  // plugin at its "recommended" level, so spreading jsxA11y.flatConfigs.strict
  // (which re-registers `plugins: { "jsx-a11y": ... }`) throws
  // `ConfigError: Cannot redefine plugin "jsx-a11y"` under ESLint 9. Instead,
  // just raise the rule set to strict without re-registering the plugin.
  {
    rules: jsxA11y.flatConfigs.strict.rules,
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Must be last: disables formatting-related rules that conflict with Prettier.
  eslintConfigPrettier,
]);

export default eslintConfig;
