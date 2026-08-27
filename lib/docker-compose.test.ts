import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
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

  it("brings up redis alongside postgres in the host-flow db:up script (#92)", () => {
    // The documented host flow (README's "Run on the host") starts only
    // whatever db:up starts. If it only started `db`, nothing would listen
    // on 6380 and every rate-limit consume() would silently take the
    // fail-open branch for the whole of host-based local development.
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf-8"),
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts["db:up"]).toMatch(/up -d .*\bdb\b.*\bredis\b/);
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

// #73: the prod stack never overrode `cron` at all -- it ran the `dev`
// build target (no application code, only a bind mount at runtime), no
// restart policy, and its entrypoint applied migrations a second time,
// racing the app container's own. #100 folds in the "and a healthcheck"
// half of the same issue title.
describe("docker cron/healthcheck hardening (#73, #100)", () => {
  const dev = readFileSync(join(process.cwd(), "docker-compose.yml"), "utf-8");
  const prod = readFileSync(
    join(process.cwd(), "docker-compose.prod.yml"),
    "utf-8",
  );
  const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf-8");

  it("overrides cron in prod to build the runner target with a restart policy", () => {
    // Anchored to the service key at line-start (2-space indent), not a bare
    // "cron:" -- this file's own explanatory comment above the block also
    // contains that substring.
    const cronBlock = prod.slice(prod.indexOf("\n  cron:"));
    expect(cronBlock).toMatch(/target:\s*runner/);
    expect(cronBlock).toMatch(/restart:\s*unless-stopped/);
    expect(cronBlock).toMatch(/volumes:\s*!reset\s*\[\]/);
  });

  it("points prod's cron entrypoint at the migrate-skipping script", () => {
    const cronBlock = prod.slice(prod.indexOf("\n  cron:"));
    expect(cronBlock).toMatch(/entrypoint:.*docker-entrypoint-cron\.sh/);
  });

  it("the cron entrypoint waits for Postgres but never runs prisma migrate", () => {
    const script = readFileSync(
      join(process.cwd(), "docker-entrypoint-cron.sh"),
      "utf-8",
    );
    expect(script).toMatch(/pg_isready/);
    // Matches only an actual invocation, not the explanatory comment above
    // (which necessarily quotes the command it's explicitly not running).
    expect(script).not.toMatch(/^\s*npx prisma migrate/m);
  });

  it("the Dockerfile's runner stage installs the cron entrypoint script", () => {
    const runnerStage = dockerfile.slice(dockerfile.indexOf("AS runner"));
    expect(runnerStage).toMatch(/docker-entrypoint-cron\.sh/);
    expect(runnerStage).toMatch(/chmod \+x.*docker-entrypoint-cron\.sh/);
  });

  it("gives the app service a healthcheck that probes GET /api/health", () => {
    const appBlock = dev.slice(dev.indexOf("app:"), dev.indexOf("cron:"));
    expect(appBlock).toMatch(/healthcheck:/);
    expect(appBlock).toMatch(/\/api\/health/);
  });
});

// #102: the runner stage ran next start as root and shipped the full
// devDependency tree (tsx, vitest, jsdom, eslint, prettier, the prisma CLI)
// verbatim -- an RCE or path-traversal in any dependency had the run of the
// container, with postgresql-client and DATABASE_URL right there for a
// straight psql dump. This can't be exercised by actually running the
// image in CI, so it guards the Dockerfile/package.json shape that fixes
// both: a production-only node_modules stage, and dropping root before the
// image's entrypoint runs.
describe("Docker production hardening (#102)", () => {
  const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf-8");
  const pkg = JSON.parse(
    readFileSync(join(process.cwd(), "package.json"), "utf-8"),
  ) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    engines?: Record<string, string>;
  };

  it("builds a production-only node_modules stage with --omit=dev", () => {
    expect(dockerfile).toMatch(/FROM node:22-alpine AS prod-deps/);
    const prodDepsStage = dockerfile.slice(
      dockerfile.indexOf("AS prod-deps"),
      dockerfile.indexOf("AS dev"),
    );
    expect(prodDepsStage).toMatch(/npm ci --omit=dev/);
  });

  it("copies the runner's node_modules from prod-deps, not build", () => {
    const runnerStage = dockerfile.slice(dockerfile.indexOf("AS runner"));
    expect(runnerStage).toMatch(
      /COPY --from=prod-deps \/app\/node_modules \.\/node_modules/,
    );
    expect(runnerStage).not.toMatch(/COPY --from=build \/app\/node_modules/);
  });

  it("drops root before the runner stage's entrypoint runs", () => {
    const runnerStage = dockerfile.slice(dockerfile.indexOf("AS runner"));
    const chownIdx = runnerStage.search(/chown -R node:node \/app/);
    const userIdx = runnerStage.search(/^USER node$/m);
    const entrypointIdx = runnerStage.search(/^ENTRYPOINT/m);
    expect(chownIdx).toBeGreaterThan(-1);
    expect(userIdx).toBeGreaterThan(chownIdx);
    expect(entrypointIdx).toBeGreaterThan(userIdx);
  });

  it("keeps prisma and tsx as real dependencies, not devDependencies, since --omit=dev would otherwise drop the CLI tools the entrypoint and cron service actually run at runtime", () => {
    expect(pkg.dependencies.prisma).toBeTruthy();
    expect(pkg.dependencies.tsx).toBeTruthy();
    expect(pkg.devDependencies.prisma).toBeUndefined();
    expect(pkg.devDependencies.tsx).toBeUndefined();
  });

  it("declares the engines.node floor the shipped images actually run", () => {
    expect(pkg.engines?.node).toBeTruthy();
  });

  it("tests the same Node major version the Dockerfile images use", () => {
    // Every `node-version:` under .github, not one hardcoded file path: the
    // declaration moved out of ci.yml when the serial `quality` job was split
    // into parallel ones and setup-node went into a composite action, and
    // this test kept passing against a file that no longer had the line --
    // `ci.match(...)?.[1]` was simply undefined. Sweeping the directory means
    // a future move can't quietly hollow the assertion out again, and it also
    // catches the case a second workflow pins a DIFFERENT major.
    const dockerMajor = dockerfile.match(/node:(\d+)-alpine/)?.[1];
    expect(dockerMajor).toBeTruthy();

    const dir = join(process.cwd(), ".github");
    const declared = readdirSync(dir, { recursive: true, encoding: "utf-8" })
      .filter((f) => /\.ya?ml$/.test(f))
      .flatMap((f) => [
        ...readFileSync(join(dir, f), "utf-8").matchAll(
          /node-version:\s*["']?(\d+)/g,
        ),
      ])
      .map((m) => m[1]);

    expect(declared.length).toBeGreaterThan(0);
    expect([...new Set(declared)]).toEqual([dockerMajor]);
  });
});
