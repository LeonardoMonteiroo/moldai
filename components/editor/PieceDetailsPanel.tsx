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
    // EDCH-03: top-[58px] clears the floating tab bar, the same reasoning
    // as ConflictInfoCard (they share this corner, mutually exclusive).
    <div className="bg-surface border-border rounded-card shadow-card absolute top-[58px] right-5 bottom-5 flex w-[230px] flex-col gap-[11px] border p-[14px]">
      <div className="flex items-center">
        <span className="text-muted text-meta tracking-eyebrow font-semibold uppercase">
          {t("sectionLabel")}
        </span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("closeAriaLabel")}
          title={t("closeAriaLabel")}
          onClick={onClose}
          className="text-placeholder hover:text-muted-2"
        >
          <XIcon />
        </Button>
      </div>

      {/* Editor.dc.html:544-547: the name carries its cut quantity beside it,
          the same "· N×" the canvas label and the cut plan already state. */}
      <div className="flex items-baseline gap-2">
        <span className="font-display text-title font-semibold">
          {piece.name}
        </span>
        <span className="text-muted text-meta">{piece.qty}×</span>
      </div>

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
      {/* Editor.dc.html:552-563: the size chips sit directly under the
          eyebrow, and the action below them is ONE full-width button whose
          own label names the sizes and the cost. The chips used to be boxed
          in a dashed panel with that sentence repeated inside it as static
          text, above a second button that just said "Graduar" -- two controls'
          worth of chrome for one action. */}
      <div>
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
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        // #31: graduating also guards against a double click double-billing
        // the account -- this action had no other in-flight signal (no
        // spinner, the panel isn't hidden the way it is during a
        // generation), so nothing else disabled it while a request was
        // already out.
        disabled={gradable.length === 0 || graduating}
        onClick={() => onGraduate(gradable)}
      >
        {gradable.length > 0
          ? t("graduateSummary", {
              list: formatList(tf, gradable),
              cost: COSTS.graduate,
            })
          : t("allGraduated")}
      </Button>
    </div>
  );
}
