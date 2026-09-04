# GarmentCode evaluation spike (#269)

Empirical evidence for #269 — "spike GarmentCode integration cost as a candidate drafting
engine". Run 2026-09-04 against `pygarment==2.0.2` (the published PyPI release) plus the
`assets/garment_programs`/`assets/design_params`/`assets/bodies` example code from
`maria-korosteleva/GarmentCode`'s `main` branch (commit-pinned by that clone date), inside a
throwaway Docker container built from `python:3.11-slim`, entirely outside this repo. **Nothing
was added to this repo's dependency tree, no engine was registered, and no code under `lib/`
changed.**

Every figure below was measured, not recalled. This spike answers "is GarmentCode worth
registering as a second engine now" — not "is GarmentCode ever viable" — because the first
finding below is a structural blocker no amount of latency tuning fixes.

Note on precedent: `docs/decisions/drafting.md`'s FreeSewing entry declined a **wholesale swap**
of our drafters, on cost, not capability. It did not decline FreeSewing as a candidate, and #266
(proposing FreeSewing behind an adapter) is still open. This doc does not lean on that entry as
"a candidate was rejected" precedent — the two spikes ask different questions of different
candidates.

## The headline: the seam is synchronous and bundled into the client, before any number matters

`DraftingEngine.draft(spec, base, t): EngineDraft` is synchronous — not a `Promise`
(`lib/draft/engine/types.ts:66`). All five facade functions are sync
(`lib/draft/engine/facade.ts`), and three `"use client"` components call the facade **inside
`useMemo` during render**: `CanvasArea.tsx:77,93,108`, `VersionList.tsx:39`,
`VersionCompare.tsx:113,119,135,141`. A subprocess or HTTP engine cannot sit behind this seam as
written. Registering one requires two structural changes, not an adapter:

1. `draft` becomes async, which ripples through `moldai.ts`, all five facade functions,
   `conformance.test.ts`'s synchronous `it()` bodies, and every one of the nine call sites.
2. The three client components need a server round-trip or a precomputed-geometry channel —
   there is no RPC indirection today; they import the facade straight into the client bundle.

This is true regardless of what GarmentCode's own latency turns out to be. The rest of this
document measures that latency anyway, because #269 asks for it and because the numbers turn out
to matter on their own terms.

## The real finding: a GarmentCode draft has a ~2 second floor that does not amortize

`docs/reference/freesewing-spike/README.md` measured FreeSewing at **6.6 ms per draft, warm**.
The equivalent GarmentCode number, drafting the shipped `t-shirt.yaml` design against
`mean_all.yaml` in a warm, already-imported Python process, 30 iterations:

|           | ms              |
| --------- | --------------- |
| median    | 1989.6          |
| mean      | 2009.2          |
| p95       | 2115.4          |
| min / max | 1891.6 / 2539.7 |

**GarmentCode is ~300x slower per draft than FreeSewing, and the cost does not fall with a warm
process** — FreeSewing's number reflects JS JIT warmup improving over iterations; GarmentCode's
30 samples show no such trend (`min` and `median` are 95 ms apart, noise not warmup). `cProfile`
on one draft explains why: **12 calls to `scipy.optimize.minimize` (L-BFGS-B with a numerically
approximated gradient), driven by 4 calls to `ArmholeCurve`/`curve_match_tangents`, account for
2.7 s of a 3.6 s profiled run** (profiling overhead inflates the absolute number; the ratio is
what matters). Fitting the sleeve cap to the armhole is an iterative numerical optimization in
GarmentCode's design, not a closed-form calculation — it is intrinsic per-draft cost, not
something a warm process, a connection pool, or a faster container amortizes away.

## Latency measured across four deployment shapes

All four draft the same design/body pair; `import_ms` isolates module import (numpy/scipy/etc.)
from `draft_ms`, since that split decides whether a subprocess-per-call adapter is viable at all.

| Shape                                                                                                                             | What it models                           | Wall time                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| Cold container start → first pattern JSON (`docker run`, image cached)                                                            | serverless / cold-scaled deployment      | ~4.0 s (3 runs: 4073/4012/3969 ms)                      |
| Fresh Python process per draft (`docker exec` into a running container — isolates process-spawn cost from container-spin-up cost) | the naive subprocess-per-request adapter | ~3.2–3.5 s (5 runs)                                     |
| Warm steady-state, draft only (import once, loop)                                                                                 | the honest floor                         | median 1989.6 ms (table above)                          |
| HTTP round-trip, warm server, `localhost`                                                                                         | the microservice option                  | server-measured 1.92–2.0 s; wall 2.0–2.3 s (8 requests) |

