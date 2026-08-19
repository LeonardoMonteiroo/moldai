"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { SETTINGS_SECTIONS } from "@/lib/settings/sections";
import type { SettingsSection } from "@/lib/settings/sections";

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
        <button
          key={section}
          onClick={() => router.replace(`/settings?section=${section}`)}
          className={
            section === active
              ? "bg-olive-tint text-olive rounded-item px-[10px] py-[7px] text-left text-[12.5px] font-medium"
              : "hover:bg-surface-alt rounded-item px-[10px] py-[7px] text-left text-[12.5px]"
          }
        >
          {t(LABEL_KEY[section])}
        </button>
      ))}
    </div>
  );
}
