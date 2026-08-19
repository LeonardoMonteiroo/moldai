"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { GradeLibrary } from "./GradeLibrary";
import { GradeTable } from "./GradeTable";
import { useGradesStore } from "@/lib/gradesStore";
import type { Credits } from "@/lib/types";

export function GradesShell({
  userEmail,
  credits,
}: {
  userEmail: string;
  credits: Credits;
}) {
  const t = useTranslations("Grades");
  const init = useGradesStore((s) => s.init);
  const ready = useGradesStore((s) => s.ready);
  const error = useGradesStore((s) => s.error);
  const draft = useGradesStore((s) => s.draft);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        credits={credits}
        userEmail={userEmail}
      />
      {!ready && (
        <div className="text-muted flex flex-1 items-center justify-center text-[13px]">
          {t("loading")}
        </div>
      )}
      {ready && error && (
        <div className="text-muted flex flex-1 items-center justify-center text-[13px]">
          {t("loadError")}
        </div>
      )}
      {ready && !error && (
        <div className="flex flex-1 gap-4 overflow-y-auto p-[22px]">
          <GradeLibrary />
          {draft && <GradeTable />}
        </div>
      )}
    </div>
  );
}
