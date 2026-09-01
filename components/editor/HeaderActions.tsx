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

/**
 * EDCH-05/06/07: "Histórico" and "Salvar como base" moved here from the
 * editor's now-deleted Footer, per the redesign reference putting both in
 * the header rather than a bottom bar. Same `Footer` i18n keys (that
 * namespace is already shared with ExportFormatList on the /export screen,
 * not 1:1 with a component) -- only where these render changed, not what
 * they say or do.
 */
export function HeaderActions({
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

  // Mirrors Footer.tsx's original exportDisabled exactly (same cause set),
  // kept spelled out rather than leaning on the "these two always coincide"
  // invariant its own comment documented.
  const saveDisabled =
    conflictActive ||
    generating ||
    pattern.pieces.length === 0 ||
    !pattern.spec;

  return (
    <div className="relative flex items-center gap-[7px]">
      <Button variant="outline" size="chrome" asChild>
        <Link href={`/pattern/${pattern.id}/versions`}>
          {t("versionsHistoryButton")}
        </Link>
      </Button>

      <Button
        variant="outline"
        size="chrome"
        disabled={saveDisabled}
        title={saveDisabled ? t("saveAsBaseDisabledTitle") : undefined}
        onClick={() => {
          setBaseName(pattern.name);
          setSavingBase(true);
        }}
      >
        {t("saveAsBaseButton")}
      </Button>

      {baseNotice && (
        <span
          role={baseNotice.tone === "error" ? "alert" : "status"}
          className={
            (baseNotice.tone === "error"
              ? "text-alert bg-amber-bg border-amber-border"
              : "text-olive bg-olive-tint") +
            " rounded-item text-meta absolute top-full right-0 z-10 mt-2 border px-[10px] py-[5px] whitespace-nowrap"
          }
        >
          {baseNotice.text}
        </span>
      )}

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
