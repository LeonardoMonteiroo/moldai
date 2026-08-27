"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/shared/AppShell";
import { ActionErrorNotice } from "@/components/shared/ActionErrorNotice";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listVersions,
  restoreVersion,
  errorCode,
  type PatternVersionEntry,
} from "@/lib/api-client";
import type { Credits } from "@/lib/types";
import { VersionList } from "./VersionList";
import { VersionCompare } from "./VersionCompare";

/**
 * #16: /pattern/[id]/versions -- the version-history screen. Deliberately
 * local component state rather than a new Zustand store: this screen has no
 * state any other component needs, matching how /settings's sections read
 * off a plain useState (see CLAUDE.md's "don't add abstractions beyond
 * what's needed").
 */
export function VersionsShell({
  userEmail,
  credits,
  patternId,
  patternName,
  activeVersion,
}: {
  userEmail: string;
  credits: Credits;
  patternId: string;
  patternName: string;
  activeVersion: number;
}) {
  const t = useTranslations("VersionsShell");
  const router = useRouter();

  const [versions, setVersions] = useState<PatternVersionEntry[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  // patternId comes from a server-rendered page prop and never changes
  // without a full remount (the same one-pattern-per-mount shape
  // EditorShell/init already follow) -- so the fetch only ever needs to run
  // once, with no synchronous setState at the top of the effect body to
  // "reset" state that's already at its initial null/false values.
  useEffect(() => {
    let cancelled = false;
    listVersions(patternId)
      .then((rows) => {
        if (!cancelled) setVersions(rows);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [patternId]);

  // Restoring is a mutation, but never a paid one and it deliberately does
  // NOT stay on this screen to show the result -- the whole point is to go
  // back and look at the restored pattern, the same reason the design's own
  // header action ("Restaurar v3") reads as a way back into the editor.
  const handleRestore = async (versionId: string) => {
    if (restoring) return;
    setRestoring(true);
    setActionError(null);
    try {
      await restoreVersion(patternId, versionId);
      router.push(`/pattern/${patternId}`);
    } catch (err) {
      setActionError(errorCode(err));
      setRestoring(false);
    }
  };

  return (
    <AppShell
      title={t("titleWithName", { name: patternName })}
      backHref={`/pattern/${patternId}`}
      credits={credits}
      userEmail={userEmail}
    >
      {actionError && (
        <ActionErrorNotice onDismiss={() => setActionError(null)} />
      )}
      {versions === null && !loadError && (
        <div
          role="status"
          className="text-muted text-control flex flex-1 items-center justify-center"
        >
          {t("loading")}
        </div>
      )}
      {loadError && (
        <div
          role="alert"
          className="text-alert text-control flex flex-1 items-center justify-center"
        >
          {t("loadError")}
        </div>
      )}
      {versions !== null && !loadError && (
        <ScrollArea fill className="min-h-0 flex-1">
          <div className="flex min-h-full gap-4 p-[22px]">
            <VersionList
              versions={versions}
              activeVersion={activeVersion}
              restoring={restoring}
              onRestore={handleRestore}
            />
            <VersionCompare versions={versions} />
          </div>
        </ScrollArea>
      )}
    </AppShell>
  );
}
