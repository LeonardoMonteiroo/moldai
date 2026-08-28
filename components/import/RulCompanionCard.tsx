"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useImportStore } from "@/lib/importStore";

const ACCEPT = ".rul";

/**
 * The optional `.RUL` grading-rule companion (#231) — sits above the layer-
 * mapping/verification grid so it reads as a peer of the DXF summary, not a
 * sub-panel of either. Before a `.RUL` is picked it states plainly that no
 * companion was found and grading data was not read, per CLAUDE.md's
 * surface-limitations rule; nothing about the DXF-only flow above it changes
 * either way (#231 acceptance criterion — this card is purely additive).
 */
export function RulCompanionCard() {
  const t = useTranslations("Import");
  const inputRef = useRef<HTMLInputElement>(null);
  const analysis = useImportStore((s) => s.analysis);
  const loading = useImportStore((s) => s.loading);
  const rulActionError = useImportStore((s) => s.rulActionError);
  const pickRul = useImportStore((s) => s.pickRul);
  const clearRul = useImportStore((s) => s.clearRul);

  if (!analysis) return null;
  const rul = analysis.rul;

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void pickRul(file);
  }

  return (
    <div className="border-border bg-surface flex flex-col gap-[10px] rounded-lg border p-[18px]">
      <div className="flex items-center gap-[8px]">
        <span className="text-meta text-muted tracking-eyebrow uppercase">
          {t("rulSectionLabel")}
        </span>
        {rul && <Badge variant="soon">{t("betaBadge")}</Badge>}
      </div>

      {!rul ? (
        <div className="flex flex-col items-start gap-[8px]">
          <p className="text-ui text-muted max-w-[520px]">
            {t("rulNotProvidedNote")}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={onChange}
            aria-label={t("rulChooseButton")}
          />
          <Button
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={loading}
          >
            {t("rulChooseButton")}
          </Button>
          {rulActionError && (
            <p role="status" className="text-alert text-ui">
              {t("pickError." + rulActionError)}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          <div className="flex flex-wrap items-center gap-[22px]">
            <div>
              <div className="text-meta text-muted tracking-eyebrow uppercase">
                {t("rulFile")}
              </div>
              <div
                className="text-control max-w-[220px] truncate"
                title={rul.fileName}
              >
                {rul.fileName}
              </div>
            </div>
            {rul.tableId && (
              <div>
                <div className="text-meta text-muted tracking-eyebrow uppercase">
                  {t("rulTableId")}
                </div>
                <div className="text-control">{rul.tableId}</div>
              </div>
            )}
            {rul.product && (
              <div>
                <div className="text-meta text-muted tracking-eyebrow uppercase">
                  {t("rulProduct")}
                </div>
                <div className="text-control">{rul.product}</div>
              </div>
            )}
            <div>
              <div className="text-meta text-muted tracking-eyebrow uppercase">
                {t("rulSizeList")}
              </div>
              <div className="text-control">
                {rul.sizeList.length > 0 ? rul.sizeList.join(", ") : "—"}
              </div>
            </div>
            <div>
              <div className="text-meta text-muted tracking-eyebrow uppercase">
                {t("rulRuleCount")}
              </div>
              <div className="text-control">{rul.ruleCount}</div>
            </div>
          </div>
          <ul role="status" className="flex flex-col gap-[4px]">
            {rul.checks.map((check, i) => (
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
          <p className="text-meta text-muted">{t("rulBetaNote")}</p>
          <div>
            <Button variant="outline" onClick={clearRul}>
              {t("rulChangeButton")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
