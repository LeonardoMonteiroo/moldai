"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

// Decision 2 (issue #13): the "Formatos" nav item is a real anchor to this
// section, reusing Footer's existing format labels rather than inventing
// new copy -- the same five formats the editor's export menu offers.
const FORMAT_KEYS = [
  "formatSvg",
  "formatDxf",
  "formatDxfAama",
  "formatPdfA4",
  "formatPdfSingle",
] as const;

export function FormatsSection() {
  const t = useTranslations("Landing");
  const tFooter = useTranslations("Footer");

  return (
    <div id="formats" className="flex flex-col gap-[10px] px-[30px] pb-[34px]">
      <span className="font-display text-body font-semibold">
        {t("formats.title")}
      </span>
      <div className="flex flex-wrap gap-2">
        {FORMAT_KEYS.map((key) => (
          <Badge key={key} variant="outline" className="rounded-pill">
            {tFooter(key)}
          </Badge>
        ))}
      </div>
    </div>
  );
}
