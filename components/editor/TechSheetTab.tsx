import { useTranslations } from "next-intl";
import { Pattern } from "@/lib/types";
import { buildExportModel } from "@/lib/export/model";
import { wearingEaseCm } from "@/lib/draft/garment";
import { formatCm as cm } from "@/lib/format";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

export function TechSheetTab({ pattern }: { pattern: Pattern }) {
  const t = useTranslations("TechSheetTab");
  const tData = useTranslations("PatternData");
  // Dimensions (w × h in cm) per piece, from the model re-drafted in exact cm.
  const dims: Record<string, { w: number; h: number }> = {};
  if (pattern.spec && pattern.pieces.length > 0) {
    try {
      for (const p of buildExportModel(pattern, tData).pieces)
        dims[p.id] = { w: p.widthCm, h: p.heightCm };
    } catch {
      /* no valid spec: falls back to the no-dimensions behavior */
    }
  }

  const totalPieces = pattern.pieces.reduce((s, p) => s + p.qty, 0);
  const folga = pattern.spec?.style.seamAllowanceCm ?? 1;

  // #125: fit/stretch only apply to the bodice (blouse/dress/tshirt) --
  // draftSkirt never reads either, so a pure skirt pattern shows neither
  // chip rather than a number that doesn't correspond to anything drafted.
  const knit = pattern.spec?.type === "tshirt";
  const hasBodice =
    pattern.spec &&
    (pattern.spec.type === "blouse" ||
      pattern.spec.type === "dress" ||
      pattern.spec.type === "tshirt");
  const baseBustCm = pattern.sizeTable[pattern.baseSize]?.bust;
  const easeCm =
    hasBodice && pattern.spec && baseBustCm !== undefined
      ? wearingEaseCm(pattern.spec.style, knit, baseBustCm)
      : undefined;

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-[22px]">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="font-display text-title font-semibold">
            {t("title")}
          </span>
          <span className="text-muted text-ui">
            {t("subtitle", {
              name: pattern.name,
              baseSize: pattern.baseSize,
              unit: pattern.unit,
            })}
          </span>
        </div>

        {/* pattern summary */}
        {pattern.spec && (
          <div className="text-meta mb-4 flex flex-wrap gap-2">
            <Chip
              label={t("chipType")}
              value={t("garmentType." + pattern.spec.type)}
            />
            <Chip
              label={t("chipGender")}
              value={t("gender." + pattern.spec.gender)}
            />
            <Chip label={t("chipPieces")} value={`${totalPieces}`} />
            <Chip label={t("chipSeamAllowance")} value={`${cm(folga)} cm`} />
            {hasBodice && (
              <Chip
                label={knit ? t("chipFabric") : t("chipFit")}
                value={
                  knit
                    ? tData(
                        "stretch." + (pattern.spec!.style.stretch ?? "none"),
                      )
                    : tData("fit." + (pattern.spec!.style.fit ?? "fitted"))
                }
              />
            )}
            {easeCm !== undefined && (
              <Chip label={t("chipEase")} value={`${cm(easeCm)} cm`} />
            )}
            {/* Absent on patterns drafted before the snapshot recorded it —
                omitted rather than guessed at. */}
            {pattern.sizeChartName && (
              <Chip label={t("chipSizeChart")} value={pattern.sizeChartName} />
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {pattern.pieces.map((piece) => {
            const d = dims[piece.id];
            const detailRows = [
              ...(d
                ? [
                    {
                      label: t("dimensionsLabel"),
                      value: `${cm(d.w)} × ${cm(d.h)} cm`,
                    },
                  ]
                : []),
              ...(piece.detailRows ?? []),
            ];
            return (
              <div
                key={piece.id}
                className="border-border rounded-card bg-surface overflow-hidden border"
              >
                <div className="bg-surface-alt border-line flex items-baseline gap-2 border-b px-3 py-[9px]">
                  <span className="text-control font-semibold">
                    {piece.name}
                  </span>
                  <span className="text-muted text-ui">{piece.qty}×</span>
                </div>
                {detailRows.length > 0 ? (
                  <Table>
                    <TableBody>
                      {detailRows.map((row) => (
                        <TableRow key={row.label}>
                          {/* Labels wrap: the primitive keeps cells on one line,
                              which would scroll a long drafter label sideways
                              instead of using the width the card already has. */}
                          <TableCell className="text-muted w-1/2 px-3 py-[7px] whitespace-normal">
                            {row.label}
                          </TableCell>
                          <TableCell className="px-3 py-[7px] font-medium">
                            {row.value}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-muted text-ui px-3 py-[9px]">
                    {t("noDetails")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="border-border rounded-item bg-surface inline-flex items-baseline gap-[5px] border px-[9px] py-[4px]">
      <span className="text-muted text-tick tracking-eyebrow font-semibold uppercase">
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