Every shape is dominated by the same ~2 s optimization cost; import overhead (~0.8–1.2 s cold,
irrelevant once warm) and process/container/network overhead are all small next to it.

**Against the transaction budget.** Drafting runs inside `withPatternAndWallet`
(`lib/db/pattern-wallet.ts:19-56`), holding the Pattern and Wallet row locks, budgeted at
`TX_OPTS = { timeout: 30_000, maxWait: 10_000 }` (`lib/db/pattern.ts:21`) specifically to
accommodate the Anthropic call (`proposeGarment`, 5–12 s), which already runs inside the same
transaction. A single GarmentCode draft at ~2 s fits that remaining budget alone. It does not fit
the actual call pattern: `draftGradedOverlays` calls `draft()` once per applied size
(`facade.ts:108-113`, N+1, no caching), and `measureSeams`/`measureSeamGraph` each independently
re-run `draft()` from scratch when the canvas asks for them. A 4-size grade is ~8 s of GarmentCode
time alone; stacked on 5–12 s of Anthropic latency inside the same 30 s window and the same held
Postgres lock, this is a genuine risk of timing out the transaction — which surfaces to the user
as a lost turn (`apiError("service_unavailable", 503)`, route.ts:517-525), and would either
require restructuring the transaction or moving drafting out of it, breaking the "holding the lock
during the AI call serializes the user's requests" invariant (`lib/db/pattern.ts:18-20`).

## Measurement vocabulary: worse than FreeSewing, and for a legible reason

GarmentCode's body model has 26 keys (`assets/bodies/mean_all.yaml`). Dropping each one from the
neutral body preset and re-drafting the shipped t-shirt design (`Shirt` archetype) empirically
sorts them:

- **18 raise `KeyError`** when absent — hard-required for this archetype: `arm_length`,
  `arm_pose_angle`, `armscye_depth`, `back_width`, `bust`, `bust_line`, `head_l`, `height`,
  `hip_inclination`, `hips_line`, `neck_w`, `shoulder_incl`, `shoulder_w`, `waist`,
  `waist_back_width`, `waist_line`, `wrist`, plus `bust_line`'s pairing key.
- **7 have no effect** on this archetype (used only by skirts/pants/other bodices): `bum_points`,
  `bust_points`, `crotch_hip_diff`, `hip_back_width`, `hips`, `leg_circ`, `underbust`,
  `waist_over_bust_line`.
- **1 fails open, silently**: dropping `vert_bust_line` does not raise — it changes the drafted
  geometry without any error. Worth flagging on its own: a required-but-undeclared input that
  degrades output quality instead of failing fast is exactly the shape of bug
  `assertResolvedMeasurements` (`lib/measurements.ts:267-280`) exists to prevent in our own code.

Mapping the 18 required keys against `Measurements` (9 required + 8 optional,
`lib/measurements.ts:3-71`):

