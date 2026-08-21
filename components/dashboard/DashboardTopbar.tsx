"use client";

import { useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import type { Credits } from "@/lib/types";
import { initialsFromEmail } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Wordmark } from "@/components/shared/Wordmark";

export function DashboardTopbar({
  userEmail,
  credits,
}: {
  userEmail: string;
  credits: Credits | null;
}) {
  const t = useTranslations("DashboardTopbar");
  const router = useRouter();

  const sections = [
    { section: "usage", label: t("usageMenuItem") },
    { section: "plan", label: t("planMenuItem") },
    { section: "profile", label: t("preferencesMenuItem") },
  ];

  return (
    <div className="bg-surface border-border flex items-center gap-4 border-b px-[18px] py-3">
      <Wordmark />
      <div className="flex-1" />
      {credits && (
        <Badge variant="notice">
          {/* The diamond is the design language's credit mark, not copy — it stays
              out of the catalog and out of the accessible name. */}
          <span aria-hidden="true">◆</span>
          {t("creditsPill", { balance: credits.balance })}
        </Badge>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Explicit label: aria-hidden on the glyph alone did not keep it out of
              the computed name, so the trigger (and the menu it labels) states it. */}
          <Button
            variant="outline"
            size="chrome"
            aria-label={t("accountMenuLabel")}
          >
            <span aria-hidden="true">◍</span>
            {t("accountMenuLabel")}
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[190px]">
          <DropdownMenuLabel className="text-muted text-meta truncate font-normal">
            {userEmail}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {sections.map(({ section, label }) => (
              <DropdownMenuItem
                key={section}
                onSelect={() => router.push(`/settings?section=${section}`)}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })}>
            {t("signOutMenuItem")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Avatar
        title={userEmail}
        className="border-olive-border size-[30px] border"
      >
        <AvatarFallback className="bg-olive-tint text-olive text-ui font-semibold">
          {initialsFromEmail(userEmail)}
        </AvatarFallback>
      </Avatar>
    </div>
  );
}
