"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileDownIcon } from "lucide-react";
import type { Credits, PatternRecord } from "@/lib/types";
import { exportPattern, type ExportFormat } from "@/lib/export";
import { DEFAULT_EXPORT_PRESET, type ExportPreset } from "@/lib/export/preset";
import { getExportPreset, saveExportPreset } from "@/lib/api-client";
import { AppShell } from "@/components/shared/AppShell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyContent,
} from "@/components/ui/empty";
import { ExportFormatList } from "./ExportFormatList";
import { ExportOptions } from "./ExportOptions";
import { ExportChecklist } from "./ExportChecklist";

export function ExportShell({
  pattern,
  conflictActive,
  credits,
  userEmail,
}: {
  pattern: PatternRecord;
  conflictActive: boolean;
  credits: Credits;
  userEmail: string;
}) {
  const t = useTranslations("Export");
  const tData = useTranslations("PatternData");

  // #17: the preset is now the account's, not the browser's. `savedPreset`
  // starts at DEFAULT_EXPORT_PRESET -- both the server render and the
  // client's first paint agree on that, so there is no hydration mismatch
  // to reconcile -- and is replaced by whatever GET /api/account/export-preset
  // returns once that resolves, purely as a follow-up client render (the
  // ordinary async-fetch-after-mount pattern, not a hydration trick).
  // `override` holds this tab's own in-progress edits since the last save;
  // `hasInteracted` stops a late-arriving fetch response from clobbering an
  // edit the visitor already started making before it landed.
  const [savedPreset, setSavedPreset] = useState<ExportPreset>(
    DEFAULT_EXPORT_PRESET,
  );
  const [override, setOverride] = useState<ExportPreset | null>(null);
  const preset = override ?? savedPreset;
  const hasInteracted = useRef(false);
  const [selectedSize, setSelectedSize] = useState(pattern.baseSize);
  const [exportError, setExportError] = useState<string | null>(null);
  const [presetSaved, setPresetSaved] = useState(false);
  const [presetLoadError, setPresetLoadError] = useState(false);

  function updatePreset(updater: (p: ExportPreset) => ExportPreset) {
    hasInteracted.current = true;
    setOverride(updater(preset));
  }

  // #17/react-hooks/set-state-in-effect: every setState call here has to
  // live inside the promise's own .then/.catch, not synchronously in the
  // function body -- calling it synchronously (even indirectly, through a
  // function an effect invokes) is exactly the "setState directly within an
  // effect" shape this repo's lint config flags, the same constraint that
  // drove the localStorage-era code towards useSyncExternalStore instead of
  // a hand-written effect.
  const loadPreset = useCallback(() => {
    getExportPreset()
      .then(({ preset: fetched }) => {
        // A null preset means "never saved" -- keep whatever is already on
        // screen (the default) rather than overwriting it with nothing.
        // A non-null one only applies if the visitor hasn't already started
        // editing, so a slow response can't stomp on an in-progress choice.
        if (fetched !== null && !hasInteracted.current) {
          setSavedPreset(fetched);
        }
        setPresetLoadError(false);
      })
      .catch(() => setPresetLoadError(true));
  }, []);

  useEffect(() => {
    loadPreset();
  }, [loadPreset]);

  useEffect(() => {
    if (!exportError) return;
    const timeout = setTimeout(() => setExportError(null), 6000);
    return () => clearTimeout(timeout);
  }, [exportError]);

  useEffect(() => {
    if (!presetSaved) return;
    const timeout = setTimeout(() => setPresetSaved(false), 4000);
    return () => clearTimeout(timeout);
  }, [presetSaved]);

  const blank = pattern.pieces.length === 0 || !pattern.spec;

  function selectFormat(format: ExportFormat) {
    updatePreset((p) => ({ ...p, format }));
  }

  async function savePreset() {
    try {
      const { preset: saved } = await saveExportPreset(preset);
      // The server's response is the sanitised, authoritative shape -- an
      // out-of-range custom roll width the visitor typed, for instance,
      // comes back corrected. Adopting it (and clearing `override`) is what
      // makes the round trip honest instead of just optimistically assuming
      // whatever was sent stuck verbatim.
      setSavedPreset(saved);
      setOverride(null);
      setPresetSaved(true);
    } catch {
      setExportError(t("presetSaveError"));
    }
  }

  function handleDownload() {
    setExportError(null);
    exportPattern(
      pattern,
      preset.format,
      tData,
      (msg) => setExportError(msg),
      selectedSize,
      {
        pageSize: preset.pageSize,
        rollWidthCm: preset.rollWidthCm ?? undefined,
      },
    );
  }

  return (
    <AppShell
      title={pattern.name}
      backHref={`/pattern/${pattern.id}`}
      credits={credits}
      userEmail={userEmail}
    >
      {blank ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-[22px]">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon" aria-hidden="true">
                <FileDownIcon />
              </EmptyMedia>
              <EmptyTitle className="text-control font-semibold">
                {t("emptyTitle")}
              </EmptyTitle>
              <EmptyDescription className="max-w-[300px]">
                {t("emptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" asChild>
                <a href={`/pattern/${pattern.id}`}>{t("backToEditorButton")}</a>
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <ScrollArea className="bg-paper min-h-0 flex-1">
          <div className="mx-auto flex max-w-[820px] flex-col gap-4 px-[24px] py-[22px]">
            {presetLoadError && (
              <span
                role="alert"
                className="text-alert bg-amber-bg border-amber-border rounded-item text-ui flex items-center justify-between gap-3 border px-[12px] py-[8px]"
              >
                {t("presetLoadError")}
                <Button variant="ghost" size="sm" onClick={loadPreset}>
                  {t("presetLoadRetry")}
                </Button>
              </span>
            )}
            {exportError && (
              <span
                role="alert"
                className="text-alert bg-amber-bg border-amber-border rounded-item text-ui border px-[12px] py-[8px]"
              >
                {exportError}
              </span>
            )}
            {presetSaved && (
              <span
                role="status"
                className="text-olive bg-olive-tint rounded-item text-ui px-[12px] py-[8px]"
              >
                {t("presetSaved")}
              </span>
            )}

            <section className="flex flex-col gap-2">
              <span className="text-control font-semibold">
                {t("formatsHeading")}
              </span>
              <ExportFormatList
                selected={preset.format}
                onSelect={selectFormat}
              />
            </section>

            <ExportOptions
              pattern={pattern}
              selectedSize={selectedSize}
              onSizeChange={setSelectedSize}
              format={preset.format}
              pageSize={preset.pageSize}
              onPageSizeChange={(pageSize) =>
                updatePreset((p) => ({ ...p, pageSize }))
              }
              rollWidthCm={preset.rollWidthCm}
              onRollWidthChange={(rollWidthCm) =>
                updatePreset((p) => ({ ...p, rollWidthCm }))
              }
            />

            <ExportChecklist
              pattern={pattern}
              conflictActive={conflictActive}
              fabricWidthCm={preset.fabricWidthCm}
              onFabricWidthChange={(fabricWidthCm) =>
                updatePreset((p) => ({ ...p, fabricWidthCm }))
              }
            />

            <span className="text-muted text-meta">
              {t("presetStorageNote")}
            </span>

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={savePreset}>
                {t("savePresetButton")}
              </Button>
              <Button
                onClick={handleDownload}
                disabled={conflictActive}
                title={
                  conflictActive
                    ? t("downloadDisabledConflictTitle")
                    : undefined
                }
              >
                {t("downloadButton")}
              </Button>
            </div>
          </div>
        </ScrollArea>
      )}
    </AppShell>
  );
}
