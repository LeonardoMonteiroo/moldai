"use client";

import { useTranslations } from "next-intl";
import type { Credits } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProfileSection } from "./ProfileSection";
import { PasswordSection } from "./PasswordSection";
import { DangerZoneSection } from "./DangerZoneSection";

export function SettingsShell({
  userEmail,
  initialName,
  credits,
}: {
  userEmail: string;
  initialName: string;
  credits: Credits;
}) {
  const t = useTranslations("SettingsShell");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} credits={credits} userEmail={userEmail} />
      <div className="bg-paper flex flex-1 flex-col gap-4 overflow-y-auto px-[24px] py-[22px]">
        <ProfileSection initialName={initialName} email={userEmail} />
        <PasswordSection />
        <DangerZoneSection userEmail={userEmail} />
      </div>
    </div>
  );
}
