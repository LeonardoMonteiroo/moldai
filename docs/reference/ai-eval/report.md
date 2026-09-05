# AI eval report

Baseline: **anthropic:claude-sonnet-5** — generated 2026-09-05T16:36:18.695Z

This is a measurement, not a gate — see docs/decisions/generation-flow.md's
own note that a prompt/schema change ships on inspection alone today. Compare
this file's numbers against the previous commit's before trusting a change
made things better.

## Generation (33 cases)

- Decision accuracy: **69.7%**
- Field accuracy (apply cases only): **100.0%** (48 fields checked)
- Draft-success rate (applies, drafts, seamCheck empty): **100.0%** (20 applicable)

### Decision confusion (rows = expected, columns = actual)

| expected \ actual | apply | ask | decline | explain |
| ----------------- | ----- | --- | ------- | ------- |
| apply             | 20    | 10  | 0       | 0       |
| ask               | 0     | 1   | 0       | 0       |
| decline           | 0     | 0   | 1       | 0       |
| explain           | 0     | 0   | 0       | 1       |

### Per-case detail

| case                               | expected | actual  | pass | failed fields | draft ok |
| ---------------------------------- | -------- | ------- | ---- | ------------- | -------- |
| blouse-v-long                      | apply    | ask     | ❌   | —             | —        |
| blouse-band-collar                 | apply    | apply   | ✅   | —             | ✅       |
| blouse-shirt-collar-buttons        | apply    | apply   | ✅   | —             | ✅       |
| blouse-round-sleeveless-loose      | apply    | apply   | ✅   | —             | ✅       |
| blouse-darts-convertible           | apply    | ask     | ❌   | —             | —        |
| blouse-close-fit                   | apply    | apply   | ✅   | —             | ✅       |
| dress-aline-v                      | apply    | ask     | ❌   | —             | —        |
| dress-gore                         | apply    | ask     | ❌   | —             | —        |
| dress-circle                       | apply    | ask     | ❌   | —             | —        |
| dress-half-circle-length           | apply    | ask     | ❌   | —             | —        |
| dress-close-sleeveless             | apply    | apply   | ✅   | —             | ✅       |
| dress-darts-short-sleeve           | apply    | ask     | ❌   | —             | —        |
| skirt-straight                     | apply    | apply   | ✅   | —             | ✅       |
| skirt-aline                        | apply    | ask     | ❌   | —             | —        |
| skirt-gore                         | apply    | ask     | ❌   | —             | —        |
| skirt-circle                       | apply    | apply   | ✅   | —             | ✅       |
| skirt-half-circle-short            | apply    | apply   | ✅   | —             | ✅       |
| skirt-seam-allowance               | apply    | apply   | ✅   | —             | ✅       |
| tshirt-male-basic                  | apply    | apply   | ✅   | —             | ✅       |
| tshirt-long-sleeve                 | apply    | apply   | ✅   | —             | ✅       |
| tshirt-high-stretch                | apply    | apply   | ✅   | —             | ✅       |
| tshirt-sleeveless                  | apply    | apply   | ✅   | —             | ✅       |
| tshirt-low-stretch                 | apply    | ask     | ❌   | —             | —        |
| tshirt-medium-stretch-short-sleeve | apply    | apply   | ✅   | —             | ✅       |
| trousers-female-straight           | apply    | apply   | ✅   | —             | ✅       |
| trousers-male-cropped              | apply    | apply   | ✅   | —             | ✅       |
| trousers-social                    | apply    | apply   | ✅   | —             | ✅       |
| trousers-seam-allowance            | apply    | apply   | ✅   | —             | ✅       |
| trousers-full-length               | apply    | apply   | ✅   | —             | ✅       |
| trousers-cropped-short             | apply    | apply   | ✅   | —             | ✅       |
| ask-underspecified                 | ask      | ask     | ✅   | —             | —        |
| decline-jacket                     | decline  | decline | ✅   | —             | —        |
| explain-dart                       | explain  | explain | ✅   | —             | —        |

## Editing (8 cases)

- Change accuracy (every expected field moved): **100.0%**
- Collateral-change rate (an unrelated field moved too): **0.0%**

### Per-case detail

| case                       | changed as expected | collateral |
| -------------------------- | ------------------- | ---------- |
| edit-blouse-neckline-depth | ✅                  | —          |
| edit-dress-skirt-length    | ✅                  | —          |
| edit-skirt-seam-allowance  | ✅                  | —          |
| edit-tshirt-sleeve         | ✅                  | —          |
| edit-trousers-length       | ✅                  | —          |
| edit-blouse-armhole        | ✅                  | —          |
| edit-dress-fit-loose       | ✅                  | —          |
| edit-blouse-collar         | ✅                  | —          |
