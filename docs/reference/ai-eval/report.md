# AI eval report

Baseline: **anthropic:claude-sonnet-5** — generated 2026-09-06T22:14:21.888Z

This is a measurement, not a gate — see docs/decisions/generation-flow.md's
own note that a prompt/schema change ships on inspection alone today. Compare
this file's numbers against the previous commit's before trusting a change
made things better.

## Generation (37 cases)

- Decision accuracy: **100.0%**
- Field accuracy (apply cases only): **98.6%** (73 fields checked)
- Draft-success rate (applies, drafts, seamCheck empty): **100.0%** (30 applicable)

### Decision confusion (rows = expected, columns = actual)

| expected \ actual | apply | ask | decline | explain |
| ----------------- | ----- | --- | ------- | ------- |
| apply             | 30    | 0   | 0       | 0       |
| ask               | 0     | 3   | 0       | 0       |
| decline           | 0     | 0   | 2       | 0       |
| explain           | 0     | 0   | 0       | 2       |

### Per-case detail

| case                               | expected | actual  | pass | failed fields | draft ok |
| ---------------------------------- | -------- | ------- | ---- | ------------- | -------- |
| blouse-v-long                      | apply    | apply   | ✅   | —             | ✅       |
| blouse-band-collar                 | apply    | apply   | ✅   | —             | ✅       |
| blouse-shirt-collar-buttons        | apply    | apply   | ✅   | —             | ✅       |
| blouse-round-sleeveless-loose      | apply    | apply   | ✅   | —             | ✅       |
| blouse-darts-convertible           | apply    | apply   | ✅   | —             | ✅       |
| blouse-close-fit                   | apply    | apply   | ✅   | —             | ✅       |
| dress-aline-v                      | apply    | apply   | ✅   | —             | ✅       |
| dress-gore                         | apply    | apply   | ✅   | —             | ✅       |
| dress-circle                       | apply    | apply   | ✅   | —             | ✅       |
| dress-half-circle-length           | apply    | apply   | ✅   | —             | ✅       |
| dress-close-sleeveless             | apply    | apply   | ✅   | —             | ✅       |
| dress-darts-short-sleeve           | apply    | apply   | ✅   | —             | ✅       |
| skirt-straight                     | apply    | apply   | ✅   | —             | ✅       |
| skirt-aline                        | apply    | apply   | ✅   | —             | ✅       |
| skirt-gore                         | apply    | apply   | ✅   | —             | ✅       |
| skirt-circle                       | apply    | apply   | ✅   | —             | ✅       |
| skirt-half-circle-short            | apply    | apply   | ✅   | —             | ✅       |
| skirt-seam-allowance               | apply    | apply   | ✅   | —             | ✅       |
| tshirt-male-basic                  | apply    | apply   | ✅   | —             | ✅       |
| tshirt-long-sleeve                 | apply    | apply   | ✅   | —             | ✅       |
| tshirt-high-stretch                | apply    | apply   | ✅   | —             | ✅       |
| tshirt-sleeveless                  | apply    | apply   | ✅   | —             | ✅       |
| tshirt-low-stretch                 | apply    | apply   | ✅   | 1             | ✅       |
| tshirt-medium-stretch-short-sleeve | apply    | apply   | ✅   | —             | ✅       |
| trousers-female-straight           | apply    | apply   | ✅   | —             | ✅       |
| trousers-male-cropped              | apply    | apply   | ✅   | —             | ✅       |
| trousers-social                    | apply    | apply   | ✅   | —             | ✅       |
| trousers-seam-allowance            | apply    | apply   | ✅   | —             | ✅       |
| trousers-full-length               | apply    | apply   | ✅   | —             | ✅       |
| trousers-cropped-short             | apply    | apply   | ✅   | —             | ✅       |
| ask-underspecified                 | ask      | ask     | ✅   | —             | —        |
| ask-blouse-bare                    | ask      | ask     | ✅   | —             | —        |
| ask-trousers-bare                  | ask      | ask     | ✅   | —             | —        |
| decline-jacket                     | decline  | decline | ✅   | —             | —        |
| decline-trouser-silhouette         | decline  | decline | ✅   | —             | —        |
| explain-dart                       | explain  | explain | ✅   | —             | —        |
| explain-armhole                    | explain  | explain | ✅   | —             | —        |

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
