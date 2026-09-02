"use client";

import { useTranslations } from "next-intl";
import type { Credits } from "@/lib/types";
import { initialsFromEmail, formatMonthYear } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";

// Configuracoes.dc.html's right-rail card (Perfil section only) -- avatar +
// name/email, plan + credits progress + renewal, member-since + pattern
// count. Every field is either already fetched for this page (credits) or a
// cheap addition (User.createdAt was already a column, no migration;
// countPatternsForUser is a plain COUNT, not listPatternsForUser's capped,
// blob-parsing read). Deliberately does NOT add the design's "Ateliê"/
// "Telefone" profile fields -- those need new User columns and a real
// migration, out of scope for this pass (see .specs/features/
// redesign-settings/spec.md).
export function AccountSummaryCard({
  name,
  email,
  credits,
  memberSince,
  patternCount,
}: {
  name: string;
  email: string;
  credits: Credits;
  memberSince: string;
  patternCount: number;
}) {
  const t = useTranslations("AccountSummaryCard");
  const tPlan = useTranslations("PlanSection");
  const tFormat = useTranslations("Format");
  // #37: a top-up can push balance past total, the same clamp PageHeader's
  // own credits bar uses.
  const pct = Math.min(
    100,
    Math.round((credits.balance / credits.total) * 100),
  );
  const displayName = name.trim();

  return (
    <aside className="border-border rounded-card bg-surface flex flex-col gap-3 border p-4">
      <div className="flex items-center gap-[10px]">
        <Avatar
          title={email}
          className="border-olive-border size-[38px] border"
        >
          <AvatarFallback className="bg-olive-tint text-olive text-control font-semibold">
            {initialsFromEmail(email)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-px">
          <span className="text-ui truncate font-semibold">
            {displayName || email}
          </span>
          {displayName && (
            <span className="text-muted text-meta truncate">{email}</span>
          )}
        </div>
      </div>
      <div className="border-line flex flex-col gap-[5px] border-t pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-ui font-medium">
            {tPlan(`plans.${credits.plan}.name`)}
          </span>
          <span className="text-muted text-meta">
            {credits.balance}/{credits.total}
          </span>
        </div>
        <Progress value={pct} size="thin" />
        <span className="text-muted text-meta">
          {t("renewsNote", { days: credits.renewsInDays })}
        </span>
      </div>
      <div className="border-line flex flex-col gap-[6px] border-t pt-3">
        <span className="text-muted text-meta">
          {t("memberSince", {
            date: formatMonthYear(tFormat, memberSince),
            count: patternCount,
          })}
        </span>
      </div>
    </aside>
  );
}
