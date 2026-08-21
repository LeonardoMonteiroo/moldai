import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

const ATTACHMENT_KEYS = ["photo", "sketch", "dxf"] as const;

export function AttachmentChips() {
  const t = useTranslations("AttachmentChips");
  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      {ATTACHMENT_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          disabled
          title={t("comingSoonTitle")}
          className="rounded-pill border-border text-placeholder cursor-not-allowed border border-dashed px-[10px] py-[5px] text-[11.5px]"
        >
          {t(key)}
        </button>
      ))}
      <Badge variant="soon">{t("comingSoonBadge")}</Badge>
    </div>
  );
}
