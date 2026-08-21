# Standard App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every full-page screen one identical header by routing all four screens through a single `AppShell` frame that owns the header, merging the dashboard's divergent `DashboardTopbar` into the editor's `PageHeader` with no capability lost — and stand up a React Testing Library harness so the shared UI primitives are actually tested.

**Architecture:** A new `components/shared/AppShell.tsx` owns the page frame — header row, optional 186px sidebar slot, content region, optional footer slot — and constructs `PageHeader` itself from plain data props, so no screen can hand-roll a header. `PageHeader` absorbs `DashboardTopbar`'s account dropdown (the only route to `/settings?section=plan|profile`), widens `credits` to nullable for the dashboard's pre-fetch window, and makes `← Voltar` opt-in via `backHref`. A new `components/shared/Wordmark.tsx` replaces five copies of the brand lockup. `DashboardTopbar.tsx` and `editor/Topbar.tsx` are deleted.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 (`@theme` tokens in `app/globals.css`, no `tailwind.config.ts`), shadcn/ui primitives in `components/ui/`, `next-intl` (single pt-BR catalog), Zustand, Vitest 2 + React Testing Library 16 + jsdom.

**Spec:** `docs/superpowers/specs/2026-08-21-standard-app-shell-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Typecheck with `npm run build`, never bare `tsc`** — bare `tsc` reports a spurious `app/layout.tsx` `LayoutProps` error under Next 16.
- **Lint with `npx eslint app lib components`, never `npm run lint`** — a repo-root run crawls `.claude/worktrees/` and false-alarms. A PreToolUse hook blocks the bare form.
- **Install with `--legacy-peer-deps`** — that is what `Dockerfile`, `.github/workflows/ci.yml` and the existing lockfile use.
- **UI display text is pt-BR and lives in `messages/pt-BR.json`**, read via `useTranslations("Namespace")` → `t("key")`. Never hardcode accented pt-BR in `.tsx`. A PostToolUse hook checks this, plus that every `t("literal")` key resolves inside its declared namespace. **This applies to test files too** — assert against `messages/pt-BR.json` values, never against a pasted pt-BR string. That also makes the tests catch catalog drift, which is the point.
- **Code identifiers, props and routes are English.** UI display text is pt-BR.
- **Never hardcode hex colors** — use the `@theme` tokens. The hook checks this.
- **Type comes from the named scale** (`text-tick`/`text-meta`/`text-ui`/`text-control`/`text-body`/`text-title`/`text-display`). Never `text-[Npx]`, never stock Tailwind `text-sm`/`xs`/`base`/`lg`.
- **Tune shadcn primitives in `components/ui/`, not with per-call-site `className`** — layout-only overrides (`justify-start`, `text-muted-2`, gap/padding) are the existing exception and are used here; variant/size/color changes are not.
- **Commits are English Conventional Commits** — `type(scope): summary`. A husky pre-commit `lint-staged` runs eslint + prettier + `vitest related` on staged files, so formatting is applied automatically at commit time.
- **A Stop hook runs `vitest run` + `eslint app lib components`** whenever `.ts`/`.tsx` under `app/`, `lib/`, `components/` changed. It blocks the turn on failure.
- **CI runs** `npm run format:check`, `npx eslint app lib components`, `npx vitest run`, `npm run build`. All four must pass.

---

### Task 0: Stand up the React Testing Library harness

Nothing in Tasks 1–4 can be written test-first until this exists. It is deliberately a **two-project** Vitest setup: the 20+ existing `lib/**` and `app/api/**` suites keep running in the `node` environment exactly as they do today, and only `components/**/*.test.tsx` gets jsdom plus a DOM setup file. A single shared config would have forced the RTL/jest-dom setup file to load for node tests too.

**Files:**

- Modify: `package.json` (five devDependencies)
- Delete: `vitest.config.ts`
- Create: `vitest.workspace.ts`
- Create: `vitest.setup.ts`
- Create: `components/test-utils.tsx`
- Create: `components/test-utils.test.tsx` (the harness's own test)

**Interfaces:**

- Consumes: nothing.
- Produces, from `components/test-utils.tsx`:
  - `renderWithIntl(ui: ReactElement): RenderResult` — renders inside `NextIntlClientProvider` with the real `messages/pt-BR.json`.
  - `ptBR` — the parsed `messages/pt-BR.json`, so tests assert against catalog values rather than pasted pt-BR literals.
  - Re-exports `screen`, `within`, `waitFor`, `act` from `@testing-library/react` and `userEvent` from `@testing-library/user-event`.

- [ ] **Step 1: Install the testing dependencies**

```bash
npm i -D --legacy-peer-deps jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event
```

Expected: installs cleanly. `@testing-library/dom` is an explicit peer of RTL 16 and must be listed, not left transitive.

- [ ] **Step 2: Replace `vitest.config.ts` with a two-project workspace**

Delete `vitest.config.ts`:

```bash
git rm vitest.config.ts
```

Create `vitest.workspace.ts`:

```ts
import { defineWorkspace } from "vitest/config";
import path from "node:path";

const alias = { "@": path.resolve(__dirname, ".") };

/**
 * Two projects on purpose.
 *
 * "node" is the pre-existing suite (lib/**, app/api/**): pure logic, no DOM,
 * no setup file. Keeping it isolated means the RTL + jest-dom setup below is
 * never loaded for it.
 *
 * "dom" is the component suite. jsdom + a setup file that installs the
 * matchers, auto-cleanup, and the handful of browser APIs jsdom lacks but the
 * Radix primitives in components/ui/ call.
 */
export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: "node",
      environment: "node",
      include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    },
  },
  {
    // tsconfig says "jsx": "react-jsx", but stating it here keeps the test
    // transform independent of the app's tsconfig.
    esbuild: { jsx: "automatic" },
    resolve: { alias },
    test: {
      name: "dom",
      environment: "jsdom",
      include: ["components/**/*.test.tsx"],
      setupFiles: ["./vitest.setup.ts"],
    },
  },
]);
```

- [ ] **Step 3: Create `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// jsdom gaps that the Radix primitives in components/ui/ reach for. Each is
// guarded so a future jsdom that implements one wins over the stub.
// ---------------------------------------------------------------------------

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (!globalThis.matchMedia) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof matchMedia;
}
```

- [ ] **Step 4: Create `components/test-utils.tsx`**

```tsx
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/pt-BR.json";

