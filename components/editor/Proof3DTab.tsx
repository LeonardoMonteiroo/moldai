import { useTranslations } from "next-intl";

export function Proof3DTab() {
  const t = useTranslations("Proof3DTab");
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex max-w-[280px] flex-col items-center gap-2 text-center">
        <span className="text-muted text-[28px]">◍</span>
        <span className="text-[13.5px] font-semibold">{t("title")}</span>
        <span className="text-muted text-[12px] leading-[1.5]">
          {t("description")}
        </span>
      </div>
    </div>
  );
}
