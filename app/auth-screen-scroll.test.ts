import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #103: <body> is app-wide `h-screen overflow-hidden` (app/layout.tsx), which
// is correct for the AppShell screens' internal ScrollAreas but silently
// clips these four ordinary centered-card screens -- at 200% browser zoom on
// a 1080p laptop (~360px of viewport height, well inside signup's ~490px
// card), the submit button and login link become unreachable by mouse,
// touch or keyboard, with nothing visibly broken. These live under app/ (the
// `node` vitest project, no jsdom), so this can't render the components --
// it instead guards the source text the way app/error-boundaries.test.ts
// (#98) already does for the same "reading a page.tsx from app/" case.
//
// Fix: each wrapper scrolls internally (h-full + overflow-y-auto) and the
// card centers via `my-auto` rather than `items-center` -- `items-center`
// on an overflowing flex container leaves the card's own top clipped and
// unreachable even with a scrollbar (the classic flexbox
// centering-vs-overflow quirk); an auto margin collapses to 0 instead, so
// the card is always reachable top-to-bottom by scrolling.
describe("auth screens scroll instead of clipping (#103)", () => {
  const files = [
    "login/page.tsx",
    "signup/page.tsx",
    "verify/page.tsx",
    // Not named in #103 itself -- it shipped under #24, after #103 was
    // filed -- but it is the exact same centered-card wrapper with the
    // identical defect, so it gets the identical fix.
    "password-reset/page.tsx",
  ] as const;

  it.each(files)(
    "app/%s no longer traps overflow under items-center",
    (file) => {
      const source = readFileSync(join(process.cwd(), "app", file), "utf-8");
      // `items-center` on the wrapper is the actual invariant being guarded
      // against, not just its old adjacency to `min-h-screen` -- centering
      // is the card's job now (`my-auto`), so the wrapper must never carry
      // it again even if reached for on its own in a future edit.
      expect(source).not.toMatch(/items-center/);
      expect(source).toMatch(/overflow-y-auto/);
      expect(source).toMatch(/my-auto/);
    },
  );
});
