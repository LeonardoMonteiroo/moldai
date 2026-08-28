"use client";

import { useTranslations } from "next-intl";
import { AppShell } from "@/components/shared/AppShell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useImportStore } from "@/lib/importStore";
import { FileSummaryCard } from "./FileSummaryCard";
import { LayerMappingPanel } from "./LayerMappingPanel";
import { LayerPreviewCanvas } from "./LayerPreviewCanvas";
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
            <>
              <RulCompanionCard />
              <LayerPreviewCanvas />
              <div className="grid min-h-0 flex-1 grid-cols-2 gap-[18px]">
                <LayerMappingPanel />
                <VerificationPanel />
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </AppShell>
  );
}
