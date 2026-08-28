"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useImportStore } from "@/lib/importStore";
import { LAYER_ROLES, type LayerRole } from "@/lib/import/types";
import { groupLayers } from "@/lib/import/groups";

// The roles a real pattern-cutting file is expected to carry at least one
// layer for. `notch`/`ignore` are assignable (matching design 5g's mapping
// UI) but nothing downstream depends on their presence.
const EXPECTED_ROLES: LayerRole[] = ["cut", "seam", "grain"];

/**
 * One row per detected LAYER GROUP (lib/import/groups.ts — layers that
 * differ only by a leading page prefix, the "same pen drawn once per page"
 * shape a plot-to-DXF export routinely produces), each with a role Select
 * over the single exported LAYER_ROLES list — a catalog lookup keyed by the
 * EN value (t("layerRole." + role)), never a hand-written label map.
 * Choosing a role applies it to every layer in the group at once. A mapped
 * row's chip sits on the olive-tint token; an expected-but-absent role gets
 * its own amber notice badge. Hovering/focusing a row highlights the whole
 * group in LayerPreviewCanvas via `hoveredLayers`.
 */
export function LayerMappingPanel() {
  const t = useTranslations("Import");
  const analysis = useImportStore((s) => s.analysis);
  const roles = useImportStore((s) => s.roles);
  const setRoleForLayers = useImportStore((s) => s.setRoleForLayers);
  const setHoveredLayers = useImportStore((s) => s.setHoveredLayers);

  if (!analysis) return null;

  const mappedRoles = new Set(Object.values(roles));
  const missingExpected = EXPECTED_ROLES.filter((r) => !mappedRoles.has(r));
  const groups = groupLayers(analysis.layers.map((l) => l.name));

  return (
    <div className="border-border bg-surface flex min-h-0 flex-col gap-[10px] rounded-lg border p-[18px]">
      <span className="text-meta text-muted tracking-eyebrow uppercase">
        {t("layersSectionLabel")}
      </span>
      {missingExpected.length > 0 && (
        <div className="flex flex-wrap gap-[6px]">
          {missingExpected.map((role) => (
            <Badge key={role} variant="notice">
              {t("layerRole." + role)}: {t("layerNotFound")}
            </Badge>
          ))}
        </div>
      )}
      <ul className="flex flex-col gap-[8px]">
        {groups.map((group) => {
          const role = roles[group.layers[0]] ?? "ignore";
          const label = group.layers.length > 1 ? group.key : group.layers[0];
          return (
            // Pointer-only highlight of this group in LayerPreviewCanvas —
            // there is no interactive ARIA role for "hover region," and the
            // row's real interactive control (the Select below) carries its
            // own onFocus/onBlur for keyboard users.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            <li
              key={group.key}
              className="flex items-center justify-between gap-[10px]"
              onMouseEnter={() => setHoveredLayers(group.layers)}
              onMouseLeave={() => setHoveredLayers(null)}
            >
              <span
                className={
                  "text-control flex min-w-0 items-center gap-[6px] truncate rounded-md px-[8px] py-[3px] " +
                  (role !== "ignore" ? "bg-accent text-accent-foreground" : "")
                }
                title={group.layers.join(", ")}
              >
                <span className="min-w-0 truncate">{label}</span>
                {group.layers.length > 1 && (
                  <Badge variant="outline" size="chip">
                    {t("layerGroupCount", { count: group.layers.length })}
                  </Badge>
                )}
              </span>
              <Select
                value={role}
                onValueChange={(value) =>
                  setRoleForLayers(group.layers, value as LayerRole)
                }
              >
                <SelectTrigger
                  size="sm"
                  aria-label={label}
                  onFocus={() => setHoveredLayers(group.layers)}
                  onBlur={() => setHoveredLayers(null)}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LAYER_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t("layerRole." + r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
