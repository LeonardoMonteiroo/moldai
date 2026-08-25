import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { COSTS, Pattern, Piece } from "@/lib/types";
import { formatList } from "@/lib/format";

export function PieceDetailsPanel({
  piece,
  pattern,
  onClose,
  onGraduate,
  graduating,
}: {
  piece: Piece;
  pattern: Pattern;
  onClose: () => void;
  onGraduate: (sizes: string[]) => void;
  graduating: boolean;
}) {
  const t = useTranslations("PieceDetailsPanel");
  const tf = useTranslations("Format");
  const detailRows = piece.detailRows ?? [];
  // The base size is already the size that was drafted — it doesn't need (or can't) be graded.
  const gradable = pattern.sizesPending.filter((s) => s !== pattern.baseSize);

  return (
    <div className="bg-surface border-border rounded-card shadow-card absolute top-5 right-5 bottom-5 flex w-[230px] flex-col gap-[11px] border p-[14px]">
      <div className="flex items-center">
        <span className="text-muted text-meta tracking-eyebrow font-semibold uppercase">
          {t("sectionLabel")}
        </span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("closeAriaLabel")}
          onClick={onClose}
          className="text-placeholder hover:text-muted-2"
        >
          <XIcon />
        </Button>
      </div>

      <div className="font-display text-body font-semibold">{piece.name}</div>

      {detailRows.length > 0 && (
        <div className="text-ui flex flex-col gap-2">
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

      <div className="text-muted text-meta tracking-eyebrow mt-[2px] font-semibold uppercase">
        {t("graduationLabel")}
      </div>
      <div className="border-pattern-guide rounded-item bg-surface-alt border border-dashed p-[10px]">
        <div className="text-meta flex gap-[5px]">
          {pattern.sizes.map((size) => {
            const isBase = size === pattern.baseSize;
            const active = isBase || pattern.sizesApplied.includes(size);
            return (
              <span
                key={size}
                title={isBase ? t("baseSizeTitle") : undefined}
                className={[
                  "rounded-[6px] px-[7px] py-[3px] font-semibold",
                  // #50: text-placeholder fails WCAG 1.4.3 (2.68:1) for
                  // plain informational text -- this chip isn't a disabled
                  // control, it's the only place the graded/ungraded
                  // distinction is shown.
                  active ? "bg-olive-tint text-olive" : "text-muted",
                  isBase ? "ring-olive-border ring-1" : "",
                ].join(" ")}
              >
                {size}
              </span>
            );
          })}
        </div>
        <div className="text-muted text-meta mt-2">
          {gradable.length > 0
            ? t("graduateSummary", {
                list: formatList(tf, gradable),
                cost: COSTS.graduate,
              })
            : t("allGraduated")}
        </div>
      </div>

      <Button
        variant="outline"
        // #31: graduating also guards against a double click double-billing
        // the account -- this action had no other in-flight signal (no
        // spinner, the panel isn't hidden the way it is during a
        // generation), so nothing else disabled it while a request was
        // already out.
        disabled={gradable.length === 0 || graduating}
        onClick={() => onGraduate(gradable)}
      >
        {t("graduateButton")}
      </Button>
    </div>
  );
}
