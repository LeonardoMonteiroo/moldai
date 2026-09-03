"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/shared/AppShell";
import { ActionErrorNotice } from "@/components/shared/ActionErrorNotice";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { SloperGrid } from "./SloperGrid";
import { Skeleton } from "@/components/ui/skeleton";
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

  // A card's "Usar base" (drafted) lands here, so a failure is recorded on
  // THIS screen's store. Bases.dc.html's sidebar carries no "＋ Nova base" of
  // its own -- a base is only ever created from the editor's "Salvar como
  // base" (this screen's own empty state says so), so unlike Dashboard there
  // is no blank-pattern action to wire up here, and this wrapper only ever
  // takes a real sloper id.
  const openNewPattern = async (sloperId: string) => {
    const id = await createPattern(sloperId);
    if (id) router.push(`/pattern/${id}`);
  };

  return (
    <AppShell
      title={t("title")}
      backHref="/"
      credits={credits}
      userEmail={userEmail}
      sidebar={<Sidebar active="slopers" />}
    >
      {actionError && <ActionErrorNotice onDismiss={clearActionError} />}
      {!ready && (
        <div role="status" className="flex flex-1 flex-col gap-4 p-[22px]">
          <span className="sr-only">{t("loading")}</span>
          <Skeleton className="h-8 w-[160px]" />
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1" />
            <Skeleton className="h-[34px] w-[200px]" />
            <Skeleton className="h-[34px] w-[150px]" />
          </div>
          <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="rounded-card h-[168px] w-full" />
            ))}
          </div>
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
