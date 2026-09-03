/**
 * The landing page's FAQ, in the order it renders.
 *
 * Plain data in `lib/` rather than a const exported from FaqSection, because
 * the Server Component in app/page.tsx needs the same list to emit the
 * FAQPage structured data -- and importing a non-component value out of a
 * "use client" module into server code becomes a broken client reference at
 * runtime (the SETTINGS_SECTIONS precedent).
 *
 * One list, so the rendered questions and the ones a search engine is told
 * about can never drift apart. A2 #10 asks for six to twelve.
 */
export const FAQ_KEYS = [
  "seamCheck",
  "sizeChart",
  "dxf",
  "readyToCut",
  "skill",
  "versions",
  "importDxf",
  "billing",
] as const;

export type FaqKey = (typeof FAQ_KEYS)[number];
