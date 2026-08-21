"use client";

import { useTranslations } from "next-intl";
import type { Credits, LedgerHistoryEntry } from "@/lib/types";
import { AppShell } from "@/components/shared/AppShell";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    <AppShell
      title={t("title")}
      backHref="/"
      credits={credits}
      userEmail={userEmail}
      sidebar={<SettingsSidebar active={activeSection} />}
    >
      <ScrollArea className="bg-paper min-h-0 flex-1">
        <div className="flex flex-col gap-4 px-[24px] py-[22px]">
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
      </ScrollArea>
    </AppShell>
  );
}
