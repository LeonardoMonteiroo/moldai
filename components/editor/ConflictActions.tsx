import { useTranslations } from "next-intl";

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
      <div className="flex flex-wrap gap-[6px]">
        <button
          onClick={onFix}
          className="rounded-pill bg-ink px-[11px] py-[6px] text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          {t("fixButton")}
        </button>
        <button className="rounded-pill border-border text-muted-2 hover:bg-surface-alt border px-[11px] py-[6px] text-[11.5px] transition-colors">
          {t("viewDiffButton")}
        </button>
        <button
          onClick={onIgnore}
          className="rounded-pill border-border text-muted-2 hover:bg-surface-alt border px-[11px] py-[6px] text-[11.5px] transition-colors"
        >
          {t("ignoreButton")}
        </button>
      </div>
      <span className="text-muted text-[11.5px]">{t("freeNote")}</span>
    </div>
  );
}
