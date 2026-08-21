import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
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
      <div className="flex flex-wrap items-center gap-[6px]">
        <Button size="sm" onClick={onFix}>
          {t("fixButton")}
        </Button>
        {/* "Ver diferença" had no handler at all: it looked live and silently did
            nothing. Per the convention, an unbuilt capability is shown disabled
            and badged rather than faked. */}
        <Button size="sm" variant="outline" disabled>
          {t("viewDiffButton")}
        </Button>
        <Badge variant="soon">{t("comingSoonBadge")}</Badge>
        <Button size="sm" variant="outline" onClick={onIgnore}>
          {t("ignoreButton")}
        </Button>
      </div>
      <span className="text-muted text-meta">{t("freeNote")}</span>
    </div>
  );
}
