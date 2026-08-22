import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function ConflictActions({
  onFix,
  onIgnore,
}: {
  onFix: () => void;
  onIgnore: () => void;
}) {
  const t = useTranslations("ConflictActions");
  return (
    <div className="-mt-1 flex flex-col gap-2">
      {/* No "Ver diferença": the two divergent seam lengths are part of the
          conflict's default presentation now (ConflictInfoCard's comparison and
          the labels on the canvas markers), so there is nothing left to reveal. */}
      <div className="flex flex-wrap items-center gap-[6px]">
        <Button size="sm" onClick={onFix}>
          {t("fixButton")}
        </Button>
        <Button size="sm" variant="outline" onClick={onIgnore}>
          {t("ignoreButton")}
        </Button>
      </div>
      <span className="text-muted text-meta">{t("freeNote")}</span>
    </div>
  );
}
