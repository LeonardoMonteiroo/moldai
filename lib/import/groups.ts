// Groups detected DXF layer names that differ only by a leading page prefix
// ("P1_", "P2_", ...) — the same pen/color drawn once per page in a
// multi-page plot-to-DXF export (Illustrator's "save as DXF" names layers by
// RGB color + linetype rather than by role, and repeats that name per page).
// A real case: oskar_combined_cm.dxf carries ~33 such layers, half of them
// duplicates across two pages. Grouping them collapses the per-layer role
// mapping in LayerMappingPanel from one Select per raw layer to one per real
// pen, without changing the underlying per-layer `roles` map at all.
//
// Deliberately narrow: only a leading "P<digits>_" is stripped, so two layers
// that differ by anything else (a different color, a different linetype)
// never merge into the same group — this can under-group a file that uses a
// different page-prefix convention, but it can never mis-group one by
// conflating two genuinely different roles.

export interface LayerGroup {
  /** The shared name with any leading page prefix removed; the raw name when none was found. */
  key: string;
  /** Original detected-layer names belonging to this group, in file order. */
  layers: string[];
}

const PAGE_PREFIX_RE = /^P\d+_/;

export function groupLayers(layerNames: string[]): LayerGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, string[]>();
  for (const name of layerNames) {
    const key = name.replace(PAGE_PREFIX_RE, "");
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(name);
  }
  return order.map((key) => ({ key, layers: byKey.get(key)! }));
}
