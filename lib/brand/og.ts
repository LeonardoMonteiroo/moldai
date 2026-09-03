/**
 * The brand palette as literal values, for the generated Open Graph card.
 *
 * These duplicate tokens that live in app/globals.css, which is normally
 * exactly what this repo forbids -- but an `ImageResponse` is rendered by
 * satori, outside the browser and outside the stylesheet, so a
 * `var(--color-paper)` there resolves to nothing and the card renders
 * transparent. The same reason `lib/editor/thumbnail.ts` bakes colors into
 * the SVG string it exports, and this module joins it on CHECK 2's
 * RAW_OUTPUT_COLOR_EXEMPT list for the same reason.
 *
 * Keep in sync with the `@theme` block by hand; the OG card is the only
 * consumer, and it is checked by eye against the site whenever it changes.
 */
export const OG_COLORS = {
  paper: "#f4f2ec",
  ink: "#1c1c19",
  muted: "#6e6b60",
  olive: "#4a5a3a",
} as const;

/** The size every social platform crops from. */
export const OG_SIZE = { width: 1200, height: 630 } as const;
