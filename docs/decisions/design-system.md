# The marketing surface's second design system

> This is the _why_. For the operative rule, see [`../architecture/design-system.md`](../architecture/design-system.md).
> For universal, cross-cutting rules, see the root [`CLAUDE.md`](../../CLAUDE.md).

### The marketing surface's second design system (`/`, `/planos`, `/privacy`, `/terms`)

**What was asked, and by whom.** The `landing-page-design` skill was invoked against
this repo with no target. Its Part B (typography, spacing, radius, backgrounds, hero
treatment, icons, motion) contradicts `CLAUDE.md` on **every** axis — it mandates
Geist/Manrope/Poppins where this repo uses Bricolage + Archivo, Tailwind's default
type scale where this repo forbids stock Tailwind sizes in favour of its own named
`--text-*` steps, its own spacing table, and Phosphor icons where this repo uses
lucide. Per the project-stage rule at the top of `CLAUDE.md`, that conflict was put
to the user rather than resolved silently. The answer was explicit: **adopt the full
skill and update `CLAUDE.md` to match**, scoped to the two public screens.

**Why the font change is scoped, not global.** "One typeface per site" (B1) read
literally would mean swapping `app/layout.tsx`'s fonts outright — which would
restyle all ~20 authenticated screens, none of which were in scope, and would
directly fight the in-flight `fix/design-reference-alignment` work pinning those
screens to `docs/design/screenshots/*.png`. The scoped reading is also the honest
one: a marketing site and a product UI running different type systems is ordinary,
and the alternative silently redesigns the whole app off a request about two pages.
So Geist is loaded as a third font and gated behind `font-marketing`, applied once
by `MarketingShell`. The boundary is enforced by
`components/landing/marketingDesignSystem.test.ts`, which reads the **source** of
every file under `components/{landing,pricing,legal}` — a rendered-DOM check cannot
tell a class this surface wrote from one that arrived inside a shared
`components/ui` primitive, and those primitives keep the app's scale on purpose.

**This is a divergence from `docs/design/`, recorded so it is not "fixed" back.**
`Landing.dc.html` and `Planos.dc.html` describe the previous system for these two
screens. The seven spacing-pin tests that encoded their exact pixel values
(`pt-[60px]`, `gap-[34px]`, `pb-[34px]`, `pb-11` …) were **replaced, not deleted** —
their purpose (spacing must not drift silently) is still valid, but each could only
ever catch a change to the one element it named. The replacements check the rule
across every file, so a new section is covered the day it is written. Every other
screen's `.dc.html` remains authoritative.

**Three places the skill was deliberately not followed, and why.**

1. **No social proof.** A2 #4 wants a proof signal above the fold and #9 wants
   testimonials or a case study. This product has no customers. Inventing a
   testimonial, a logo strip or a "47.2% faster" figure would be a fabricated
   record presented as genuine — B8's own content-realism rule points the same way.
   The proof is instead three verifiable product facts, read from
   `PLAN_CREDITS`/`EXPORT_FORMATS` rather than typed into the catalog.
2. **No "cancel anytime".** A4 asks for a risk reversal and lists cancel-anytime
   among the options. Plan downgrades are **refused server-side** in this app — only
   upgrades are self-serve — so that sentence would have been false on the marketing
   page of a product whose settings screen refuses it. The note says what is true:
   the free plan needs no card and renews every 30 days. A test pins the absence,
   because this is the kind of copy a future edit would "improve" back in.
3. **No icon library swap.** B6 names Phosphor/Solar/Iconamoon. The marketing
   surface renders **zero** icons, so adopting it would have meant adding a
   dependency for nothing. If icons ever land here, B6 applies then.

**`prefers-reduced-motion` was added on top of the skill, not taken from it.** B7
mandates heavy 800ms blur-and-translate reveals and per-word scroll animation with
no mention of the media query. Shipping that unguarded on the one public page is an
accessibility regression, so the reduced-motion override lives beside the animation
rules in `app/globals.css` — which is also why the visual states are CSS on
`[data-reveal]`/`.marketing-word` rather than className toggles in each component:
one override neutralises all of it.

**Two bugs found by the tests, worth recording.** The nav wrapped `Wordmark` — which
renders its own `<Link href="/">` — in a second `<Link href="/">`, producing nested
anchors and a React hydration error. And the closing CTA, made word-for-word
identical to the hero's per A2 #12, rendered its `{credits}` placeholder unresolved
because the interpolation values were not passed; the accessible names then differed,
which is what surfaced it. Both were caught by `getAllByRole`, not by inspection.

**`Reveal` writes `data-reveal` to the DOM rather than through React state.** The
first version used `useState` and tripped `react-hooks/set-state-in-effect`. The
obvious fix — deriving the initial value from `typeof IntersectionObserver` — is
wrong: it renders `"shown"` on the server and `"hidden"` on the client, a hydration
mismatch. "Revealed" is a one-way visual flag that changes nothing else on the page,
so writing the attribute directly (what `LitWords` already did) is both correct and
cheaper. **Without `IntersectionObserver`, both primitives fall back to the END
state** — visible content, never a section stuck at opacity 0 with no event that can
arrive to un-stick it. The test asserts that fallback, having first been written to
assert the opposite.

**A bug only a running browser could show: sections left permanently
invisible.** The reveals looked correct in tests and in a first screenshot,
because everything above the fold reveals on load. Driving the real page
found that scrolling to the bottom left **12 of 24** `[data-reveal]` elements
still at `opacity: 0` — including sections already scrolled well past.

Two causes, stacked, and the first fix was wrong in a way that looked right:

1. **IntersectionObserver only fires when a threshold is _crossed_.** A
   jump-scroll — which the nav's own `/#how-it-works` and `/#faq` anchors
   perform — can move a section from below the viewport to above it between
   two frames. The intersection ratio goes 0 → 0, nothing is crossed, no
   entry is ever delivered, and the section stays invisible with nothing left
   that could un-stick it. The remedy is an enormous **top** `rootMargin`, so
   "already scrolled past" counts as intersecting.
2. **That remedy silently did nothing on its own.** These pages do not scroll
   the window — `app/layout.tsx`'s body is `h-screen overflow-hidden`, so
   `MarketingShell`'s Radix `ScrollArea` viewport is the real scroller. With
   the default `root: null` the browser still clips the target by that
   scrolling ancestor, and **`rootMargin` cannot expand past an intermediate
   clip**. Re-running the measurement after adding the margin returned the
   identical 12 of 24 — which is what exposed the second cause. Naming the
   scroller as the observer's `root` (`scrollRootOf`, an
   `el.closest("[data-radix-scroll-area-viewport]")`) is what makes the margin
   apply. After that: 24 of 24.

`components/landing/reveal.test.tsx` pins it by stubbing
`IntersectionObserver` and asserting the **options** — the part that was
wrong, and the part no rendered assertion can see, since jsdom implements no
observer at all and every component therefore takes the fallback branch.
Verified by reverting `root` to `null` and watching exactly the two root
assertions go red.

The general lesson is the one the repo keeps paying for: a written spec, a
green test suite and a single above-the-fold screenshot all agreed the page
was fine. Only driving it did not.
