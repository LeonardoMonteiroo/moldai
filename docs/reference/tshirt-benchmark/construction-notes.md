# Construction notes

- **Garment:** men's crew-neck short-sleeve tee — round neck, set-in short sleeve, ribbed
  collar band with shoulder-to-shoulder reinforcement tape, dropped/relaxed shoulder line,
  narrow twin-needle hem (2cm topstitch width, 2-needle coverstitch).
- **Body fabric:** single jersey knit, 30/1 combed cotton yarn. Width 1.20m. Weight 160.00 g/m².
  Composition: 100% cotton.
- **Collar-band fabric:** 1×1 rib knit, 30/1 combed yarn — a separate, differently-composed
  fabric from the body. Width 80.00cm. Weight 230.00 g/m². Composition: 97% cotton / 3%
  elastane.
- **Grade:** P-M-G-GG, ratio 1-1-1-1 (matches `measurements.json`'s four sizes and the ~1cm-
  per-size progression `segment-measurements.md`'s source states).
- **Trims:** none — plain pullover tee, no closures.

## Relevance to this app's `tshirt` drafter (`lib/draft/*`, `knit: true`)

- Same garment archetype (`GarmentType = "tshirt"`): round neck, no darts, short sleeves,
  ribbed collar. A genuinely comparable real-world reference, not an approximation from a
  different silhouette.
- The 2cm hem and the ribbed collar with a reinforcement tape are real construction details
  this app's drafter may or may not currently model at this fidelity — worth checking against
  `lib/draft/subpieces.ts`'s collar drafter and each piece's `detailRows`/hem allowance handling
  before assuming a geometry mismatch is a _formula_ bug rather than a _feature the drafter
  doesn't represent yet_ (e.g. the reinforcement tape, or the specific 2cm/2-needle hem width
  vs. whatever this app's default seam/hem allowance currently is).
- Fabric is knit for the body and a _separate_, differently-composed rib knit for the collar —
  this app's `subpieces.ts` collar drafter should already be aware collar and body are cut from
  different pieces, but confirm it doesn't assume identical stretch/ease behavior for both.
