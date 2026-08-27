"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { EXPORT_FORMATS, EXPORT_FORMAT_LABELS } from "@/lib/export/formats";

// Decision 2 (issue #13): the "Formatos" nav item is a real anchor to this
// section, reusing Footer's existing format labels rather than inventing new
// copy -- the same formats the editor's export menu offers. Derived from
// EXPORT_FORMATS rather than re-listed here, so a format added to the app is
// advertised automatically instead of drifting out of this page.

export function FormatsSection() {
  const t = useTranslations("Landing");
  const tFooter = useTranslations("Footer");

  return (
    <div id="formats" className="flex flex-col gap-[10px] px-[30px] pb-[34px]">
      <span className="font-display text-body font-semibold">
        {t("formats.title")}
      </span>
      <div className="flex flex-wrap gap-2">
        {EXPORT_FORMATS.map((id) => (
          <Badge key={id} variant="outline" className="rounded-pill">
            {tFooter(EXPORT_FORMAT_LABELS[id].labelKey)}
          </Badge>
        ))}
      </div>
    </div>
  );
}
