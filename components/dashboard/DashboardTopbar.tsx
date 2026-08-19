"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import type { Credits } from "@/lib/types";
import { initialsFromEmail } from "@/lib/format";

export function DashboardTopbar({
  userEmail,
  credits,
}: {
  userEmail: string;
  credits: Credits | null;
}) {
  const t = useTranslations("DashboardTopbar");
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="bg-surface border-border flex items-center gap-4 border-b px-[18px] py-3">
      <span className="font-display text-[19px] font-bold tracking-[-0.4px]">
        Mold<span className="text-olive">AI</span>
      </span>
      <div className="flex-1" />
      {credits && (
        <span className="bg-amber-bg border-amber-border text-amber-text rounded-pill border px-[10px] py-[5px] text-[12px] font-semibold">
          {t("creditsPill", { balance: credits.balance })}
        </span>
      )}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="border-border rounded-btn bg-surface hover:bg-surface-alt border px-[11px] py-[6px] text-[12px] font-medium transition-colors"
        >
          {t("accountMenuLabel")}
        </button>
        {menuOpen && (
          <div className="border-border rounded-card shadow-modal bg-surface absolute top-[38px] right-0 z-10 flex w-[180px] flex-col border py-1">
            <span className="text-muted border-border truncate border-b px-3 py-[8px] text-[11.5px]">
              {userEmail}
            </span>
            <button
              onClick={() => {
                setMenuOpen(false);
                router.push("/settings?section=usage");
              }}
              className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]"
            >
              {t("usageMenuItem")}
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                router.push("/settings?section=plan");
              }}
              className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]"
            >
              {t("planMenuItem")}
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                router.push("/settings?section=profile");
              }}
              className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]"
            >
              {t("preferencesMenuItem")}
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="hover:bg-surface-alt px-3 py-[8px] text-left text-[12px]"
            >
              {t("signOutMenuItem")}
            </button>
          </div>
        )}
      </div>
      <div
        title={userEmail}
        className="bg-olive-tint border-olive-border text-olive flex h-[30px] w-[30px] items-center justify-center rounded-full border text-[12px] font-semibold"
      >
        {initialsFromEmail(userEmail)}
      </div>
    </div>
  );
}
