import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function ConflictActions({
  onFix,
  onIgnore,
  fixable = true,
}: {
  onFix: () => void;
  onIgnore: () => void;
  // #134: "Corrigir manga" (refitSleeve) only ever addresses the armhole/cap
  // pair -- when a conflict's divergences are all of some other kind (a
  // waist join, today's newly-detected circle-skirt-dress case), there is no
  // automatic fix to offer (issue decision: report the two lengths, no fix
  // button). Defaults to true so a caller that hasn't threaded a conflict's
  // own fixability through yet (and every existing test) keeps both buttons.
  fixable?: boolean;
}) {
  const t = useTranslations("ConflictActions");
  return (
    <div className="-mt-1 flex flex-col gap-2">
      {/* No "Ver diferença": the two divergent seam lengths are part of the
          conflict's default presentation now (ConflictInfoCard's comparison and
          the labels on the canvas markers), so there is nothing left to reveal. */}
      <div className="flex flex-wrap items-center gap-[6px]">
        {fixable && (
          <Button size="sm" onClick={onFix}>
            {t("fixButton")}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onIgnore}>
          {t("ignoreButton")}
        </Button>
      </div>
      {fixable && <span className="text-muted text-meta">{t("freeNote")}</span>}
    </div>
  );
}
