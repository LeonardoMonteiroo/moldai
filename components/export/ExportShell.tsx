"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { FileDownIcon } from "lucide-react";
import type { Credits, PatternRecord } from "@/lib/types";
import { exportPattern, type ExportFormat } from "@/lib/export";
import {
  DEFAULT_EXPORT_PRESET,
  validateExportPreset,
  type ExportPreset,
} from "@/lib/export/preset";
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

// A per-browser stand-in for the account-level preset the design calls for
// (screen 5h's "Salvar preset"). This unit does not own prisma/schema.prisma
// and no existing JSON blob on User is free for a generic preset without one
// — four other in-flight units are adding migrations of their own — so
// "Salvar preset" persists here instead of on the account, and the screen
// says so (presetStorageNote). Promoting this to a real
// GET/PUT /api/account/export-preset route once a column exists is a
// follow-up, not a redesign: validateExportPreset already treats this value
// as untrusted, the same way it would treat a wire body.
const PRESET_STORAGE_KEY = "moldai:export-preset";

// #17/react-hooks/set-state-in-effect: reading localStorage on mount and
// writing it straight into useState via an effect is the classic
// hydration-flicker pattern (the same one next-themes uses) -- but this
// repo's lint config flags that exact shape. useSyncExternalStore is React's
// own sanctioned way to read a client-only external value without a
// server/client mismatch: getServerSnapshot below matches the server's
// DEFAULT_EXPORT_PRESET render, and React itself (not a hand-written effect)
// re-renders once, safely, if the client's real snapshot differs. getSnapshot
// caches by the raw string so it returns a stable reference when nothing on
// disk changed -- required, or React logs "the result of getSnapshot should
// be cached" and can loop.
let cachedRaw: string | null | undefined;
let cachedPreset: ExportPreset = DEFAULT_EXPORT_PRESET;

function readStoredPreset(): ExportPreset {
  const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
  if (raw === cachedRaw) return cachedPreset;
  cachedRaw = raw;
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  cachedPreset = validateExportPreset(parsed);
  return cachedPreset;
}

function getServerPreset(): ExportPreset {
  return DEFAULT_EXPORT_PRESET;
}

// The stored preset never changes except through this component's own
// explicit "Salvar preset" click, which this tab already knows about via its
// own state -- so there is nothing else to subscribe to.
function subscribeNever() {
  return () => {};
}

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

  // storedPreset is React-owned (useSyncExternalStore): DEFAULT on the
  // server, the real localStorage value on the client, reconciled by React
  // itself rather than a hand-written effect. override holds this tab's
  // in-progress edits once the visitor actually touches a control -- until
  // then, preset just mirrors whatever was last saved.
  const storedPreset = useSyncExternalStore(
    subscribeNever,
    readStoredPreset,
    getServerPreset,
  );
  const [override, setOverride] = useState<ExportPreset | null>(null);
  const preset = override ?? storedPreset;
  const [selectedSize, setSelectedSize] = useState(pattern.baseSize);
  const [exportError, setExportError] = useState<string | null>(null);
  const [presetSaved, setPresetSaved] = useState(false);

  function updatePreset(updater: (p: ExportPreset) => ExportPreset) {
    setOverride(updater(preset));
  }

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

  function savePreset() {
    try {
      window.localStorage.setItem(
        PRESET_STORAGE_KEY,
        JSON.stringify(validateExportPreset(preset)),
      );
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
