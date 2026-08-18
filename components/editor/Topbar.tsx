"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Credits, Pattern } from "@/lib/types";
import { signOut } from "next-auth/react";
import { initialsFromEmail } from "@/lib/format";

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
  const router = useRouter();
  const pct = Math.round((credits.balance / credits.total) * 100);

  return (
    <div className="bg-surface border-border relative flex items-center gap-4 border-b px-[18px] py-3">
      <span className="font-display text-[19px] font-bold tracking-[-0.4px]">
        Mold<span className="text-olive">AI</span>
      </span>
      <div className="bg-border h-5 w-px" />
      <button
        onClick={() => router.push("/")}
        title={t("backTitle")}
        className="border-border rounded-btn bg-surface text-muted-2 hover:bg-surface-alt border px-[11px] py-[6px] text-[12px] font-medium transition-colors"
      >
        {t("backButton")}
      </button>
      <div className="flex flex-col gap-px">
        <span className="text-[13px] font-semibold">{pattern.name}</span>
        <span className="text-muted text-[11px]">
          {t("savedVersion", {
            savedAgo: pattern.savedAgo,
            version: pattern.version,
          })}
        </span>
      </div>
      <div className="flex-1" />
      <div className="flex w-[168px] flex-col gap-[5px]">
        <div className="text-muted flex justify-between text-[11px]">
          <span>
            {t("creditsLabel", {
              planLabel: credits.planLabel,
              balance: credits.balance,
            })}
          </span>
          <span>{t("outOfTotal", { total: credits.total })}</span>
        </div>
        <div className="bg-track h-[5px] overflow-hidden rounded-full">
          <div className="bg-olive h-full" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button className="border-border rounded-btn bg-surface hover:bg-surface-alt border px-[13px] py-[7px] text-[12px] font-medium transition-colors">
        {t("buyCreditsButton")}
      </button>
      <div className="flex items-center gap-2">
        <div
          title={userEmail}
          className="bg-olive-tint border-olive-border text-olive flex h-[30px] w-[30px] items-center justify-center rounded-full border text-[12px] font-semibold"
        >
          {initialsFromEmail(userEmail)}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="border-border rounded-btn bg-surface text-muted-2 hover:bg-surface-alt border px-[11px] py-[6px] text-[12px] font-medium transition-colors"
        >
          {t("signOutButton")}
        </button>
      </div>
    </div>
  );
}
