import { useTranslations } from "next-intl";
import { COSTS, Pattern, Piece } from "@/lib/types";
import { formatList } from "@/lib/format";

export function PieceDetailsPanel({
  piece,
  pattern,
  onClose,
  onGraduate,
}: {
  piece: Piece;
  pattern: Pattern;
  onClose: () => void;
  onGraduate: (sizes: string[]) => void;
}) {
  const t = useTranslations("PieceDetailsPanel");
  const detailRows = piece.detailRows ?? [];
  // The base size is already the size that was drafted — it doesn't need (or can't) be graded.
  const gradable = pattern.sizesPending.filter((s) => s !== pattern.baseSize);

  return (
    <div className="bg-surface border-border rounded-card shadow-card absolute top-5 right-5 bottom-5 flex w-[230px] flex-col gap-[11px] border p-[14px]">
      <div className="flex items-center">
        <span className="text-muted text-[11px] font-semibold tracking-[.8px] uppercase">
          {t("sectionLabel")}
        </span>
        <div className="flex-1" />
        <button
          onClick={onClose}
          className="text-placeholder hover:text-muted-2 text-[13px]"
        >
          ✕
        </button>
      </div>

      <div className="font-display text-[16px] font-semibold">{piece.name}</div>

      {detailRows.length > 0 && (
        <div className="flex flex-col gap-2 text-[12.5px]">
          {detailRows.map((row, i) => (
            <div key={row.label}>
              <div className="flex justify-between">
                <span className="text-muted">{row.label}</span>
                <span className="font-medium">{row.value}</span>
              </div>
              {i < detailRows.length - 1 && (
                <div className="bg-line mt-2 h-px" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="text-muted mt-[2px] text-[11px] font-semibold tracking-[.8px] uppercase">
        {t("graduationLabel")}
      </div>
      <div className="border-pattern-guide rounded-item bg-surface-alt border border-dashed p-[10px]">
        <div className="flex gap-[5px] text-[11.5px]">
          {pattern.sizes.map((size) => {
            const isBase = size === pattern.baseSize;
            const active = isBase || pattern.sizesApplied.includes(size);
            return (
              <span
                key={size}
                title={isBase ? t("baseSizeTitle") : undefined}
                className={[
                  "rounded-[6px] px-[7px] py-[3px] font-semibold",
                  active ? "bg-olive-tint text-olive" : "text-placeholder",
                  isBase ? "ring-olive-border ring-1" : "",
                ].join(" ")}
              >
                {size}
              </span>
            );
          })}
        </div>
        <div className="text-muted mt-2 text-[11.5px]">
          {gradable.length > 0
            ? t("graduateSummary", {
                list: formatList(gradable),
                cost: COSTS.graduate,
              })
            : t("allGraduated")}
        </div>
      </div>

      <button
        disabled={gradable.length === 0}
        onClick={() => onGraduate(gradable)}
        className="border-border rounded-btn hover:bg-surface-alt border py-[9px] text-center text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("graduateButton")}
      </button>

      <div className="flex-1" />
      <span className="text-muted text-[11.5px]" title={t("glossaryTitle")}>
        {t("glossaryText")}
      </span>
    </div>
  );
}
