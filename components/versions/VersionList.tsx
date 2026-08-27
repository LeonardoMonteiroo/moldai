"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PatternVersionEntry } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

// Reason codes are machine-readable (see lib/db/patternVersion.ts) -- labels
// resolve by catalog lookup keyed on the EN enum value, never a hand-written
// Record<Reason, string> map.
function reasonLabel(
  t: ReturnType<typeof useTranslations<"VersionList">>,
  reason: PatternVersionEntry["reason"],
): string {
  return t(`reason.${reason}`);
}

export function VersionList({
  versions,
  activeVersion,
  restoring,
  onRestore,
}: {
  versions: PatternVersionEntry[];
  activeVersion: number;
  restoring: boolean;
  onRestore: (versionId: string) => void;
}) {
  const t = useTranslations("VersionList");
  const tFormat = useTranslations("Format");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const confirming = versions.find((v) => v.id === confirmingId) ?? null;

  const total = versions.reduce((sum, v) => sum + v.cost, 0);

  return (
    <div className="border-border rounded-card flex w-[300px] shrink-0 flex-col border bg-white">
      <ul className="flex flex-1 flex-col overflow-y-auto">
        {versions.map((v) => {
          const isActive = v.version === activeVersion;
          return (
            <li
              key={v.id}
              className={
                "border-border flex items-center justify-between gap-2 border-b px-[14px] py-[10px] last:border-b-0" +
                (isActive ? " bg-olive-tint" : "")
              }
            >
              <div className="flex min-w-0 flex-col gap-px">
                <span className="text-control font-semibold">
                  {t("versionLabel", { version: v.version })} ·{" "}
                  {relativeTime(tFormat, v.createdAt)}
                </span>
                <span className="text-muted text-meta truncate">
                  {reasonLabel(t, v.reason)} ·{" "}
                  {v.cost === 0
                    ? t("costFree")
                    : t("costCredits", { cost: v.cost })}
                </span>
              </div>
              {!isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={restoring}
                  onClick={() => setConfirmingId(v.id)}
                >
                  {t("restoreButton", { version: v.version })}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="border-border text-muted text-meta border-t px-[14px] py-[10px]">
        {t("totalSpent", { total })}
      </div>

      {confirming && (
        <ConfirmModal
          title={t("restoreModalTitle", { version: confirming.version })}
          description={t("restoreModalDescription")}
          confirmLabel={t("restoreModalConfirmButton")}
          cancelLabel={t("restoreModalCancelButton")}
          onConfirm={() => {
            setConfirmingId(null);
            onRestore(confirming.id);
          }}
          onCancel={() => setConfirmingId(null)}
        />
      )}
    </div>
  );
}
