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
    // Gitignored local tooling artifacts. ESLint 9's flat config does NOT
    // read .gitignore, so these have to be named here or a developer who has
    // run DesignSync lints a vendored React bundle: measured, `npm run lint`
    // reported 1249 problems against ds-bundle/_vendor/react.js and friends,
    // none of them this repo's code. CI never saw it (a clean checkout has
    // neither directory), which is exactly what makes it worth writing down.
    ".ds-sync/**",
    "ds-bundle/**",
    // Same shape: `npx vitest run --coverage` writes an lcov HTML report
    // here, and its vendored viewer scripts carry their own eslint-disable
    // directives that this config has no rules for -- so linting them
    // reports a warning about someone else's file. .prettierignore already
    // lists this directory for the same reason.
    "coverage/**",
    // Agent worktrees are full checkouts of this same repo, complete with
    // their own node_modules and .next. The patterns above are root-relative,
    // so a nested checkout's build output is not covered by them -- left
    // unignored, a stale worktree took the same lint run to 212632 problems.
    ".claude/worktrees/**",
    // Vendored agent tooling and the design handoff's own editor runtime.
    // None of it is this repo's source, all of it is written to its authors'
    // conventions (CommonJS `require`, ReactDOM.render), and .prettierignore
    // ALREADY excludes `.claude/` and `docs/design/screens/` -- so leaving
    // them unignored here made eslint and prettier disagree about which
    // files are ours. Measured: 10 errors and 13 warnings from
    // .claude/skills/{mermaid-studio,playwright-skill}/** and
    // docs/design/screens/support.js, none of them actionable, which made a
    // bare `npm run lint` useless locally while CI -- which lints only
    // `app lib components` -- stayed green. That gap is the whole reason
    // `npm run lint` could not be trusted to predict CI.
    ".claude/skills/**",
    ".agents/skills/**",
    "docs/design/screens/**",
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
