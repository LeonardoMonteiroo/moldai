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

// The roles a real pattern-cutting file is expected to carry at least one
// layer for. `notch`/`ignore` are assignable (matching design 5g's mapping
// UI) but nothing downstream depends on their presence.
const EXPECTED_ROLES: LayerRole[] = ["cut", "seam", "grain"];

/**
 * One row per detected layer, each with a role Select over the single
 * exported LAYER_ROLES list — a catalog lookup keyed by the EN value
 * (t("layerRole." + role)), never a hand-written label map. A mapped row's
 * chip sits on the olive-tint token; an expected-but-absent role gets its
 * own amber notice badge.
 */
export function LayerMappingPanel() {
  const t = useTranslations("Import");
  const analysis = useImportStore((s) => s.analysis);
  const roles = useImportStore((s) => s.roles);
  const setRole = useImportStore((s) => s.setRole);

  if (!analysis) return null;

  const mappedRoles = new Set(Object.values(roles));
  const missingExpected = EXPECTED_ROLES.filter((r) => !mappedRoles.has(r));

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
        {analysis.layers.map((layer) => {
          const role = roles[layer.name] ?? "ignore";
          return (
            <li
              key={layer.name}
              className="flex items-center justify-between gap-[10px]"
            >
              <span
                className={
                  "text-control min-w-0 truncate rounded-md px-[8px] py-[3px] " +
                  (role !== "ignore" ? "bg-accent text-accent-foreground" : "")
                }
                title={layer.name}
              >
                {layer.name}
              </span>
              <Select
                value={role}
                onValueChange={(value) =>
                  setRole(layer.name, value as LayerRole)
                }
              >
                <SelectTrigger size="sm" aria-label={layer.name}>
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
