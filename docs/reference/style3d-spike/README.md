# Style3D spike (#273)

Evidence for #273 — "spike Style3D for applicable ideas to our AI generation flow". Like
its predecessor, this is not an integration spike: nothing was added to this repo's
dependency tree, no drafter or provider was touched, and no code from any Style3D
repository was cloned into this working tree. #270 (`docs/reference/design2garmentcode-
spike/README.md`) mined one Style3D paper (Design2GarmentCode); #273 itself asked for the
same method applied to Style3D's broader public output — everything else the lab has
published beyond that one paper/implementation.

Every claim below was checked directly against the primary source (the paper's own
abstract/PDF/HTML rendering, the GitHub organization's repository list, or a repository's
own `LICENSE` file) via `WebFetch`/`WebSearch`, not recalled from training data or taken
from a secondary summary — the same standard #270 held itself to.

## What Style3D has published, beyond `design2garmentcode-impl`

Style3D Research states over 30 papers across SIGGRAPH, SIGGRAPH Asia, CVPR, NeurIPS and
3DV. The `github.com/Style3D` organization (fetched directly) lists six repositories:

| Repository                                       | What it is                                                                                                                                                               | In scope?                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `design2garmentcode-impl` / `design2garmentcode` | Already mined by #270                                                                                                                                                    | —                                                                           |
| `garmagenet-impl`                                | GarmageNet (SIGGRAPH Asia 2025, ACM TOG, arXiv:2504.01483) — multimodal sewing-pattern generation + garment modeling                                                     | **Yes** — same LMM-produces-structured-parameters shape as our own pipeline |
| `garmagejigsaw-impl`                             | GarmageJigsaw — the panel-stitching-correspondence module GarmageNet's own paper describes as one of its components                                                      | Partially — see below                                                       |
| `embroidery_customization-impl`                  | "One-shot Embroidery Customization via Contrastive LoRA Modulation" (SIGGRAPH Asia 2025, ACM TOG) — diffusion-based texture/style transfer from a single reference image | No                                                                          |
| `FashionR2R`                                     | CG-render-to-photorealistic-image translation (diffusion domain transfer, `SynFashion` dataset)                                                                          | No                                                                          |

Beyond the GitHub org, a PR Newswire release lists **six additional SIGGRAPH 2024 papers**
with no public repository found: FEM/MPM multi-material simulation for protective gear,
automatic garment initialization from sewing patterns for draping simulation, neural
homogenization of yarn-level cloth, super-resolution cloth animation, Gaussian-splat-based
garment surface reconstruction, and a VR Gaussian-splatting interaction system. Every one
of these is cloth **physics/simulation, rendering, or a spatial-interaction UI** — none
produces or consumes a structured design-parameter representation of the kind `lib/ai/*`
and `lib/draft/*` operate on, so none was researched further than this one-line
classification; see "Out of scope" below for why.

**In scope for a real read: GarmageNet** (and, as its own module, GarmageJigsaw). Every
other repository and paper found is cloth simulation, rendering, texture/style transfer,
or a spatial-interaction UI — Style3D's dominant published output beyond the one paper
#270 already covered is in these categories, which is itself a finding: the lab's design-
parameter-generation work (our own pipeline's actual analog) is a minority of what they
publish, not an unmined vein this spike overlooked.

## GarmageNet: the same pipeline shape, a materially different problem scope

GarmageNet (Li et al., SIGGRAPH Asia 2025 / ACM TOG, arXiv:2504.01483) introduces
**Garmage**, a structured 2D–3D geometry-image representation for a single garment panel,
and a pipeline built on it:

- A **latent diffusion transformer (DiT)**, conditioned on text/sketch/photo/raw-pattern/
  point-cloud input via cross-attention, synthesizes each panel's Garmage encoding (a
  72-dimensional VAE latent per panel).
- **GarmageJigsaw**, a separate neural module, predicts vertex-level stitching
  correspondences between panel boundaries as a point-to-point adjacency matrix — reported
  at 99.16% precision / 97.13% recall on their own benchmark.
- The panels are vectorized, mesh-reconstructed (Delaunay triangulation), and draped —
  simulation-ready output, 150 complex patterns tested at a 91.41% initialization success
  rate, ~8s inference per garment.
- Training data is **GarmageSet**, 14,801 professionally designed garments, released on
  Hugging Face.

**Where this converges with our own architecture.** Multi-modal input → a structured,
per-panel parameter representation → a deterministic-from-there construction step (mesh
reconstruction, draping) is the identical shape `lib/ai/*` → `validateSpec` → `lib/draft/*`
already implements — a third independent research system landing on the same pipeline
shape as Design2GarmentCode and (per the sibling #272 spike, running concurrently) very
likely ChatGarment.

**Where it diverges, and why most of it is out of scope regardless.** GarmageNet's actual
hard problem — synthesizing _novel panel geometry_ (a 72-dimensional continuous latent per
panel) from unstructured input via a trained diffusion transformer, then _discovering_
which boundary points sew together via a second trained network — is a problem we do not
have, for the same reason Design2GarmentCode's fine-tuned projector was ruled out of scope
by #270: **our own pipeline never needs to synthesize geometry or discover topology,
because both are already fully determined by the validated `GarmentSpec` the moment the
model proposes it.** `lib/draft/*`'s drafters compute panel outlines directly from a
`GarmentSpec` and body measurements — no generative step, no ambiguity about which panel
this is. `lib/draft/seams.ts`'s seam graph is **declared, not inferred**: each drafter
states its own `seamEdges` ranges, and `draftAll` pairs matching edges deterministically
(see [`seams-and-assembly.md`](../../architecture/seams-and-assembly.md)) — GarmageJigsaw
exists to solve exactly the problem that declaration makes unnecessary: recovering
unknown stitching relationships from a raw pattern or 3D scan with no such declaration
attached. Training either module (a DiT over 14,801 samples, or a stitching-correspondence
network) is real ML investment with no MoldAI-shaped training corpus to point it at — not
a "someday" item, a mismatched problem shape, exactly the projector's precedent.

## A third independent data point on vocabulary breadth (corroboration, not a new issue)

GarmageNet's text-conditioning annotations follow **nine professionally defined design
dimensions** (their Figure 8, read directly off the paper): silhouette (8 options), darts/
pleats (7), waistline (7), hemline (7), neckline (28), collar (17), opening (5), shoulder
(6), sleeve (23) — 108 discrete tokens across 9 dimensions, annotated by designers and
reformatted into a CLIP-compatible string by Qwen3. Set against our own `GarmentSpec`'s
`NECKLINES` (3), `COLLARS` (4), `SLEEVES` (3) — GarmageNet's neckline vocabulary alone
(28) is wider than our entire style-enum surface (39 tokens, #270's own count). This is
the third independent research system (after Design2GarmentCode's 409/59 and, per #272,
likely ChatGarment) landing on a materially wider descriptive vocabulary than ours. Not
filed as a new issue: #260 and #262 already carry this exact finding, cited against
Design2GarmentCode/ChatGarment — a third citation for the same conclusion on an
already-precisely-sourced issue would be noise, the identical call #270 made for
#250/#252/#260/#262/#264 in its own write-up.

**Also not actionable on its own:** the paper documents no rejection or validation path
for text conditioning outside these nine dimensions — like Design2GarmentCode's own
free-text scrape-and-check, wider vocabulary here is not paired with tighter structural
enforcement than our forced tool-use already has. The headline from #270 stands unchanged
by this third data point: we are structurally safer, they are more expressive.

## Genuinely new and portable: the panel-retention comparison in progressive editing

GarmageNet's section 8.4 describes its **progressive garment editing** loop: on each
edit, the garment is regenerated end-to-end, and the new panels are compared against the
prior version's panels by 2D dimensions and 3D bounding box. Quoting directly: "panels
with high similarity are marked for retention, while those with low similarity are
flagged for modification... the editing process is akin to inpainting in image generation
models, where only the panels requiring modification are regenerated." Their own worked
example: a designer issues sequential edits — swap a round neckline for a shirt collar,
add a fitted waist, switch to a standing collar — and only the affected panels visibly
change between renders.

Their _reason_ for this (avoiding an expensive diffusion resample of every panel on every
edit) does not apply to us — `draftGarment` is instant and deterministic, there is no
resampling cost to avoid. But the same comparison, cheaply available for free from data we
already compute, surfaces a real, un-filed UX gap: `VersionCompare.tsx`
(`components/versions/VersionCompare.tsx`) already drafts both compared versions in full
(`drafted.from.pieces` / `drafted.to.pieces`, matched by each drafter's own stable piece
id — `front`, `back`, `sleeve`, `collar`, etc.) and overlays every piece from both versions
at identical visual weight. It never tells the user _which_ of those pieces actually
differ — the "O que mudou" panel only reports three aggregate numbers (Cava, Comprimento,
Consumo), not a per-piece signal. Checked against the existing backlog first (`gh issue
list`/`gh issue view` on every candidate): #234 (closed) only added the Comprimento row;
#257 and #265 both concern the _spec_ layer (what changed in the AI's parameters, and
scoping an edit to a named part before generation) — neither touches this screen's
post-hoc _geometry_ comparison between two already-drafted piece sets. Filed as new work,
the same way #270 filed #274 for a gap found while tracing an adjacent path:
**[#308](https://github.com/LeonardoMonteiroo/moldai/issues/308) — "mark unchanged pieces
in the version-compare overlay."**

## Out of scope, and why

- **GarmageNet's generative core** (the DiT panel synthesizer, GarmageJigsaw's learned
  stitching predictor) — see above: solves a problem shape we don't have, and would
  require real ML investment (training compute, a training corpus we don't possess) even
  if it did.
- **`embroidery_customization-impl`** — one-shot texture/style transfer via diffusion
  LoRA modulation. Purely visual-appearance customization on a reference image; no
  structured garment parameter, no pattern, no sewing relationship anywhere in the
  pipeline. No analog in this codebase, which has no texture or rendering layer at all.
- **`FashionR2R`** — CG-render-to-photorealistic-image domain translation. Same
  reasoning: a rendering/visual-fidelity problem with no structured-parameter or
  pattern-making content, and no rendering pipeline on our side for it to plug into.
- **The six SIGGRAPH 2024 papers** (FEM/MPM simulation, yarn-level cloth homogenization,
  cloth animation super-resolution, Gaussian-splat surface reconstruction, VR interaction)
  — cloth physics, 3D reconstruction, and spatial UI, none of it structured-parameter
  generation or pattern-making knowledge representation. MoldAI has no simulation, no 3D
  reconstruction, and no VR surface — there's no seam (pun aside) for any of it to attach
  to.
- **Style3D Studio**, the commercial CAD/simulation product referenced in a 2026 press
  release — a shipped product, not published research; out of scope for the same reason
  Style3D (the company)'s commercial tooling was never in scope for #270 either.

## Overlap with the concurrent ChatGarment spike (#272)

#272 was still open (in progress, run by a sibling worker) at the time this spike was
written, so its findings could not be read here. No overlap is asserted beyond the
structural observation already noted above: GarmageNet, Design2GarmentCode, and
(plausibly) ChatGarment are three independent systems converging on the same
"multi-modal input → structured parameters → deterministic construction" shape, which is
itself the corroborating signal worth recording, not a specific technique claimed by both
spikes. If #272 surfaces a citation-level overlap with anything in this document, that's
for whichever spike lands second to flag as a comment rather than a duplicate filing —
this document makes no claim about #272's own findings.

## Validity: what this spike could not establish

- **The panel-retention-comparison finding (#308) is a UX inference from a paper
  passage, not a measured user benefit.** No usability study of the current
  `VersionCompare` overlay was run before or after; the case for it rests on "the two
  piece lists already make this a free computation," not on observed user confusion.
- **The 108-token/9-dimension count is a vocabulary-breadth measurement, not a
  fit-quality comparison** — same caveat #270 stated for its own 409/59 count. A model
  choosing correctly among 108 richly-annotated tokens is a different problem than
  choosing among ours; this spike did not attempt to score which produces better
  real-world garments.
- **GarmageNet's own paper reports only one ablation** (2D+3D fused features vs. either
  alone, for stitching-correspondence accuracy — Table 3, 6.61mm vs. 7.79–10.59mm). No
  ablation exists for the diffusion architecture, the VAE latent dimensionality, or the
  nine-dimension taxonomy's own design — the same "measured against baselines, not
  against its own design choices" gap #270 found in Design2GarmentCode's paper.

## Method

1. `WebSearch` for Style3D's broader publication record and GitHub presence (not assumed
   from training data) surfaced GarmageNet, GarmageJigsaw, FashionR2R, the embroidery
   customization work, and the SIGGRAPH 2024 press release, cross-checked against the
   `github.com/Style3D` organization page fetched directly via `WebFetch`.
2. GarmageNet's abstract, architecture, and section 8.4 (progressive editing) were read
   from the arXiv HTML rendering (`arxiv.org/html/2504.01483` and the `ar5iv` mirror) and
   the project homepage (`style3d.github.io/garmagenet`), not a secondary summary — the
   panel-retention quote above is verbatim from that fetch.
3. The nine-dimension taxonomy and its per-dimension option counts were read directly off
   the paper's own description of its Figure 8 annotation scheme.
4. `garmagejigsaw-impl` and `embroidery_customization-impl`'s own repository descriptions
   were fetched directly to classify them, rather than inferred from their names.
5. `garmagenet-impl`'s `LICENSE` was fetched directly: **CC BY-NC-ND 4.0** (Attribution-
   NonCommercial-NoDerivatives), notably not the MIT license `design2garmentcode-impl`
   carries — a further, independent reason nothing from this repository could be adopted
   even if the generative core had been in scope; this spike only read the published
   paper's claims, and cloned nothing.
6. `gh issue list` / `gh issue view` checked every candidate finding (the vocabulary
   count, the panel-retention idea, GarmageJigsaw's stitching prediction) against the
   existing backlog before writing anything up as new — this is what surfaced that
   #260/#262 already covered the vocabulary-breadth conclusion and that #234/#257/#265
   didn't already cover the version-compare gap, before #308 was filed.
7. Our own vocabulary counts and seam-graph declaration model were re-read directly from
   `lib/draft/vocabulary.ts`, `lib/draft/seams.ts`, and
   `docs/architecture/seams-and-assembly.md` rather than recalled from #270's own summary.

No code from any Style3D repository was cloned into this repository or this spike's
working environment — this document and the paper/site fetches it cites are the only
research artifacts; the one landed change is issue #308, filed as new backlog work, not a
code change.
