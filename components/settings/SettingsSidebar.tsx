"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SETTINGS_SECTIONS } from "@/lib/settings/sections";
import type { SettingsSection } from "@/lib/settings/sections";
import { Button } from "@/components/ui/button";

const LABEL_KEY: Record<SettingsSection, string> = {
  profile: "profileLabel",
  password: "passwordLabel",
  danger: "dangerZoneLabel",
  usage: "usageLabel",
  plan: "planLabel",
};

export function SettingsSidebar({ active }: { active: SettingsSection }) {
  const t = useTranslations("SettingsSidebar");
  const router = useRouter();

  return (
    <div className="border-border bg-surface flex w-[186px] flex-col gap-1 border-r p-[14px]">
      {SETTINGS_SECTIONS.map((section) => (
        <Button
          key={section}
          variant={section === active ? "soft" : "ghost"}
          size="chrome"
          onClick={() => router.replace(`/settings?section=${section}`)}
          className="justify-start"
        >
          {t(LABEL_KEY[section])}
        </Button>
      ))}
    </div>
  );
}
