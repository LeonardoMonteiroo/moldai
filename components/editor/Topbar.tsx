"use client";

import { useTranslations } from "next-intl";
import { Credits, Pattern } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";

export function Topbar({
  pattern,
  credits,
  userEmail,
}: {
  pattern: Pattern;
  credits: Credits;
  userEmail: string;
}) {
  const t = useTranslations("Topbar");

  return (
    <PageHeader
      title={pattern.name}
      subtitle={t("savedVersion", {
        savedAgo: pattern.savedAgo,
        version: pattern.version,
      })}
      backHref="/"
      credits={credits}
      userEmail={userEmail}
    />
  );
}
