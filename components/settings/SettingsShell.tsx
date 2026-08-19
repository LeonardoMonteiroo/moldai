"use client";

import { useTranslations } from "next-intl";
import type { Credits, LedgerHistoryEntry } from "@/lib/types";
import { PageHeader } from "@/components/shared/PageHeader";
import { SettingsSidebar } from "./SettingsSidebar";
import type { SettingsSection } from "@/lib/settings/sections";
import { ProfileSection } from "./ProfileSection";
import { PasswordSection } from "./PasswordSection";
import { DangerZoneSection } from "./DangerZoneSection";
import { UsageSection } from "./UsageSection";
import { PlanSection } from "./PlanSection";

export function SettingsShell({
  userEmail,
  initialName,
  credits,
  ledger,
  activeSection,
}: {
  userEmail: string;
  initialName: string;
  credits: Credits;
  ledger: LedgerHistoryEntry[];
  activeSection: SettingsSection;
}) {
  const t = useTranslations("SettingsShell");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} credits={credits} userEmail={userEmail} />
      <div className="flex min-h-0 flex-1">
        <SettingsSidebar active={activeSection} />
        <div className="bg-paper flex flex-1 flex-col gap-4 overflow-y-auto px-[24px] py-[22px]">
          {activeSection === "profile" && (
            <ProfileSection initialName={initialName} email={userEmail} />
          )}
          {activeSection === "password" && <PasswordSection />}
          {activeSection === "danger" && (
            <DangerZoneSection userEmail={userEmail} />
          )}
          {activeSection === "usage" && (
            <UsageSection credits={credits} initialLedger={ledger} />
          )}
          {activeSection === "plan" && <PlanSection credits={credits} />}
        </div>
      </div>
    </div>
  );
}
