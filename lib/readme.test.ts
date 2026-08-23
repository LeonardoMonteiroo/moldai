import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #91: the repo's front door contradicted CLAUDE.md and lib/mail/send.ts on
// three counts -- it called billing "a mock top-up (Phase C pending)" when
// Phase C is fully shipped, used the pt-BR "molde" term two repo-wide rename
// sweeps exist to eliminate, and listed only 3 of .env.local's variables
// with no mention that the production stack needs APP_URL/SMTP_HOST or
// POST /api/signup answers 503 mail_unavailable. Like the docker-compose
// suite, this can't be tested by actually running the docs -- it guards the
// specific facts that regress silently if README is edited without
// re-reading this comment.
describe("README accuracy (#91)", () => {
  const readme = readFileSync(join(process.cwd(), "README.md"), "utf-8");

  it("never calls billing a Phase C / pending mock -- it is fully shipped", () => {
    expect(readme).not.toMatch(/phase c/i);
  });

  it("never uses the pt-BR 'molde' term for a pattern (Molde.me, the export target, is fine)", () => {
    const withoutMoldeMe = readme.replace(/Molde\.me/g, "");
    expect(withoutMoldeMe).not.toMatch(/\bmolde\b/i);
  });

  it("documents that the production stack needs APP_URL and SMTP_HOST", () => {
    expect(readme).toMatch(/APP_URL/);
    expect(readme).toMatch(/SMTP_HOST/);
    expect(readme).toMatch(/mail_unavailable/);
  });

  it("points at .env.example rather than hand-listing a stale variable count", () => {
    expect(readme).toMatch(/\.env\.example/);
  });

  it("mentions every shipped MVP screen", () => {
    for (const path of ["/settings", "/size-charts", "/slopers"]) {
      expect(readme).toContain(path);
    }
  });
});
