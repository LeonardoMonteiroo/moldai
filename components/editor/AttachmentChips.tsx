import { useTranslations } from "next-intl";

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
      <span className="text-olive bg-olive-tint rounded-[5px] px-[6px] py-[2px] text-[10px] font-semibold tracking-[.6px] uppercase">
        {t("comingSoonBadge")}
      </span>
    </div>
  );
}
