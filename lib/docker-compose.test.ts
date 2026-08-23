import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #25: an operator following the README ran `npm run docker:prod` on a VPS.
// Docker's published ports bind 0.0.0.0 and its iptables DOCKER chain
// bypasses ufw, so the committed dev credentials (postgres "moldai", redis
// with no password at all) were reachable from the internet -- a full
// database dump or an unauthenticated FLUSHALL/CONFIG SET RCE primitive away.
// This can't be tested by actually running Docker in CI, so it instead
// guards the two things that regress silently if either compose file is
// edited without re-reading this comment: the prod override resetting
// db/redis to no published ports, and neither service ever falling back to
// a default password.
describe("docker-compose production hardening (#25)", () => {
  const dev = readFileSync(join(process.cwd(), "docker-compose.yml"), "utf-8");
  const prod = readFileSync(
    join(process.cwd(), "docker-compose.prod.yml"),
    "utf-8",
  );

  it("resets db and redis to no published ports in the production override", () => {
    // Matches the file's own `!reset []` idiom (already used for app.volumes)
    // rather than a bare `ports: []`, since only the tagged form actually
    // clears a sequence merged in from the base file per the Compose spec.
    expect(prod).toMatch(/db:\s*\n\s*ports:\s*!reset\s*\[\]/);
    expect(prod).toMatch(/redis:\s*\n\s*ports:\s*!reset\s*\[\]/);
  });

  it("requires POSTGRES_PASSWORD and REDIS_PASSWORD with no default value", () => {
    // The `:?` interpolation form is Compose's own "fail the whole `up`
    // rather than silently substitute an empty/default string" -- a bare
    // `${VAR}` (no `:?`) would still let an unset variable through as "".
    expect(dev).toMatch(/POSTGRES_PASSWORD:\s*\$\{POSTGRES_PASSWORD:\?/);
    expect(dev).toMatch(/\$\{REDIS_PASSWORD:\?/);
  });

  it("never hardcodes the historical committed dev password in a connection string", () => {
    for (const file of [dev, prod]) {
      expect(file).not.toMatch(/moldai:moldai@/);
      expect(file).not.toMatch(/redis:\/\/redis:6379/); // no password segment
    }
  });

  it("threads POSTGRES_PASSWORD into every DATABASE_URL, including the cron service", () => {
    const dbUrlOccurrences =
      dev.match(/DATABASE_URL:.*\$\{POSTGRES_PASSWORD:\?/g) ?? [];
    // app + cron in docker-compose.yml -- the site the issue's own
    // implementation notes specifically warned not to miss.
    expect(dbUrlOccurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("gives redis a --requirepass matching REDIS_PASSWORD", () => {
    expect(dev).toMatch(/--requirepass/);
    expect(dev).toMatch(/REDIS_URL:.*\$\{REDIS_PASSWORD:\?/);
  });

  it("documents both new required variables in .env.example", () => {
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf-8");
    expect(example).toMatch(/^POSTGRES_PASSWORD=/m);
    expect(example).toMatch(/^REDIS_PASSWORD=/m);
  });

  it("passes .env.local as --env-file in every npm script that runs docker compose", () => {
    // env_file: inside a service only reaches the container's runtime
    // environment -- Compose's own ${VAR} interpolation in these YAML files
    // reads a project-level env file, which defaults to a literal `.env`
    // (not `.env.local`) unless overridden here. Without this, every
    // ${POSTGRES_PASSWORD:?...} above would always hit its own error, even
    // with .env.local correctly filled in.
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf-8"),
    ) as { scripts: Record<string, string> };
    for (const name of ["db:up", "docker:up", "docker:prod", "smoke:prod"]) {
      expect(pkg.scripts[name]).toContain("docker compose --env-file");
    }
  });
});