| GarmentCode key                                                                                                              | Our key                                | Status | Reason                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bust`                                                                                                                       | `bust`                                 | ✅     | same quantity                                                                                                                                                                                       |
| `waist`                                                                                                                      | `waist`                                | ✅     | same quantity                                                                                                                                                                                       |
| `back_width`                                                                                                                 | `backWidth`                            | ✅     | same quantity (both optional in ours)                                                                                                                                                               |
| `shoulder_w`                                                                                                                 | `shoulder`                             | ⚠️     | ours is the half-width centre→tip; GarmentCode's may be full width — unverified without a second body sample                                                                                        |
| `shoulder_incl`                                                                                                              | `shoulderSlope`                        | ⚠️/❌  | **confirmed degrees** (`np.deg2rad(body['_shoulder_incl'])`, `bodice.py:26`, `sleeves.py:117`) — ours is a cm drop. The identical mismatch the FreeSewing spike found independently, now seen twice |
| `arm_length`                                                                                                                 | `shortSleeveLength`/`longSleeveLength` | ⚠️     | GarmentCode's is full arm length; ours are sleeve-length targets — different quantities, not a units issue                                                                                          |
| `armscye_depth`                                                                                                              | _(none)_                               | ⚠️     | we derive armhole depth internally; GarmentCode takes it as body input                                                                                                                              |
| `neck_w`                                                                                                                     | `neckGirth`                            | ❌     | width vs. circumference — different quantities                                                                                                                                                      |
| `arm_pose_angle`, `bust_line`, `head_l`, `height`, `hip_inclination`, `hips_line`, `waist_back_width`, `waist_line`, `wrist` | _(none)_                               | ❌     | no counterpart in `Measurements` at all (9 keys)                                                                                                                                                    |

**Net: adopting GarmentCode's body model costs on the order of 15 new required measurement
inputs**, worse than FreeSewing's ~7, and for a structural reason: GarmentCode's vocabulary is an
anthropometric/3D-pose model (line heights, inclination angles, a pose angle) built for its own
SMPL-fitted dataset generation, not a tape-measure tailoring vocabulary. This is unambiguously a
`SizeChartData.baseMeasurements` wire-shape change — the expensive kind
(`docs/decisions/drafting.md:73-76`).

**Design vocabulary** is comparably wide: the shipped `t-shirt.yaml` design preset has **122 leaf
parameters** (`grep -c '^\s*v:' t-shirt.yaml`) against our `GarmentStyle`'s 15 fields
(`lib/types.ts:82-145`) — wider than FreeSewing's Teagan (50 options).

## License

`LICENSE` at the repo root, fetched directly (not via search): MIT, `Copyright (c) 2024 Maria
Korosteleva`, checked 2026-09-04. `setup.cfg` independently declares `license = MIT`. No
per-module or per-asset license divergence found.

## Archetype coverage: no coat, no lining, no facing — the one scenario that could justify this doesn't hold

`MetaGarment` composes an `upper` (`FittedShirt` | `Shirt`, both single-layer bodices, from
`bodice.py`), a `bottom` (skirts/pants, `meta_garment.py:39-46`), and a `wb`/belt — no third,
structured-outerwear body class exists. A repo-wide search (`assets/`, `pygarment/`, docs) for
`coat`, `jacket`, `lining`, `interfacing`, or `facing` returns **zero matches**. Collar options
include `SimpleLapel` and `Hood2Panels` (`collars.py`), but both attach as collar components to
the same single-layer `Shirt`/`FittedShirt` bodice — there is no double layer, no lining pattern
piece, no button-stand construction beyond what a collar component itself draws. **GarmentCode
cannot plausibly cover coats/outerwear today** — the one capability gap that the issue names as
the scenario that would justify a second-language engine's operational cost is not met.

## `EngineDraft` mapping: plausible, but not attempted

A captured pattern JSON for the shipped t-shirt (`Shirt`, no collar-band component, no sleeve
cuff) has 8 panels (`right_sleeve_f/b`, `right_btorso`, `right_ftorso`, mirrored `left_*` — full
explicit left/right panels, not a `qty`-based mirror like ours) and 16 `stitches`. Two structural
observations, offered as evidence the mapping is _plausible_, not as a finished design:

- `stitches` is literally `[{panel, edge}, {panel, edge}]` pairs referencing edge indices into
  each panel's own `edges` array — a direct conceptual analog to `SeamPairDecl`, modulo converting
  edge index → our `[from, to]` vertex-range form.
- Every panel carries `translation`/`rotation` (3D placement) directly in the output — a
  ready-made source for #254 (attach a declarative 3D placement to every drafted piece), if this
  engine were ever adopted.
- Edges use `{endpoints, curvature: {type: "cubic", params: [[...], [...]]}}` — genuinely
  Bézier-like, the same general shape FreeSewing's paths were. That spike measured 8
  samples/curve reproduces true arc length to 0.009 cm, which is why `DraftedPiece` needs no type
  change (`docs/decisions/drafting.md:102-111`) — a finding about _our_ geometry model, so it
  transfers here without re-measuring GarmentCode's specific curve parameterization.

No adapter code was written; this section states feasibility, not cost, and the cost (making
`draft` async, the client-redraw problem, the ~2 s floor) dominates whatever the adapter itself
would take.

## Operational cost: "pip install pygarment" is not self-contained, even for 2D-only

Import-graph audit of `pygarment.pattern.{core,wrappers}`, `pygarment.garmentcode`,
`pygarment.data_config`, and every `assets/garment_programs/*.py` file shows **zero references**
to `trimesh`, `libigl`, `pyrender`, `cgal`, `nicegui`, or the NVIDIA warp simulator — those belong
to the 3D-mesh-generation and cloth-simulation path, not 2D pattern drafting, confirming a minimal
install is possible in principle. In practice: `pygarment.pattern.wrappers` unconditionally
imports `cairosvg` even though the 2D-drafting path never renders SVG, and `cairosvg` requires the
native `libcairo2` shared library — absent from `python:3.11-slim`, and not installable via `pip`.
The working minimal image needed `apt-get install libcairo2` before `pip install` would even
import. Final image: `python:3.11-slim` + `libcairo2` + 7 pip packages (`pyyaml`, `numpy<2`,
`scipy`, `svgwrite`, `svgpathtools`, `psutil`, `matplotlib`, `cairosvg`) = **728 MB**. FreeSewing's
spike measured its npm packages' bundle size in kilobytes; there is no comparable number here —
a second-language runtime is an operational cost class of its own, not a bundle-size delta.

Separately: this dev machine has only Python 3.14.0rc2 installed, and `numpy<2` (a hard pin in
GarmentCode's own `setup.cfg`) has no 3.14 wheels — the container was not a convenience for this
spike, it was the only way to get a real number at all. Any production integration would need to
pin a Python 3.9–3.12 runtime independent of whatever this repo's own tooling uses.

## Validity: what this spike could not establish

- **Fit quality was not scored.** Unlike the FreeSewing spike, no benchmark comparison against
  `docs/reference/tshirt-benchmark/measurements.json` was run — the vocabulary and seam-mechanics
  findings above are decisive enough on their own that scoring fit quality would not change the
  answer, and running it would require solving the vocabulary gap first (there is no way to feed
  our benchmark body into GarmentCode's 18 required keys without inventing 15 values).
- **`shoulder_w`'s full-vs-half-width status is unverified** — inferred from variable naming and
  usage pattern, not confirmed against a second body sample or the (PDF, not machine-read)
  `docs/Body Measurements GarmentCode.pdf`.
- **Latency was measured on one design (`t-shirt.yaml`) and one body (`mean_all.yaml`)** on
  ordinary developer hardware inside Docker Desktop on Windows — not a production container
  runtime, and not across GarmentCode's other archetypes (pants, skirts, dresses), which may have
  a different optimization-call count.

## Not part of this decision

The Prova 3D tab (#10, shipped) is a static parametric approximation with no cloth simulation and
no fabric-side/orientation concept, so GarmentCode's explicit stitch-orientation control
(right-to-right vs. right-to-wrong, `pygarment`'s `Stitches`/`Interface` classes) has no consumer
in this codebase today and is not filed as a follow-up.

## Method

Reproduce by cloning `maria-korosteleva/GarmentCode` with a blobless sparse checkout limited to
`assets/{garment_programs,design_params,bodies}` (excludes the ~1.9 MB `.obj` body meshes, which
the 2D path never reads), then:

1. Build `python:3.11-slim` + `apt-get install libcairo2` + `pip install pyyaml numpy<2 scipy
svgwrite svgpathtools psutil matplotlib cairosvg`, copying in `pygarment/` and `assets/` plus a
   `system.json` from `system.template.json`.
2. `bench.py single` imports `MetaGarment`/`BodyParameters`, times the import separately from one
   `MetaGarment("tee", body, design).assembly()` call, and JSON-serializes `pattern.pattern` to
   measure realistic response-body cost.
3. `bench.py loop N` imports once, then times N `assembly()` calls in the same warm process —
   the steady-state table above is `N=30`.
4. Cold-container and fresh-process numbers come from host-side wall-clock around `docker run`
   (fresh container each time) vs. `docker exec` into one already-running container (fresh Python
   process, no container spin-up).
5. `cProfile` around one `assembly()` call identifies the `scipy.optimize.minimize` hot path.
6. The required-measurement table comes from `reqcheck.py`: deep-copy the body dict, delete one
   key, re-draft, and classify by whether it raises, changes the output, or does neither, against
   every one of the 26 body keys.
7. `grep -c '^\s*v:' t-shirt.yaml` for the design-parameter count; `np.deg2rad` call sites found
   by grepping `assets/garment_programs/*.py` for `shoulder_incl`/`hip_inclination`.

The spike scripts were deliberately not committed — they pin a Docker image and Python
dependencies this repo does not have, and `docs/reference/` is covered by both prettier and
eslint.
