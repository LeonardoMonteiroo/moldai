"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/shared/AppShell";
import { ActionErrorNotice } from "@/components/shared/ActionErrorNotice";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { SloperGrid } from "./SloperGrid";
import { useSlopersStore } from "@/lib/slopersStore";
import type { Credits } from "@/lib/types";

export function SlopersShell({
  userEmail,
  credits,
}: {
  userEmail: string;
  credits: Credits;
}) {
  const t = useTranslations("Slopers");
  const router = useRouter();
  const init = useSlopersStore((s) => s.init);
  const ready = useSlopersStore((s) => s.ready);
  const error = useSlopersStore((s) => s.error);
  const actionError = useSlopersStore((s) => s.actionError);
  const clearActionError = useSlopersStore((s) => s.clearActionError);
  const createPattern = useSlopersStore((s) => s.createPattern);

  useEffect(() => {
    init();
  }, [init]);

  // Both the sidebar's "＋ Novo molde" (blank) and a card's "Usar base"
  // (drafted) land here, so a failure is recorded on THIS screen's store.
  const openNewPattern = async (sloperId?: string) => {
    const id = await createPattern(sloperId);
    if (id) router.push(`/pattern/${id}`);
  };

  return (
    <AppShell
      title={t("title")}
      subtitle={t("subtitle")}
      backHref="/"
      credits={credits}
      userEmail={userEmail}
      sidebar={
        <Sidebar
          active="slopers"
          onNewPattern={() => openNewPattern()}
          disabled={error}
        />
      }
    >
      {actionError && <ActionErrorNotice onDismiss={clearActionError} />}
      {!ready && (
        <div
          role="status"
          className="text-muted text-control flex flex-1 items-center justify-center"
        >
          {t("loading")}
        </div>
      )}
      {ready && error && (
        <div
          role="alert"
          className="text-alert text-control flex flex-1 items-center justify-center"
        >
          {t("loadError")}
        </div>
      )}
      {ready && !error && <SloperGrid onUse={(id) => openNewPattern(id)} />}
    </AppShell>
  );
}
