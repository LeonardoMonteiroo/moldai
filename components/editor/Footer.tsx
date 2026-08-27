"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Pattern } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";

export function Footer({
  pattern,
  conflictActive,
  generating,
}: {
  pattern: Pattern;
  conflictActive: boolean;
  generating: boolean;
}) {
  const t = useTranslations("Footer");

  const saveAsSloper = useEditorStore((s) => s.saveAsSloper);
  const [savingBase, setSavingBase] = useState(false);
  const [baseName, setBaseName] = useState(pattern.name);
  const [baseNotice, setBaseNotice] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!baseNotice) return;
    const timeout = setTimeout(() => setBaseNotice(null), 6000);
    return () => clearTimeout(timeout);
  }, [baseNotice]);

  const submitBase = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = baseName.trim();
    if (!name) return;
    setSavingBase(false);
    setBaseNotice(
      (await saveAsSloper(name))
        ? { tone: "ok", text: t("saveAsBaseSaved") }
        : { tone: "error", text: t("saveAsBaseError") },
    );
  };
  // #115: copies-to-cut (qty summed across pieces), not the piece count --
  // a blouse's front×1/back×1/sleeve×2 is 3 pieces but 4 copies, and this
  // status line used to call that 4 "peças" while the canvas shows 3 and
  // TechSheetTab lists 3 cards.
  const copyCount = pattern.pieces.reduce((sum, p) => sum + p.qty, 0);
  const exportDisabled =
    conflictActive ||
    generating ||
    pattern.pieces.length === 0 ||
    !pattern.spec;
  // #116/#17: a reason per cause, mirroring saveAsBaseDisabledTitle below --
  // pattern.pieces.length === 0 and !pattern.spec always coincide (both are
  // set together by applyGarmentSpec), so they share one "nothing drafted"
  // message rather than needing a third, redundant string. #17 removed the
  // dropdown that used to live here — Exportar now just links to the
  // dedicated /pattern/[id]/export screen, which repeats this same
  // disabled-with-a-reason contract on its own download button rather than
  // silently letting a blocked visitor land on a screen with nothing to do.
  const exportDisabledTitle = conflictActive
    ? t("exportDisabledConflictTitle")
    : generating
      ? t("exportDisabledGeneratingTitle")
      : pattern.pieces.length === 0 || !pattern.spec
        ? t("exportDisabledBlankTitle")
        : undefined;

  const statusText = conflictActive
    ? t("statusConflict", { version: pattern.version })
    : generating
      ? t("statusGenerating")
      : t("statusReady", {
          copyCount,
          baseSize: pattern.baseSize,
          unit: pattern.unit,
        });

  return (
    <div className="bg-surface border-border flex items-center gap-[10px] border-t px-4 py-3">
      <span className="text-muted text-ui">{statusText}</span>
      <div className="flex-1" />

      {baseNotice && (
        <span
          role={baseNotice.tone === "error" ? "alert" : "status"}
          className={
            baseNotice.tone === "error"
              ? "text-alert bg-amber-bg border-amber-border rounded-item text-meta border px-[10px] py-[5px]"
              : "text-olive bg-olive-tint rounded-item text-meta px-[10px] py-[5px]"
          }
        >
          {baseNotice.text}
        </span>
      )}

      {exportDisabled ? (
        <Button variant="outline" disabled title={exportDisabledTitle}>
          {t("exportButton")}
        </Button>
      ) : (
        <Button variant="outline" asChild>
          <Link href={`/pattern/${pattern.id}/export`}>
            {t("exportButton")}
          </Link>
        </Button>
      )}

      <Button
        variant="outline"
        disabled={exportDisabled}
        title={exportDisabled ? t("saveAsBaseDisabledTitle") : undefined}
        onClick={() => {
          setBaseName(pattern.name);
          setSavingBase(true);
        }}
      >
        {t("saveAsBaseButton")}
      </Button>

      {/* #16: the pattern is now versioned automatically on every credit-
          charging (or free-but-state-changing) mutation -- there is nothing
          left to manually "save", so the disabled button became a link to
          the history it produces. */}
      <Button variant="outline" asChild>
        <Link href={`/pattern/${pattern.id}/versions`}>
          {t("versionsHistoryButton")}
        </Link>
      </Button>

      <Dialog open={savingBase} onOpenChange={setSavingBase}>
        <DialogContent>
          <form onSubmit={submitBase}>
            <DialogHeader>
              <DialogTitle>{t("saveAsBaseTitle")}</DialogTitle>
            </DialogHeader>
            <Field className="py-4">
              <FieldLabel htmlFor="save-as-base-name">
                {t("saveAsBasePrompt")}
              </FieldLabel>
              <Input
                id="save-as-base-name"
                value={baseName}
                maxLength={MAX_PATTERN_NAME_LENGTH}
                onChange={(event) => setBaseName(event.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSavingBase(false)}
              >
                {t("saveAsBaseCancelButton")}
              </Button>
              <Button type="submit" size="sm" disabled={!baseName.trim()}>
                {t("saveAsBaseSaveButton")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