/**
 * Renders inside the real pt-BR catalog rather than a mocked translator, so a
 * component reading a key that does not exist fails the test instead of
 * silently rendering the key name.
 */
export function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/**
 * The catalog itself. Tests assert against these values instead of pasting
 * pt-BR literals — required by the repo's no-hardcoded-display-text rule, and
 * it makes a copy change a one-place edit rather than a test failure.
 */
export { default as ptBR } from "@/messages/pt-BR.json";

export { screen, within, waitFor, act } from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
```

- [ ] **Step 5: Write the harness's own test**

A permanent test of the harness itself, not throwaway scaffolding: it proves jsdom booted, the JSX transform ran, the setup file's matchers loaded, and — the part that matters for every later task — that `renderWithIntl` really does supply the **real** catalog rather than a stub.

Create `components/test-utils.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { useTranslations } from "next-intl";
import { renderWithIntl, ptBR, screen } from "./test-utils";

function Probe() {
  const t = useTranslations("PageHeader");
  return <span>{t("buyCreditsButton")}</span>;
}

describe("renderWithIntl", () => {
  it("supplies the real pt-BR catalog to the tree", () => {
    renderWithIntl(<Probe />);
    // Resolves to the catalog value, not the key name — which is what makes a
    // missing key a test failure in every component test that follows.
    expect(
      screen.getByText(ptBR.PageHeader.buyCreditsButton),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the full suite green**

Run: `npx vitest run`

Expected: the `node` project's existing suites all pass (unchanged) **and** the `dom` project passes its 1 test.

If you see `document is not defined`, `ReferenceError: React is not defined`, or a JSX syntax error, the harness is wrong — fix Steps 2–4 before continuing. If the assertion fails because the rendered text is the literal `buyCreditsButton`, the provider is not receiving `messages`.

- [ ] **Step 7: Lint and typecheck**

Run: `npx eslint app lib components && npm run build`

Expected: eslint exit 0; build `✓ Compiled successfully`. The build typechecks the new test files too — `Dockerfile` and CI both `npm ci --legacy-peer-deps` without `--omit=dev`, so the devDependencies resolve there as well.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.workspace.ts vitest.setup.ts components/test-utils.tsx components/test-utils.test.tsx
git rm --cached vitest.config.ts
git commit -m "test: add a React Testing Library harness as a second vitest project"
```

---

### Task 1: Extract the `Wordmark` component

**Files:**

- Create: `components/shared/Wordmark.tsx`
- Modify: `components/shared/PageHeader.tsx` (the wordmark `<span>`)
- Modify: `components/dashboard/DashboardTopbar.tsx` (the wordmark `<span>`)
- Modify: `app/login/page.tsx:74-76`
- Modify: `app/signup/page.tsx:74-76`
- Modify: `app/verify/page.tsx:15-17`
- Create: `components/shared/Wordmark.test.tsx`

**Interfaces:**

- Consumes: the Task 0 harness.
- Produces: `Wordmark()` — a zero-prop presentational component exported from `components/shared/Wordmark.tsx`. Tasks 2 and 3 import it as `import { Wordmark } from "@/components/shared/Wordmark";`.

- [ ] **Step 1: Write the failing test**

Create `components/shared/Wordmark.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Wordmark } from "./Wordmark";

describe("Wordmark", () => {
  it("renders the MoldAI lockup with AI in the accent span", () => {
    // getByText would not match: RTL compares each element's *direct* text
    // children, and the lockup deliberately splits "Mold" from "AI".
    const { container } = render(<Wordmark />);
    expect(container.textContent).toBe("MoldAI");
    expect(container.querySelector(".text-olive")?.textContent).toBe("AI");
  });
});
```

Run: `npx vitest run --project dom`

Expected: FAIL — cannot resolve `./Wordmark`.

- [ ] **Step 2: Create the component**

`app/verify/page.tsx` is a **Server Component**. Do NOT put `"use client"` in this file — without the directive it renders in both server and client trees, which is what the five call sites need.

Create `components/shared/Wordmark.tsx`:

```tsx
/**
 * The MoldAI brand lockup. Deliberately has no "use client" directive: it is
 * rendered from client shells (PageHeader) and from the Server Component
 * app/verify/page.tsx alike.
 */
export function Wordmark() {
  return (
    <span className="font-display text-title tracking-wordmark font-bold">
      Mold<span className="text-olive">AI</span>
    </span>
  );
}
```

- [ ] **Step 3: Confirm the test passes**

Run: `npx vitest run --project dom`

Expected: 1 test file, 1 test, PASS.

- [ ] **Step 4: Replace the five call sites**

In each file, replace this exact three-line block:

```tsx
<span className="font-display text-title tracking-wordmark font-bold">
  Mold<span className="text-olive">AI</span>
</span>
```

with:

```tsx
<Wordmark />
```

adding this import to each of the five files:

```tsx
import { Wordmark } from "@/components/shared/Wordmark";
```

The five files: `components/shared/PageHeader.tsx`, `components/dashboard/DashboardTopbar.tsx`, `app/login/page.tsx`, `app/signup/page.tsx`, `app/verify/page.tsx`.

- [ ] **Step 5: Verify no copies remain, then lint and typecheck**

Run: `grep -rn 'Mold<span' app components && npx eslint app lib components && npm run build`

Expected: grep prints **only** `components/shared/Wordmark.tsx:...` (any other file means a call site was missed); eslint exit 0; build `✓ Compiled successfully`.

- [ ] **Step 6: Commit**

```bash
git add components/shared/Wordmark.tsx components/shared/Wordmark.test.tsx components/shared/PageHeader.tsx components/dashboard/DashboardTopbar.tsx app/login/page.tsx app/signup/page.tsx app/verify/page.tsx
git commit -m "refactor(ui): extract the MoldAI wordmark into a shared component"
```

---

### Task 2: `PageHeader` absorbs the account dropdown, nullable credits, and opt-in back

`DashboardTopbar` still exists and still renders after this task — the dashboard is migrated in Task 4. The two headers coexist for one task, which is why the `DashboardTopbar` i18n namespace is **left intact** here (deleting it now would break that component's key resolution and trip the convention hook).

**Files:**

- Create: `components/shared/PageHeader.test.tsx`
- Modify: `components/shared/PageHeader.tsx` (full rewrite — content below)
- Modify: `messages/pt-BR.json` (add four keys to the `PageHeader` namespace)
- Modify: `components/editor/Topbar.tsx` (pass `backHref`)
- Modify: `components/settings/SettingsShell.tsx:32` (pass `backHref`)
- Modify: `components/size-charts/SizeChartsShell.tsx:31-36` (pass `backHref`)

**Interfaces:**

- Consumes: `Wordmark()` from Task 1; `renderWithIntl`, `ptBR`, `screen`, `userEvent` from `components/test-utils.tsx`.
- Produces: `PageHeader` with this exact prop type, which Task 3's `AppShell` mirrors:

  ```tsx
  {
    title: string;
    subtitle?: string;
    backHref?: string;
    credits: Credits | null;
    userEmail: string;
  }
  ```

  `Credits` is `import type { Credits } from "@/lib/types"` — `{ plan: PlanId; planLabel: string; balance: number; total: number; renewsInDays: number }`.

- [ ] **Step 1: Add the four merged keys to the `PageHeader` i18n namespace**

In `messages/pt-BR.json`, the `PageHeader` namespace currently reads:

```json
"PageHeader": {
  "backTitle": "Voltar para meus moldes",
  "backButton": "← Voltar",
  "creditsLabel": "{planLabel} · {balance} créditos",
  "outOfTotal": "de {total}",
  "buyCreditsButton": "Comprar créditos",
  "signOutButton": "Sair"
},
```

Replace it with (four keys added, copied from the `DashboardTopbar` namespace; `signOutButton` already covers what `DashboardTopbar.signOutMenuItem` said):

```json
"PageHeader": {
  "backTitle": "Voltar para meus moldes",
  "backButton": "← Voltar",
  "creditsLabel": "{planLabel} · {balance} créditos",
  "outOfTotal": "de {total}",
  "buyCreditsButton": "Comprar créditos",
  "signOutButton": "Sair",
  "accountMenuLabel": "Conta",
  "usageMenuItem": "Créditos e uso",
  "planMenuItem": "Plano e cobrança",
  "preferencesMenuItem": "Preferências"
},
```

Leave the `DashboardTopbar` namespace exactly as it is — Task 4 deletes it.

- [ ] **Step 2: Write the failing tests**

Create `components/shared/PageHeader.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";
import type { Credits } from "@/lib/types";
import { PageHeader } from "./PageHeader";

const { push, signOut } = vi.hoisted(() => ({
  push: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next-auth/react", () => ({ signOut }));

const CREDITS: Credits = {
  plan: "atelier",
  planLabel: "Ateliê",
  balance: 320,
  total: 500,
  renewsInDays: 12,
};

const t = ptBR.PageHeader;

beforeEach(() => {
  push.mockClear();
  signOut.mockClear();
});

describe("PageHeader", () => {
  it("omits the back button when no backHref is given", () => {
    renderWithIntl(
      <PageHeader title="Meus moldes" credits={CREDITS} userEmail="a@b.com" />,
    );
    expect(
      screen.queryByRole("button", { name: t.backButton }),
    ).not.toBeInTheDocument();
  });

  it("renders the back button and navigates to backHref", async () => {
    renderWithIntl(
      <PageHeader
        title="Blusa"
        backHref="/"
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: t.backButton }));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("renders the title and subtitle", () => {
    renderWithIntl(
      <PageHeader
        title="Blusa"
        subtitle="há 2 min · v3"
        credits={CREDITS}
        userEmail="a@b.com"
      />,
    );
    expect(screen.getByText("Blusa")).toBeInTheDocument();
    expect(screen.getByText("há 2 min · v3")).toBeInTheDocument();
  });

  it("omits the credits bar and buy button while credits are null", () => {
    renderWithIntl(
      <PageHeader title="Meus moldes" credits={null} userEmail="a@b.com" />,
    );
    expect(
      screen.queryByRole("button", { name: t.buyCreditsButton }),
    ).not.toBeInTheDocument();
    // The account menu is always available, credits or not.
    expect(
      screen.getByRole("button", { name: t.accountMenuLabel }),
    ).toBeInTheDocument();
  });

  it("shows the balance and sends the buy button to the usage section", async () => {
    renderWithIntl(
      <PageHeader title="Blusa" credits={CREDITS} userEmail="a@b.com" />,
    );
    expect(screen.getByText(/320/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: t.buyCreditsButton }),
    );
    expect(push).toHaveBeenCalledWith("/settings?section=usage");
  });

  it("reaches every settings section from the account menu", async () => {
    renderWithIntl(
      <PageHeader title="Blusa" credits={CREDITS} userEmail="a@b.com" />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: t.accountMenuLabel }),
    );

    expect(
      await screen.findByRole("menuitem", { name: t.usageMenuItem }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: t.preferencesMenuItem }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("menuitem", { name: t.planMenuItem }),
    );
    expect(push).toHaveBeenCalledWith("/settings?section=plan");
  });

  it("signs out from the account menu", async () => {
    renderWithIntl(
      <PageHeader title="Blusa" credits={CREDITS} userEmail="a@b.com" />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: t.accountMenuLabel }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: t.signOutButton }),
    );
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});

describe("PageHeader catalog", () => {
  it("carries the account-menu keys absorbed from DashboardTopbar", () => {
    expect(t.accountMenuLabel).toBeTruthy();
    expect(t.usageMenuItem).toBeTruthy();
    expect(t.planMenuItem).toBeTruthy();
    expect(t.preferencesMenuItem).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail for the right reason**

Run: `npx vitest run --project dom`

Expected: `Wordmark` passes; `PageHeader` fails. The failures should be assertion failures about the missing account menu and the still-present back button — **not** a crash. A `TypeError` mentioning `credits` means `PageHeader` still requires a non-null `credits`, which is also expected at this point.

- [ ] **Step 4: Rewrite `components/shared/PageHeader.tsx`**

Full new content:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import type { Credits } from "@/lib/types";
import { initialsFromEmail } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Wordmark } from "@/components/shared/Wordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The one header every full-page screen shows. Rendered only by AppShell —
 * screens pass data, never a header element, so no screen can drift.
 *
 * `credits` is nullable for the dashboard, whose balance arrives from
 * /api/account/summary after first paint; the bar and "Comprar créditos" are
 * simply absent until it lands, rather than the whole header flickering in.
 *
 * `backHref` is opt-in: the dashboard IS "/" and must not offer a back button
 * pointing at itself.
 */
export function PageHeader({
  title,
  subtitle,
  backHref,
  credits,
  userEmail,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  credits: Credits | null;
  userEmail: string;
}) {
  const t = useTranslations("PageHeader");
  const router = useRouter();
  const pct = credits ? Math.round((credits.balance / credits.total) * 100) : 0;

  const sections = [
    { section: "usage", label: t("usageMenuItem") },
    { section: "plan", label: t("planMenuItem") },
    { section: "profile", label: t("preferencesMenuItem") },
  ];

  return (
    <div className="bg-surface border-border relative flex items-center gap-4 border-b px-[18px] py-3">
      <Wordmark />
      <Separator orientation="vertical" className="h-5" />
      {backHref && (
        <Button
          variant="outline"
          size="chrome"
          onClick={() => router.push(backHref)}
          title={t("backTitle")}
          className="text-muted-2"
        >
          {t("backButton")}
        </Button>
      )}
      <div className="flex flex-col gap-px">
        <span className="text-control font-semibold">{title}</span>
        {subtitle && <span className="text-muted text-meta">{subtitle}</span>}
      </div>
      <div className="flex-1" />
      {credits && (
        <>
          <div className="flex w-[168px] flex-col gap-[5px]">
            <div className="text-muted text-meta flex justify-between">
              <span>
                {t("creditsLabel", {
                  planLabel: credits.planLabel,
                  balance: credits.balance,
                })}
              </span>
              <span>{t("outOfTotal", { total: credits.total })}</span>
            </div>
            <div className="bg-track h-[5px] overflow-hidden rounded-full">
              <div className="bg-olive h-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <Button
            variant="outline"
            size="chrome"
            onClick={() => router.push("/settings?section=usage")}
          >
            {t("buyCreditsButton")}
          </Button>
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Explicit label: aria-hidden on the avatar alone did not keep its
              initials out of the computed name, so the trigger states it. */}
          <Button
            variant="ghost"
            size="chrome"
            aria-label={t("accountMenuLabel")}
            className="gap-1.5 px-1"
          >
            <Avatar
              title={userEmail}
              className="border-olive-border size-[30px] border"
            >
              <AvatarFallback className="bg-olive-tint text-olive text-ui font-semibold">
                {initialsFromEmail(userEmail)}
              </AvatarFallback>
            </Avatar>
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[190px]">
          <DropdownMenuLabel className="text-muted text-meta truncate font-normal">
            {userEmail}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {sections.map(({ section, label }) => (
              <DropdownMenuItem
                key={section}
                onSelect={() => router.push(`/settings?section=${section}`)}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })}>
            {t("signOutButton")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run --project dom`

Expected: all `PageHeader` and `Wordmark` tests PASS.

If a dropdown test fails with an act() warning or the menu never opens, the cause is a missing jsdom API — re-check `vitest.setup.ts` from Task 0, Step 3, rather than weakening the test.

- [ ] **Step 6: Pass `backHref` from the three existing callers**

`← Voltar` is now opt-in, so without this step it silently vanishes from all three screens.

In `components/editor/Topbar.tsx`, add `backHref="/"`:

```tsx
<PageHeader
  title={pattern.name}
  subtitle={t("savedVersion", {
    savedAgo: pattern.savedAgo,
    version: pattern.version,
  })}
  backHref="/"
  credits={credits}
  userEmail={userEmail}
/>
```

In `components/settings/SettingsShell.tsx`, replace line 32:

```tsx
<PageHeader
  title={t("title")}
  backHref="/"
  credits={credits}
  userEmail={userEmail}
/>
```

In `components/size-charts/SizeChartsShell.tsx`, add `backHref="/"`:

```tsx
<PageHeader
  title={t("title")}
  subtitle={t("subtitle")}
  backHref="/"
  credits={credits}
  userEmail={userEmail}
/>
```

- [ ] **Step 7: Full check**

Run: `npx vitest run && npx eslint app lib components && npm run build`

Expected: both vitest projects pass; eslint exit 0; build `✓ Compiled successfully`.

- [ ] **Step 8: Commit**

```bash
git add components/shared/PageHeader.tsx components/shared/PageHeader.test.tsx components/editor/Topbar.tsx components/settings/SettingsShell.tsx components/size-charts/SizeChartsShell.tsx messages/pt-BR.json
git commit -m "feat(ui): fold the account menu into PageHeader and make credits and back optional"
```

---

### Task 3: Add `AppShell` and migrate the editor, settings and size-charts

**Files:**

- Create: `components/shared/AppShell.tsx`
- Create: `components/shared/AppShell.test.tsx`
- Modify: `components/editor/EditorShell.tsx` (full rewrite — content below)
- Modify: `components/settings/SettingsShell.tsx` (full rewrite — content below)
- Modify: `components/size-charts/SizeChartsShell.tsx` (full rewrite — content below)
- Modify: `app/pattern/[id]/page.tsx`, `app/settings/page.tsx`, `app/size-charts/page.tsx` (drop the redundant wrapper `<div>`)
- Delete: `components/editor/Topbar.tsx`

**Interfaces:**

- Consumes: `PageHeader` from Task 2, with the prop type given there.
- Produces: `AppShell` with this prop type, which Task 4 uses:

  ```tsx
  {
    title: string;
    subtitle?: string;
    backHref?: string;
    credits: Credits | null;
    userEmail: string;
    sidebar?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
  }
  ```

  The content region is a `flex min-h-0 flex-1 flex-col` column. A screen whose body is a **row** (the editor) passes a single child that is itself a row.

- [ ] **Step 1: Write the failing tests**

Create `components/shared/AppShell.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderWithIntl, screen } from "@/components/test-utils";
import type { Credits } from "@/lib/types";
import { AppShell } from "./AppShell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

const CREDITS: Credits = {
  plan: "atelier",
  planLabel: "Ateliê",
  balance: 320,
  total: 500,
  renewsInDays: 12,
};

describe("AppShell", () => {
  it("renders the header title and the children", () => {
    renderWithIntl(
      <AppShell title="Configurações" credits={CREDITS} userEmail="a@b.com">
        <span>CONTENT</span>
      </AppShell>,
    );
    expect(screen.getByText("Configurações")).toBeInTheDocument();
    expect(screen.getByText("CONTENT")).toBeInTheDocument();
  });

  it("renders the sidebar and footer slots only when passed", () => {
    const { unmount } = renderWithIntl(
      <AppShell title="Blusa" credits={CREDITS} userEmail="a@b.com">
        <span>CONTENT</span>
      </AppShell>,
    );
    expect(screen.queryByText("SIDEBAR")).not.toBeInTheDocument();
    expect(screen.queryByText("FOOTER")).not.toBeInTheDocument();
    unmount();

    renderWithIntl(
      <AppShell
        title="Blusa"
        credits={CREDITS}
        userEmail="a@b.com"
        sidebar={<span>SIDEBAR</span>}
        footer={<span>FOOTER</span>}
      >
        <span>CONTENT</span>
      </AppShell>,
    );
    expect(screen.getByText("SIDEBAR")).toBeInTheDocument();
    expect(screen.getByText("FOOTER")).toBeInTheDocument();
  });

  it("passes a null credits through to the header without crashing", () => {
    renderWithIntl(
      <AppShell title="Meus moldes" credits={null} userEmail="a@b.com">
        <span>CONTENT</span>
      </AppShell>,
    );
    expect(screen.getByText("Meus moldes")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run --project dom`

Expected: FAIL — cannot resolve `./AppShell`.

- [ ] **Step 3: Create `components/shared/AppShell.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import type { Credits } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";

/**
 * The standard system screen. Every full-page screen renders through it.
 *
 * It builds PageHeader itself from plain data rather than accepting a header
 * element, which is what keeps "one header everywhere" enforceable instead of
 * merely documented.
 *
 * `sidebar` is whatever nav column the screen owns (the dashboard's Sidebar,
 * SettingsSidebar) — there is deliberately no global nav. The sidebar's own
 * chrome (w-[186px] border-r bg-surface p-[14px]) stays with that component.
 *
 * The content region is a column; a screen with a row body (the editor) passes
 * one child that is itself a row.
 */
export function AppShell({
  title,
  subtitle,
  backHref,
  credits,
  userEmail,
  sidebar,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  credits: Credits | null;
  userEmail: string;
  sidebar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={title}
        subtitle={subtitle}
        backHref={backHref}
        credits={credits}
        userEmail={userEmail}
      />
      <div className="flex min-h-0 flex-1">
        {sidebar}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
      {footer}
    </div>
  );
}
```

- [ ] **Step 4: Confirm the tests pass**

Run: `npx vitest run --project dom`

Expected: `Wordmark`, `PageHeader` and `AppShell` all PASS.

- [ ] **Step 5: Rewrite `components/editor/EditorShell.tsx`**

`Topbar` is absorbed: `EditorShell` now reads the `Topbar` i18n namespace directly for `savedVersion`. The paywall blur wrapper stays outside `AppShell` so `PaywallModal` is not blurred.

Full new content:

```tsx
"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useEditorStore } from "@/lib/store";
import { AppShell } from "@/components/shared/AppShell";
import { ChatPanel } from "./ChatPanel";
import { CanvasArea } from "./CanvasArea";
import { Footer } from "./Footer";
import { PaywallModal } from "./PaywallModal";

export function EditorShell({
  userEmail,
  patternId,
}: {
  userEmail: string;
  patternId: string;
}) {
  const t = useTranslations("EditorShell");
  const tTopbar = useTranslations("Topbar");
  const ready = useEditorStore((s) => s.ready);
  const pattern = useEditorStore((s) => s.pattern);
  const credits = useEditorStore((s) => s.credits);
  const conflict = useEditorStore((s) => s.conflict);
  const generationStatus = useEditorStore((s) => s.generationStatus);
  const paywallOpen = useEditorStore((s) => s.paywall.open);
  const init = useEditorStore((s) => s.init);

  useEffect(() => {
    init(patternId);
  }, [init, patternId]);

  // The header's title IS the pattern name, so unlike the other screens there
  // is nothing to paint until the store is ready.
  if (!ready || !pattern || !credits) {
    return (
      <div className="text-muted text-control flex flex-1 items-center justify-center">
        {t("loading")}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className={
          paywallOpen
            ? "pointer-events-none flex min-h-0 flex-1 flex-col opacity-30 blur-[1.2px]"
            : "flex min-h-0 flex-1 flex-col"
        }
      >
        <AppShell
          title={pattern.name}
          subtitle={tTopbar("savedVersion", {
            savedAgo: pattern.savedAgo,
            version: pattern.version,
          })}
          backHref="/"
          credits={credits}
          userEmail={userEmail}
          footer={
            <Footer
              pattern={pattern}
              conflictActive={conflict !== null}
              generating={generationStatus === "generating"}
            />
          }
        >
          <div className="flex min-h-0 flex-1">
            <ChatPanel />
            <CanvasArea />
          </div>
        </AppShell>
      </div>
      <PaywallModal />
    </div>
  );
}
```

- [ ] **Step 6: Delete the editor's `Topbar`**

```bash
git rm components/editor/Topbar.tsx
```

The `Topbar` i18n namespace stays in `messages/pt-BR.json` — its `savedVersion` key is now read by `EditorShell`.

- [ ] **Step 7: Rewrite `components/settings/SettingsShell.tsx`**

The `ScrollArea` moves from a flex **row** parent to AppShell's flex **column** content region, so it gains `min-h-0` alongside `flex-1`.

Full new content:

```tsx
"use client";

import { useTranslations } from "next-intl";
import type { Credits, LedgerHistoryEntry } from "@/lib/types";
import { AppShell } from "@/components/shared/AppShell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SettingsSidebar } from "./SettingsSidebar";
import type { SettingsSection } from "@/lib/settings/sections";
import { ProfileSection } from "./ProfileSection";
import { PasswordSection } from "./PasswordSection";
import { DangerZoneSection } from "./DangerZoneSection";
import { UsageSection } from "./UsageSection";
import { PlanSection } from "./PlanSection";

export function SettingsShell({
  userEmail,
  initialName,
  credits,
  ledger,
  activeSection,
}: {
  userEmail: string;
  initialName: string;
  credits: Credits;
  ledger: LedgerHistoryEntry[];
  activeSection: SettingsSection;
}) {
  const t = useTranslations("SettingsShell");

  return (
    <AppShell
      title={t("title")}
      backHref="/"
      credits={credits}
      userEmail={userEmail}
      sidebar={<SettingsSidebar active={activeSection} />}
    >
      <ScrollArea className="bg-paper min-h-0 flex-1">
        <div className="flex flex-col gap-4 px-[24px] py-[22px]">
          {activeSection === "profile" && (
            <ProfileSection initialName={initialName} email={userEmail} />
          )}
          {activeSection === "password" && <PasswordSection />}
          {activeSection === "danger" && (
            <DangerZoneSection userEmail={userEmail} />
          )}
          {activeSection === "usage" && (
            <UsageSection credits={credits} initialLedger={ledger} />
          )}
          {activeSection === "plan" && <PlanSection credits={credits} />}
        </div>
      </ScrollArea>
    </AppShell>
  );
}
```

- [ ] **Step 8: Rewrite `components/size-charts/SizeChartsShell.tsx`**

Full new content:

```tsx
"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/shared/AppShell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SizeChartLibrary } from "./SizeChartLibrary";
import { SizeChartTable } from "./SizeChartTable";
import { useSizeChartsStore } from "@/lib/sizeChartsStore";
import type { Credits } from "@/lib/types";

export function SizeChartsShell({
  userEmail,
  credits,
}: {
  userEmail: string;
  credits: Credits;
}) {
  const t = useTranslations("SizeCharts");
  const init = useSizeChartsStore((s) => s.init);
  const ready = useSizeChartsStore((s) => s.ready);
  const error = useSizeChartsStore((s) => s.error);
  const draft = useSizeChartsStore((s) => s.draft);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <AppShell
      title={t("title")}
      subtitle={t("subtitle")}
      backHref="/"
      credits={credits}
      userEmail={userEmail}
    >
      {!ready && (
        <div className="text-muted text-control flex flex-1 items-center justify-center">
          {t("loading")}
        </div>
      )}
      {ready && error && (
        <div className="text-muted text-control flex flex-1 items-center justify-center">
          {t("loadError")}
        </div>
      )}
      {/* `fill` + `min-h-full`: the two columns are full-height panels, not a
          stack of cards, so the row has to keep the region's height. */}
      {ready && !error && (
        <ScrollArea fill className="min-h-0 flex-1">
          <div className="flex min-h-full gap-4 p-[22px]">
            <SizeChartLibrary />
            {draft && <SizeChartTable />}
          </div>
        </ScrollArea>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 9: Drop the redundant wrapper `<div>` from the three pages**

`AppShell` now owns `flex min-h-0 flex-1 flex-col`, so each page's identical wrapper is one nesting level of nothing.

In `app/pattern/[id]/page.tsx`, replace the returned JSX:

```tsx
return <EditorShell userEmail={session.user.email} patternId={id} />;
```

In `app/settings/page.tsx`:

```tsx
return (
  <SettingsShell
    userEmail={session.user.email}
    initialName={user?.name ?? ""}
    credits={buildCredits(wallet, new Date())}
    ledger={ledger}
    activeSection={parseSection(params.section)}
  />
);
```

In `app/size-charts/page.tsx`:

```tsx
return (
  <SizeChartsShell
    userEmail={session.user.email}
    credits={buildCredits(wallet, new Date())}
  />
);
```

- [ ] **Step 10: Full check**

Run: `npx vitest run && npx eslint app lib components && npm run build`

Expected: both projects pass; eslint exit 0; build `✓ Compiled successfully`. An unresolved import of `./Topbar` means Step 5 or 6 was incomplete.

- [ ] **Step 11: Commit**

```bash
git add -A components/shared components/editor components/settings components/size-charts "app/pattern/[id]/page.tsx" app/settings/page.tsx app/size-charts/page.tsx
git commit -m "refactor(ui): route the editor, settings and size charts through AppShell"
```

---

### Task 4: Migrate the dashboard and delete `DashboardTopbar`

The behavioral change users will actually see: the dashboard gains the credits bar, "Comprar créditos", a title, and loses the credits pill — and its header no longer flickers in after the summary fetch.

**Files:**

- Create: `components/dashboard/DashboardShell.test.tsx`
- Modify: `components/dashboard/DashboardShell.tsx` (full rewrite — content below)
- Modify: `app/page.tsx` (drop the redundant wrapper `<div>`)
- Modify: `messages/pt-BR.json` (add `DashboardShell.title`, delete the `DashboardTopbar` namespace)
- Delete: `components/dashboard/DashboardTopbar.tsx`

**Interfaces:**

- Consumes: `AppShell` from Task 3, with the prop type given there.
- Produces: nothing new.

- [ ] **Step 1: Add `DashboardShell.title`**

In `messages/pt-BR.json`, the `DashboardShell` namespace currently holds `loading` and `loadError`. Add `title` as its first key:

```json
"DashboardShell": {
  "title": "Meus moldes",
  "loading": "…",
  "loadError": "…"
},
```

Keep the existing `loading` and `loadError` values exactly as they are — do not retype them.

- [ ] **Step 2: Delete the `DashboardTopbar` i18n namespace**

Remove this entire block from `messages/pt-BR.json`:

```json
"DashboardTopbar": {
  "creditsPill": "{balance} créditos",
  "accountMenuLabel": "Conta",
  "usageMenuItem": "Créditos e uso",
  "planMenuItem": "Plano e cobrança",
  "preferencesMenuItem": "Preferências",
  "signOutMenuItem": "Sair"
},
```

Its four surviving keys already live in the `PageHeader` namespace (Task 2, Step 1). `creditsPill` and `signOutMenuItem` are intentionally dropped: the pill is replaced by the progress bar, and `PageHeader.signOutButton` covers "Sair".

- [ ] **Step 3: Write the failing tests**

These cover the one genuinely new behavior — the header and nav are painted before the summary fetch resolves, instead of the whole screen being replaced by a centered "Carregando…". The resolved state renders `PatternGrid` (Radix `Select` + `ScrollArea`), which is covered by the manual check in Step 8 rather than here.

Create `components/dashboard/DashboardShell.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderWithIntl, ptBR, screen, waitFor } from "@/components/test-utils";
import { useDashboardStore } from "@/lib/dashboardStore";
import { DashboardShell } from "./DashboardShell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

const { listPatterns, getAccountSummary } = vi.hoisted(() => ({
  listPatterns: vi.fn(),
  getAccountSummary: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  listPatterns,
  getAccountSummary,
  createPattern: vi.fn(),
  renamePattern: vi.fn(),
  deletePattern: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useDashboardStore.setState({
    ready: false,
    error: false,
    patterns: [],
    credits: null,
    recentUsage: [],
    search: "",
    typeFilter: "all",
  });
});

describe("DashboardShell", () => {
  it("paints the header and nav before the summary resolves", async () => {
    // Never resolves: the shell stays in its loading state.
    listPatterns.mockReturnValue(new Promise(() => {}));
    getAccountSummary.mockReturnValue(new Promise(() => {}));

    renderWithIntl(<DashboardShell userEmail="a@b.com" />);

    // Header: title present, no back button (the dashboard IS "/"), no credits
    // bar yet, but the account menu is already reachable.
    expect(screen.getByText(ptBR.DashboardShell.title)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ptBR.PageHeader.backButton }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: ptBR.PageHeader.buyCreditsButton }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: ptBR.PageHeader.accountMenuLabel }),
    ).toBeInTheDocument();

    // Nav column is painted too, and the loading message is in the content
    // region rather than replacing the screen.
    expect(screen.getByText(ptBR.Sidebar.myPatternsLabel)).toBeInTheDocument();
    expect(screen.getByText(ptBR.DashboardShell.loading)).toBeInTheDocument();
  });

  it("keeps the header when the fetch fails", async () => {
    listPatterns.mockRejectedValue(new Error("boom"));
    getAccountSummary.mockRejectedValue(new Error("boom"));

    renderWithIntl(<DashboardShell userEmail="a@b.com" />);

    await waitFor(() =>
      expect(
        screen.getByText(ptBR.DashboardShell.loadError),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(ptBR.DashboardShell.title)).toBeInTheDocument();
    expect(screen.getByText(ptBR.Sidebar.myPatternsLabel)).toBeInTheDocument();
  });
});

describe("catalog after the header merge", () => {
  it("no longer carries a DashboardTopbar namespace", () => {
    expect("DashboardTopbar" in ptBR).toBe(false);
  });
});
```

- [ ] **Step 4: Run and confirm failure**

Run: `npx vitest run --project dom`

Expected: `DashboardShell` fails. `DashboardShell.title` does not render yet (the old `DashboardTopbar` shows no title), and the loading state currently replaces the whole screen so the sidebar assertion fails too.

- [ ] **Step 5: Rewrite `components/dashboard/DashboardShell.tsx`**

Full new content:

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDashboardStore } from "@/lib/dashboardStore";
import { AppShell } from "@/components/shared/AppShell";
import { Sidebar } from "./Sidebar";
import { PatternGrid } from "./PatternGrid";
import { CreditsCard } from "./CreditsCard";
import { RecentUsageCard } from "./RecentUsageCard";

export function DashboardShell({ userEmail }: { userEmail: string }) {
  const t = useTranslations("DashboardShell");
  const router = useRouter();
  const ready = useDashboardStore((s) => s.ready);
  const error = useDashboardStore((s) => s.error);
  const credits = useDashboardStore((s) => s.credits);
  const recentUsage = useDashboardStore((s) => s.recentUsage);
  const init = useDashboardStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  const openPattern = (id: string) => router.push(`/pattern/${id}`);

  // Loading and error live inside the content region, not in place of the
  // whole screen: the header and nav are stable across the fetch. The
  // dashboard passes no backHref — it IS "/".
  return (
    <AppShell
      title={t("title")}
      credits={credits}
      userEmail={userEmail}
      sidebar={<Sidebar onCreate={openPattern} />}
    >
      {!ready && (
        <div className="text-muted text-control flex flex-1 items-center justify-center">
          {t("loading")}
        </div>
      )}
      {ready && error && (
        <div className="text-alert text-control flex flex-1 items-center justify-center">
          {t("loadError")}
        </div>
      )}
      {ready && !error && (
        <>
          <PatternGrid onOpen={openPattern} />
          {credits && (
            <div className="flex gap-[14px] px-[22px] pb-[22px]">
              <CreditsCard credits={credits} />
              <RecentUsageCard entries={recentUsage} />
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 6: Delete `DashboardTopbar` and confirm the tests pass**

```bash
git rm components/dashboard/DashboardTopbar.tsx
npx vitest run --project dom
```

Expected: every `dom` test PASSES.

- [ ] **Step 7: Drop the wrapper `<div>` from `app/page.tsx` and check for dangling references**

`app/page.tsx` returns:

```tsx
return <DashboardShell userEmail={session.user.email} />;
```

Then run: `grep -rn "DashboardTopbar" app components lib messages`

Expected: **no output**. Any hit is a dangling import or a stale catalog key.

- [ ] **Step 8: Full check**

Run: `npx vitest run && npx eslint app lib components && npm run build`

Expected: both projects pass; eslint exit 0; build `✓ Compiled successfully`.

- [ ] **Step 9: Commit**

```bash
git add -A components/dashboard app/page.tsx messages/pt-BR.json
git commit -m "refactor(ui): route the dashboard through AppShell and drop DashboardTopbar"
```

---

### Task 5: Update CLAUDE.md and run the full verification sweep

CLAUDE.md is this project's source of truth and now contradicts the code in three places, plus it does not mention the new test harness. The user approved all of these during brainstorming.

**Files:**

- Modify: `CLAUDE.md` (three passages + a testing note)

**Interfaces:**

- Consumes: the finished state of Tasks 0–4.
- Produces: nothing.

- [ ] **Step 1: Rewrite the PageHeader convention bullet**

In the `## Conventions` list, this bullet currently reads:

> - **Reuse `components/shared/PageHeader.tsx` for any full-page screen's header** (logo, back-to-`/` button, title/subtitle, credits bar, "Comprar créditos", avatar, sign out). The editor's `Topbar` is a thin wrapper over it (title = pattern name, subtitle = formatted saved-version string); `SettingsShell` passes a title with no subtitle. Don't hand-roll new headers.

Replace it with:

> - **Every full-page screen renders through `components/shared/AppShell.tsx`** — it owns the page frame (header row, optional 186px sidebar slot, content region as a flex column, optional footer slot) and builds `components/shared/PageHeader.tsx` itself from plain data props, so a screen cannot hand-roll a header. `PageHeader` is the one header: wordmark (`components/shared/Wordmark.tsx`, also used by the three centered-card auth screens), optional `← Voltar`, title/subtitle, credits bar, "Comprar créditos", and an avatar dropdown carrying the `/settings` deep links plus sign out. Two props are deliberately optional: `backHref` (the dashboard **is** `/`, so it passes none) and `credits`, which is nullable because the dashboard's balance arrives after first paint — the bar and "Comprar créditos" are simply absent until it lands, instead of the header flickering in. There is **no global nav sidebar**; `sidebar` is whatever column the screen owns (`dashboard/Sidebar`, `SettingsSidebar`), and the editor and `/size-charts` pass none. A screen whose body is a row (the editor: chat + canvas) passes one child that is itself a row. The editor is also the one screen that keeps a full-screen loading early-return rather than putting it in the content region, because the header's title _is_ the pattern name.

- [ ] **Step 2: Fix the Dashboard screen bullet**

In `### Screens`, the Dashboard bullet currently reads in part:

> `app/page.tsx` is a thin server component (session check only) rendering `DashboardShell`, which composes `DashboardTopbar` (account-menu credit pill), `Sidebar` ("Meus moldes" active; …

Replace that clause with:

> `app/page.tsx` is a thin server component (session check only) rendering `DashboardShell`, which renders through the shared `AppShell` (title "Meus moldes", no `backHref`) and composes `Sidebar` ("Meus moldes" active; …

- [ ] **Step 3: Fix the `/settings` navigation sentence**

In `### Screens`, the `/settings` bullet currently opens:

> - **`/settings` is one unified page, not a modal**, reached only from the dashboard's account-menu — its three items ("Créditos e uso", "Plano e cobrança", "Preferências", in `DashboardTopbar.tsx`) deep-link via a `?section=` query param (`profile` default, plus `password`/`danger`/`usage`/`plan`).

Replace that sentence with:

> - **`/settings` is one unified page, not a modal**, reached from the shared header's avatar menu — its three items ("Créditos e uso", "Plano e cobrança", "Preferências", in `components/shared/PageHeader.tsx`) deep-link via a `?section=` query param (`profile` default, plus `password`/`danger`/`usage`/`plan`), and because that header is on every screen the editor can reach settings too.

- [ ] **Step 4: Document the two-project test setup**

In the `## Commands` section, the `npm test` line currently reads:

```
npm test         # vitest run — unit tests across lib/* and app/api/**/route.test.ts
```

Replace it with:

```
npm test         # vitest run — two projects (see vitest.workspace.ts)
                 #   node: lib/**/*.test.ts + app/**/*.test.ts  (pure logic, no DOM)
                 #   dom:  components/**/*.test.tsx             (jsdom + React Testing Library)
                 # scope one: npx vitest run --project dom
```

Then add this bullet at the end of the `## Conventions` list:

> - **Component tests are the `dom` vitest project** — jsdom + React Testing Library, configured in `vitest.workspace.ts` as a **second project** so the pure-logic `node` suite never loads the DOM setup file. `vitest.setup.ts` installs the jest-dom matchers, RTL auto-cleanup, and the browser APIs jsdom lacks that the Radix primitives call (`ResizeObserver`, pointer capture, `scrollIntoView`, `matchMedia`) — a Radix component that will not open in a test is almost always a missing one of those, not a broken assertion. Render through `renderWithIntl` (`components/test-utils.tsx`), which wraps the tree in the **real** `messages/pt-BR.json` rather than a stub translator, so a component reading a key that does not exist fails the test instead of rendering the key name. Assert against the exported `ptBR` catalog object, never against a pasted pt-BR literal: the no-hardcoded-display-text rule applies to tests, and it makes a copy change a one-place edit.

- [ ] **Step 5: Format**

Run: `npx prettier --write CLAUDE.md`

Expected: the file is rewritten, no error.

- [ ] **Step 6: Full verification sweep**

Run: `npm run format:check && npx eslint app lib components && npx vitest run && npm run build`

Expected: all four pass. This is exactly what CI runs.

- [ ] **Step 7: Confirm the refactor is complete**

Run: `grep -rn "DashboardTopbar\|editor/Topbar\|Mold<span" app components lib messages CLAUDE.md`

Expected: **only** `components/shared/Wordmark.tsx` for `Mold<span`. Any other hit is leftover.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the AppShell frame, the unified header and the dom test project"
```

---

## Verification summary

After Task 5 the repo should satisfy all of:

| Check        | Command                                                                 | Expected                                                                          |
| ------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Format       | `npm run format:check`                                                  | exit 0                                                                            |
| Lint         | `npx eslint app lib components`                                         | exit 0, no output                                                                 |
| Tests        | `npx vitest run`                                                        | both `node` and `dom` projects pass                                               |
| Typecheck    | `npm run build`                                                         | `✓ Compiled successfully`                                                         |
| No dead refs | `grep -rn "DashboardTopbar\|editor/Topbar" app components lib messages` | no output                                                                         |
| One wordmark | `grep -rn "Mold<span" app components`                                   | only `components/shared/Wordmark.tsx`                                             |
| One header   | `grep -rln "PageHeader" components`                                     | only `shared/PageHeader.tsx`, `shared/PageHeader.test.tsx`, `shared/AppShell.tsx` |

## Manual pass (after Task 5)

Not automatable — `npm run dev` on the **host** (not the Docker dev stack: Turbopack's watcher misses edits through the Windows bind mount).

1. `/` — header has no `← Voltar`, title "Meus moldes", credits bar, "Comprar créditos", avatar menu. Throttle to Slow 3G and reload: header and 186px sidebar paint immediately, only the content region shows "Carregando…", the credits bar fades in. Search, type filter, "＋ Novo molde", card "⋯" rename and delete all still work.
2. `/pattern/<id>` — chat and canvas side by side, full height; footer pinned; the paywall still blurs the screen but not the modal.
3. `/settings` — 186px sidebar present, sections switch, content column scrolls.
4. `/size-charts` — library and table columns full height, not collapsed to content height.
5. `/login`, `/signup`, `/verify` — the wordmark still renders in the centered card.
6. Walk all four app screens and confirm the header row is pixel-identical apart from title/subtitle and the presence of `← Voltar`.
