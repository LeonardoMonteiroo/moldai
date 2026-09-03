"use client";

import { useTranslations } from "next-intl";
import type { Credits, LedgerHistoryEntry, UsageThisCycle } from "@/lib/types";
import { AppShell } from "@/components/shared/AppShell";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SettingsSidebar } from "./SettingsSidebar";
import type { SettingsSection } from "@/lib/settings/sections";
import { ProfileSection } from "./ProfileSection";
import { AccountSummaryCard } from "./AccountSummaryCard";
import { PasswordSection } from "./PasswordSection";
import { DangerZoneSection } from "./DangerZoneSection";
import { UsageSection } from "./UsageSection";
import { PlanSection } from "./PlanSection";

export function SettingsShell({
  userEmail,
  initialName,
  hasPassword,
  credits,
  ledger,
  activeSection,
  memberSince,
  patternCount,
  usageThisCycle,
  patternsCreatedThisWeek,
}: {
  userEmail: string;
  initialName: string;
  hasPassword: boolean;
  credits: Credits;
  ledger: LedgerHistoryEntry[];
  activeSection: SettingsSection;
  memberSince: string;
  patternCount: number;
  usageThisCycle: UsageThisCycle;
  patternsCreatedThisWeek: number;
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
        <div className="flex flex-col gap-4 px-[14px] py-[22px] sm:px-[24px]">
          {activeSection === "profile" && (
            <div className="grid grid-cols-1 items-start gap-[14px] lg:grid-cols-[minmax(0,2.1fr)_minmax(210px,1fr)]">
              <ProfileSection initialName={initialName} email={userEmail} />
              <AccountSummaryCard
                name={initialName}
                email={userEmail}
                credits={credits}
                memberSince={memberSince}
                patternCount={patternCount}
              />
            </div>
          )}
          {activeSection === "password" && (
            <PasswordSection hasPassword={hasPassword} />
          )}
          {activeSection === "danger" && (
            <DangerZoneSection
              userEmail={userEmail}
              hasPassword={hasPassword}
            />
          )}
          {activeSection === "usage" && (
            <UsageSection
              credits={credits}
              initialLedger={ledger}
              patternCount={patternCount}
              usageThisCycle={usageThisCycle}
              patternsCreatedThisWeek={patternsCreatedThisWeek}
            />
          )}
          {activeSection === "plan" && <PlanSection credits={credits} />}
        </div>
      </ScrollArea>
    </AppShell>
  );
}
