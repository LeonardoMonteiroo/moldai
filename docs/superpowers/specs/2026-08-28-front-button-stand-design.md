# Front button-stand/placket for the bodice — design

Date: 2026-08-28
Status: approved
Issue: #223 (`feat(draft): draft a front button-stand/placket piece for the bodice`)

## Problem

Nothing in `lib/draft/*` drafts a front closure. `lib/draft/subpieces.ts` has a collar, a
cuff, a sleeve placket and a waistband — but no button-stand/placket piece for the
bodice's own front opening. A shirt-type "blouse" garment today has no modeled front
closure at all: `draftBody`'s front panel (`lib/draft/body.ts`) is drafted as a single
whole piece, symmetric about center front, cut on a fold (`foldEdge: [cf, hemCenter]`) —
i.e. it models a closed, pullover-style front. There is no fabric edge at center front to
build an extension outward from.

Source (adversarially verified, 3-0, cited in the issue): a button stand is drafted as a
structured extension added outward from the true center-front line, and that line itself
must remain the fixed button-placement line and never shift.

## Why this is more than adding a sub-piece

The collar/cuff/waistband precedent (#129/#130/#131) all draft a _separate_ piece,
measured off an edge on an _already-whole_ piece, and mate it into the seam graph. A
button stand cannot follow that recipe as-is, because the piece it would mate against —
the front bodice panel — has no real boundary edge at center front today. `foldEdge` is
documented (CLAUDE.md) as a chord, not a boundary edge: "every current drafter joins both
halves before attaching it — there is no literal edge to zero out." `curveArcLengthCm`
(the function every seam-graph edge is measured with) walks the polygon _boundary_; a
chord through the interior isn't a walkable range.

So a real front closure requires the front bodice panel to actually split into two
mirrored halves, each with its own real boundary edge at center front. That's a piece
topology change, not just a new leaf drafter — it ripples into every place that assumes
one whole `"body-front"` piece: `lib/draft/easeReport.ts`, `lib/proof3d/mesh.ts`, and
`lib/draft/assembly.ts`'s `HEM_CONSUMED_BY` map.

## Design

### 1. The front panel becomes a half-panel, `qty: 2`, no fold

`bodice()` (`lib/draft/body.ts`) currently builds one whole, symmetric piece: it walks
from center front (`cf`) through the left side (neckline, shoulder, armhole, side seam,
hem) to `hemCenter`, then continues building the mirrored right side back around to
close the polygon, and marks `foldEdge: [cf, hemCenter]`.

A new `frontClosure: boolean` parameter (true only when `frontish && style.frontClosure
=== "buttonStand"`) makes it **stop at `hemCenter`** instead of building the right side.
The polygon closes directly from `hemCenter` back to `cf` — which is exactly the
vertical center-front line, now a genuine boundary edge instead of an interior chord.
The piece:

- keeps the same id, `"body-front"` — this isn't two new pieces, it's the existing one
  cut differently;
- gets `qty: 2` instead of `1` (both true left/right front halves, mirrored by flipping
  fabric — the same convention `lib/draft/trousers.ts`'s front/back already use, for the
  identical reason: an asymmetric-about-its-own-axis piece that still needs two mirrored
  cuts);
- drops `foldEdge` (there is no fold — this edge is a real seam now);
- gains `seamEdges.centerFront` — the new boundary edge from `hemCenter` back to `cf`
  (wrapping, `[hemCenterIdx, pts.length]`, the same "wraps to index 0" convention
  `draftCollar`'s own closing span already uses);
- keeps exactly one of the two waist darts (`oneDart(-1)`) instead of both — correct,
  since this one half, cut twice, reproduces both darts across the finished garment;
- narrows `seamEdges.hem` to `[hemL, hemCenterIdx]` (half the hem, matching what this
  half-piece actually draws — same shape as the existing `side`/`shoulder`/`armhole`
  edges, unaffected);
- keeps `necklineLeft` (`[cf, hpsL]`) but no longer has a `necklineRight` (nothing to
  build it from); see §4 for the one caller that needs to know this.
- moves `insideRef` (the interior point every notch on this panel orients against) off
  center front — `[cx, len/2]` sits exactly on the new boundary edge, which is
  degenerate for notch orientation. Becomes `[cx + shoulderHalf * 0.3, len / 2]`.

The back panel is completely unaffected — it keeps building both halves, `qty: 1`,
`foldEdge` as today. A front closure is a front-only concept.

### 2. The button stand is its own piece, mated via the seam graph

`lib/draft/subpieces.ts` gets `draftButtonStand(centerFrontLenCm: number, t: Translate)`,
structurally identical to `draftCuff`: reuses the `straightBand` helper, `qty: 2` (one
stand per front half), its own `seamEdges: { centerFront: seamEdge }`.

```
const BUTTON_STAND_WIDTH_CM = 4; // finished width — a documented, reasonable shirt
// button-stand figure; the issue's own research found no verified industry-standard
// multiplier to cite, so this is a deliberate constant, the same footing as
// WAISTBAND_OVERLAP_CM.
```

`garment.ts` measures the front's own newly-real `centerFront` edge with
`curveArcLengthCm` (the same "measure the geometry that was actually emitted" rule every
other sub-piece follows — never a proportion of bust/waist), drafts the stand from it,
and declares the pair:

```ts
if (style.frontClosure === "buttonStand" && front.seamEdges?.centerFront) {
  const centerFrontLenCm = curveArcLengthCm(
    front.outlineCm,
    front.curvedSpans ?? [],
    ...front.seamEdges.centerFront,
  );
  const stand = draftButtonStand(centerFrontLenCm, t);
  drafted.push(stand);
  seamPairs.push({
    key: "buttonstand-centerfront",
    labelKey: "buttonStandCenterFront",
    a: [edgeRef(front.id, front.seamEdges.centerFront)],
    b: [edgeRef(stand.id, stand.seamEdges.centerFront)],
    easeCm: 0,
    fixable: false,
  });
}
```

This is the same shape as `cuff-hem`: one piece definition, `qty: 2`, measured once,
paired once — the seam graph's own qty-blind comparison is correct by construction here
(both sides are identical by the same-fabric-flip-mirroring the front panel itself uses).

Center front stays the fixed button-placement line by construction: it's the panel's own
unmoved edge, and the stand is a _separate_ piece attached to it, never a distortion of
the front panel's own outline. This also means front's outline never carries the
extension — see §4 for why that matters.

The button/buttonhole placement mark stays unbuilt, per the issue's own acceptance
criterion — the stand's detail rows say so plainly (`rows.buttonStandMark` →
`comingSoonBadge`, the same `waistbandClosureMark` precedent from #131).

### 3. Style field

`lib/types.ts`:

```ts
export type FrontClosureType = "none" | "buttonStand";
```

added to `GarmentStyle` as `frontClosure?: FrontClosureType`. `lib/draft/garment.ts`
exports `FRONT_CLOSURES: FrontClosureType[] = ["none", "buttonStand"]` (the
`COLLARS`/`CUFFS`/`WAISTBANDS` precedent) and `validateSpec` clamps it the same way
(`pick(style.frontClosure, FRONT_CLOSURES, "none")`) — opt-in, default `"none"`, matching
collar/cuff (a new capability the AI must actively request), not waistband (which
defaults on because an unfinished waist is a defect, not a style choice — an unfinished
front is simply today's existing pullover-style front, not a defect).

Only meaningful for `spec.type === "blouse"` — narrowed from "blouse/dress" during
planning (see Non-goals): a dress's bodice hem is also the waist-join edge sewn to the
skirt panel (`waist-join-front`/`waist-join-back`, further down in `draftAll`), and that
pairing assumes `front.seamEdges.hem` is the FULL front hem width. A front-closure half
panel's own `hem` edge is only half that width, which would need the skirt-side pairing
reworked too — a real, separate problem the issue's own acceptance criteria don't ask
for. `tshirt` is out of scope for the same "type-mismatched style field is a no-op"
reason `skirtLengthCm`/`cuff` already follow on a type that can't use them; also
`!opts.knit`, redundant with `spec.type === "blouse"` today but kept as an explicit guard
since it's the real invariant the drafter depends on, not the type check itself.

`lib/ai/prompt.ts`/`schema.ts` render `FRONT_CLOSURES` into the tool schema and prompt
exactly like every other style enum — never a hardcoded duplicate list.

### 4. Ripple fixes

**`lib/draft/easeReport.ts` — no code change needed.** Verified by hand: `widthAtCm(front,
y) * front.qty` already generalizes correctly. For today's whole front (`qty: 1`),
`widthAtCm` returns the _full_ span (both halves already drafted), so `× 1` is the full
front width. For the new half-panel (`qty: 2`), `widthAtCm` returns _one half's_ span
(the only half that's drafted), so `× 2` reconstructs the identical full front width.
Dart subtraction inside `widthAtCm` is likewise per-instance and scales the same way
(one dart × 2 instances ≡ two darts × 1 instance). This is exactly the existing
`trouserFront`/`trouserBack` handling in the same file, generalized, not a special case.

**`lib/proof3d/mesh.ts` — needs a real, small fix.** `pieceCx()` takes the outline's
own bounding-box midpoint, which is only correct for a piece symmetric about its own
center — true for every piece today, false for the new half-panel front. Add an
optional, additive field:

```ts
// DraftedPiece, core.ts
centerXCm?: number; // this piece's true axis of symmetry, when it isn't the bbox
                     // midpoint (an asymmetric half-panel, e.g. a front-closure bodice
                     // front) — absent for every symmetric piece, unchanged behavior.
```

`bodice()` sets it to `cx` (the same local variable already used to place `cf`) only when
`frontClosure` is true. `mesh.ts`'s `buildProofMesh` reads `front.centerXCm ??
pieceCx(ptsF)` wherever it currently calls `pieceCx(ptsF)` — falling back to today's
behavior for every other garment. The rest of the arithmetic (`2 × half-width` for bust/
waist/hip) is unchanged and stays correct for the same reason as easeReport's `× qty`
above.

**`lib/draft/assembly.ts` — one line.** `PHASE_BY_KEY["buttonstand-centerfront"] =
"attach"` (alongside `collar-neckline`/`cuff-hem`). `HEM_CONSUMED_BY` needs no change —
`"body-front"`'s hem edge is still keyed by the same id, whether it's `[hemL, hemR]`
(whole) or `[hemL, hemCenterIdx]` (half); a dress's own `waist-join-front` consumption is
unaffected either way.

**`lib/draft/garment.ts`'s collar-neckline arc — needs a real fix.** `draftCollar`'s
`necklineArcCm` today sums `front.necklineLeft + front.necklineRight + back.necklineLeft +
back.necklineRight`. A front-closure front has no `necklineRight` at all (nothing built
it). When `front.qty === 2` (front-closure active), the front's own contribution becomes
`front.necklineLeft × 2` (both mirrored halves draft the identical curve) instead of
`necklineLeft + necklineRight`; back is unaffected. Without this fix, requesting a collar
together with a button stand would size the collar to roughly half the real neckline.

### 5. Catalog (`messages/pt-BR.json`)

New keys: `pieceNames.buttonStand`, `rows.buttonStandType` (or reuse `rows.length`/
`rows.width` if already generic enough — check before adding), `rows.buttonStandMark` →
`comingSoonBadge` (the `waistbandClosureMark` precedent), and `seamPairs.buttonStandCenterFront`
(the conflict-card label, matching `seamPairs.cuffHem`/`collarNeckline`).

## Non-goals (explicitly deferred, stated on-screen per CLAUDE.md's honesty rule)

- Button/buttonhole placement marks — the piece's own detail row says so.
- Asymmetric overlap/underlap width (a researched claim for the _sleeve_ placket, #225,
  that did not generalize here) — both stand pieces are identical.
- `tshirt` support — a knit pullover archetype, out of scope by construction.
- **`dress` support — found during planning, not just deferred up front.** A dress
  bodice's own `hem` edge doubles as the waist-join seam to the skirt panel
  (`waist-join-front`/`waist-join-back`, in `draftAll`). That pairing measures
  `front.seamEdges.hem` expecting the FULL front hem width; a front-closure half panel's
  `hem` edge is only half of that, so the pairing would need its own rework (matching the
  skirt's front waist share against _both_ mirrored halves, the same `singlePanel`-style
  bookkeeping `waistFront`/`waistBack` already do on the skirt side) to stay correct —
  real, separate work the issue's own acceptance criteria don't ask for. `frontClosure`
  is gated on `spec.type === "blouse"` only; a follow-up issue can extend it to `dress`
  once the waist-join side is reworked to match. Because of this, `frontClosure` and
  `isDressHem` (only ever true for a dress) can never both be active — no interaction to
  test.

## Testing

- `body.test.ts`: half-panel outline is a closed, non-self-intersecting polygon (reuse
  the existing containment-style assertions); `qty: 2`; no `foldEdge`; `centerXCm` set;
  `seamEdges.centerFront`/`seamEdges.hem` land where expected.
- `garment.test.ts`: `buttonstand-centerfront` pair measures `aLenCm === bLenCm` (closes
  exactly, `easeCm: 0`); collar-neckline arc is correct both with and without
  `frontClosure` active (the §4 fix).
- `easeReport.test.ts`: bust/waist/hip for a `frontClosure: "buttonStand"` blouse match
  the equivalent non-closure blouse (proving the `× qty` generalization holds).
- `lib/proof3d/mesh.test.ts` (or equivalent): mesh dimensions for a front-closure garment
  match the equivalent non-closure garment.
- `assembly.test.ts`: `buttonstand-centerfront` never falls through to `"other"` (the
  existing exhaustiveness guard extends to it).
- Extend the `DECORATION_CASES` matrix with one `frontClosure: "buttonStand"` case so the
  containment/offset suites (`garment.test.ts`, export tests) cover it for free.
