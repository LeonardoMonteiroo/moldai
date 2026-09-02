"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/shared/AppShell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useImportStore } from "@/lib/importStore";
import { FileSummaryCard } from "./FileSummaryCard";
import { LayerMappingPanel } from "./LayerMappingPanel";
import { LayerPreviewCanvas } from "./LayerPreviewCanvas";
import { PieceLabelPanel } from "./PieceLabelPanel";
import { VerificationPanel } from "./VerificationPanel";
import { RulCompanionCard } from "./RulCompanionCard";

/**
 * /import — a two-step "parse, analyse, verify" flow (design 5g's high-
 * fidelity target, scoped down for this first pass; see the PR body). No
 * sidebar, like /size-charts — this screen isn't part of either nav column.
 *
 * Deliberately no `credits` prop fetch: importing costs nothing and the
 * screen says so with its own amber "importação grátis" badge rather than
 * reading the account's balance for a number that's never spent.
 *
 * No generic ActionErrorNotice here — the store's only failure mode
 * (`pick()`) has exactly three distinguishable causes, and each is resolved
 * to its own message right where the file chooser lives (`FileSummaryCard`)
 * rather than a single fixed banner that can't tell "too large" from "not a
 * readable DXF".
 */
export function ImportShell({ userEmail }: { userEmail: string }) {
  const t = useTranslations("Import");
  const step = useImportStore((s) => s.step);
  const analysis = useImportStore((s) => s.analysis);
  const loadCredits = useImportStore((s) => s.loadCredits);

  // The top header stays credits-less (design's own choice for this screen)
  // -- this only feeds VerificationPanel's "Saldo" line, shown next to the
  // one real paid action here.
  useEffect(() => {
    loadCredits();
  }, [loadCredits]);

  return (
    <AppShell
      title={t("title")}
      subtitle={step === 1 ? t("stepFile") : t("stepMapping")}
      backHref="/"
      credits={null}
      userEmail={userEmail}
    >
      <ScrollArea fill className="min-h-0 flex-1">
        <div className="flex min-h-full flex-col gap-[18px] p-[22px]">
          <div className="flex flex-wrap items-center gap-[8px]">
            <Badge variant="soon">{t("betaBadge")}</Badge>
            <Badge variant="notice">{t("freeBadge")}</Badge>
          </div>
          <p className="text-muted text-ui max-w-[640px]">{t("formatNote")}</p>
          <FileSummaryCard />
          {step === 2 && analysis && (
            // The preview stays pinned in its own column (lg:sticky) so a
            // long "Identificar peças" or layer list never scrolls it out of
            // view -- hovering a row to spotlight/isolate its shape only
            // works if the drawing is still on screen while the user reads
            // the list beside it. Below lg it falls back to one stacked
            // column (no sticky sidebar on a narrow viewport).
            <div className="grid min-h-0 flex-1 gap-[18px] lg:grid-cols-[420px_1fr] lg:items-start">
              <div className="lg:sticky lg:top-[22px]">
                <LayerPreviewCanvas />
              </div>
              <div className="flex min-w-0 flex-col gap-[18px]">
                <RulCompanionCard />
                <PieceLabelPanel />
                <div className="grid min-h-0 grid-cols-2 gap-[18px]">
                  <LayerMappingPanel />
                  <VerificationPanel />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </AppShell>
  );
}
