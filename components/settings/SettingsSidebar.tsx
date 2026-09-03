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
    <div className="border-border bg-surface flex h-full w-[172px] flex-col gap-[2px] border-r px-3 py-[14px]">
      <span className="text-muted tracking-eyebrow text-tick px-[11px] pb-2 font-semibold uppercase">
        {t("sectionEyebrow")}
      </span>
      {SETTINGS_SECTIONS.map((section) => (
        <Button
          key={section}
          variant={section === active ? "soft" : "ghost"}
          size="chrome"
          onClick={() => router.replace(`/settings?section=${section}`)}
          aria-current={section === active ? "page" : undefined}
          className="justify-start"
        >
          {t(LABEL_KEY[section])}
        </Button>
      ))}
    </div>
  );
}
