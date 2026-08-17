import { useTranslations } from "next-intl";
import { Pattern } from "@/lib/types";
import { buildExportModel } from "@/lib/export/model";

const cm = (n: number) => n.toFixed(1).replace(".", ",");

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
      /* sem spec válido: cai no comportamento sem dimensões */
    }
  }

  const totalPieces = pattern.pieces.reduce((s, p) => s + p.qty, 0);
  const folga = pattern.spec?.style.seamAllowanceCm ?? 1;

  return (
    <div className="flex-1 overflow-auto p-[22px]">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="font-display text-[19px] font-semibold">
          {t("title")}
        </span>
        <span className="text-muted text-[12px]">
          {t("subtitle", {
            name: pattern.name,
            baseSize: pattern.baseSize,
            unit: pattern.unit,
          })}
        </span>
      </div>

      {/* resumo do molde */}
      {pattern.spec && (
        <div className="mb-4 flex flex-wrap gap-2 text-[11.5px]">
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
                <span className="text-[13px] font-semibold">{piece.name}</span>
                <span className="text-muted text-[12px]">{piece.qty}×</span>
              </div>
              {detailRows.length > 0 ? (
                <table className="w-full border-collapse text-[12.5px]">
                  <tbody>
                    {detailRows.map((row, i) => (
                      <tr
                        key={row.label}
                        className={i > 0 ? "border-line border-t" : undefined}
                      >
                        <td className="text-muted w-1/2 px-3 py-[7px]">
                          {row.label}
                        </td>
                        <td className="px-3 py-[7px] font-medium">
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-muted px-3 py-[9px] text-[12px]">
                  {t("noDetails")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="border-border rounded-item bg-surface inline-flex items-baseline gap-[5px] border px-[9px] py-[4px]">
      <span className="text-muted text-[10px] font-semibold tracking-[.5px] uppercase">
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
