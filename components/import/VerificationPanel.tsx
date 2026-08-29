"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useImportStore } from "@/lib/importStore";
import { buildLayerPreview } from "@/lib/import/preview";
import { renderPreviewImage } from "./renderPreviewImage";
import { COSTS } from "@/lib/types";

/**
 * What was found in the file, before anything is persisted, plus the real
 * "Importar molde" action (#238 follow-up): render the layer preview to an
 * image, attach it to a brand-new Pattern's first `generate` call alongside
 * measured piece data, and navigate to the result. See
 * docs/superpowers/specs/2026-08-28-dxf-import-pattern-creation-design.md
 * for why the created Pattern is an ordinary AI-drafted one, not a literal
 * trace of the file.
 */
export function VerificationPanel() {
  const t = useTranslations("Import");
  const router = useRouter();
  const analysis = useImportStore((s) => s.analysis);
  const doc = useImportStore((s) => s.doc);
  const reset = useImportStore((s) => s.reset);
  const creating = useImportStore((s) => s.creating);
  const actionError = useImportStore((s) => s.actionError);
  const createPatternFromImport = useImportStore(
    (s) => s.createPatternFromImport,
  );

  if (!analysis || !doc) return null;

  async function handleImport() {
    const preview = buildLayerPreview(doc!);
    const file = await renderPreviewImage(preview);
    const id = await createPatternFromImport(
      file,
      t("reconstructionMessage", { fileName: analysis!.fileName }),
      t("autoDefaultMessage"),
    );
    if (id) router.push(`/pattern/${id}`);
  }

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
        {actionError === "insufficient_credits" && (
          <p className="text-ui text-amber-text">
            {t("insufficientCreditsError")}{" "}
            <Link href="/settings?section=plan" className="underline">
              {t("buyCreditsLink")}
            </Link>
          </p>
        )}
        {actionError === "image_failed" && (
          <p className="text-ui text-amber-text">{t("imageFailedError")}</p>
        )}
        {actionError &&
          actionError !== "insufficient_credits" &&
          actionError !== "image_failed" && (
            <p className="text-ui text-amber-text">{t("createError")}</p>
          )}
        <div className="flex items-center justify-end gap-[10px]">
          <Button variant="outline" onClick={reset}>
            {t("cancelButton")}
          </Button>
          <Button
            disabled={analysis.pieceCount === 0 || creating}
            onClick={handleImport}
          >
            {creating
              ? t("creatingLabel")
              : t("createButton", { cost: COSTS.adjust })}
          </Button>
          <Badge variant="soon">{t("betaBadge")}</Badge>
        </div>
      </div>
    </div>
  );
}
