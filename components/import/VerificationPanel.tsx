"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useImportStore } from "@/lib/importStore";

/**
 * What was found in the file, before anything is persisted — the
 * verification step CLAUDE.md asks for. One live region (`role="status"`)
 * for the checks, plus the honest limitation of this pass: creating a
 * Pattern from the parsed geometry is "em breve", not shipped here (see the
 * PR body for why — it needs a persisted-blob change this unit is
 * deliberately not making).
 */
export function VerificationPanel() {
  const t = useTranslations("Import");
  const analysis = useImportStore((s) => s.analysis);
  const reset = useImportStore((s) => s.reset);

  if (!analysis) return null;

  return (
    <div className="border-border bg-surface flex min-h-0 flex-col gap-[14px] rounded-lg border p-[18px]">
      <span className="text-meta text-muted tracking-eyebrow uppercase">
        {t("verificationSectionLabel")}
      </span>
      <ul role="status" className="flex flex-col gap-[6px]">
        {analysis.checks.map((check, i) => (
          <li
            key={i}
            className={
              "text-ui " +
              (check.level === "ok" ? "text-olive-dark" : "text-amber-text")
            }
          >
            {t("checks." + check.code, check.values)}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-[10px] border-t pt-[14px]">
        <p className="text-meta text-muted">{t("createDisabledNote")}</p>
        <div className="flex items-center justify-end gap-[10px]">
          <Button variant="outline" onClick={reset}>
            {t("cancelButton")}
          </Button>
          <Button disabled>{t("createButton")}</Button>
          <Badge variant="soon">{t("createComingSoon")}</Badge>
        </div>
      </div>
    </div>
  );
}
