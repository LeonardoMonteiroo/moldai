import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ATTACHMENT_KEYS = ["photo", "sketch", "dxf"] as const;

export function AttachmentChips() {
  const t = useTranslations("AttachmentChips");
  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      {/* Dashed borders read as provisional here, the same grammar the rest of
          the placeholders use — these three attachment kinds are not built yet. */}
      {ATTACHMENT_KEYS.map((key) => (
        <Button
          key={key}
          variant="outline"
          size="chrome"
          disabled
          title={t("comingSoonTitle")}
          className="rounded-pill text-placeholder border-dashed"
        >
          {t(key)}
        </Button>
      ))}
      <Badge variant="soon">{t("comingSoonBadge")}</Badge>
    </div>
  );
}
