"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import type { Credits } from "@/lib/types";
import { initialsFromEmail } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function PageHeader({
  title,
  subtitle,
  credits,
  userEmail,
}: {
  title: string;
  subtitle?: string;
  credits: Credits;
  userEmail: string;
}) {
  const t = useTranslations("PageHeader");
  const router = useRouter();
  const pct = Math.round((credits.balance / credits.total) * 100);

  return (
    <div className="bg-surface border-border relative flex items-center gap-4 border-b px-[18px] py-3">
      <span className="font-display text-title font-bold tracking-[-0.4px]">
        Mold<span className="text-olive">AI</span>
      </span>
      <Separator orientation="vertical" className="h-5" />
      <Button
        variant="outline"
        size="chrome"
        onClick={() => router.push("/")}
        title={t("backTitle")}
        className="text-muted-2"
      >
        {t("backButton")}
      </Button>
      <div className="flex flex-col gap-px">
        <span className="text-[13px] font-semibold">{title}</span>
        {subtitle && <span className="text-muted text-[11px]">{subtitle}</span>}
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
      <Button
        variant="outline"
        size="chrome"
        onClick={() => router.push("/settings?section=usage")}
      >
        {t("buyCreditsButton")}
      </Button>
      <div className="flex items-center gap-2">
        <Avatar
          title={userEmail}
          className="border-olive-border size-[30px] border"
        >
          <AvatarFallback className="bg-olive-tint text-olive text-ui font-semibold">
            {initialsFromEmail(userEmail)}
          </AvatarFallback>
        </Avatar>
        <Button
          variant="outline"
          size="chrome"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-muted-2"
        >
          {t("signOutButton")}
        </Button>
      </div>
    </div>
  );
}
