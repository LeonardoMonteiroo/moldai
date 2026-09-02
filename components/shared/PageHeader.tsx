"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { signOut } from "next-auth/react";
import type { Credits } from "@/lib/types";
import { initialsFromEmail } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Wordmark } from "@/components/shared/Wordmark";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The one header every full-page screen shows. Rendered only by AppShell —
 * screens pass data, never a header element, so no screen can drift.
 *
 * `credits` is nullable for the dashboard, whose balance arrives from
 * /api/account/summary after first paint; the bar and "Comprar créditos" are
 * simply absent until it lands, rather than the whole header flickering in.
 *
 * `backHref` is opt-in: the dashboard IS "/" and must not offer a back button
 * pointing at itself.
 *
 * `title` is opt-in for the same reason. A screen whose nav column already
 * names the current section would otherwise say it twice — the dashboard's
 * sidebar marks "Meus moldes" active, so the header repeating it was noise.
 *
 * `actions` is opt-in screen-specific header chrome (today: the editor's
 * "Histórico"/"Salvar como base" buttons, per the redesign reference) —
 * rendered after the credits block, behind its own divider, the same
 * dangling-separator-avoidance the back-button divider already follows. No
 * other screen passes it.
 */
export function PageHeader({
  title,
  subtitle,
  backHref,
  credits,
  userEmail,
  actions,
}: {
  title?: string;
  subtitle?: string;
  backHref?: string;
  credits: Credits | null;
  userEmail: string;
  actions?: ReactNode;
}) {
  const t = useTranslations("PageHeader");
  const tPlan = useTranslations("PlanSection");
  const router = useRouter();
  // #37: a top-up can push balance past total (purchased credits carry over
  // independently of the plan allowance), so the bar clamps at 100% rather
  // than overflowing its track.
  const pct = credits
    ? Math.min(100, Math.round((credits.balance / credits.total) * 100))
    : 0;

  const sections = [
    { section: "usage", label: t("usageMenuItem") },
    { section: "plan", label: t("planMenuItem") },
    { section: "profile", label: t("preferencesMenuItem") },
  ];

  return (
    <header className="bg-surface border-border relative flex items-center gap-4 border-b px-[18px] py-3">
      <Wordmark />
      {/* The separator divides the wordmark from the screen's own identity —
          the back button and the title. The dashboard has neither (it IS "/",
          and its nav column already names the section), so the rule would
          otherwise dangle against the empty spacer. */}
      {(backHref || title) && (
        <Separator orientation="vertical" className="h-5" />
      )}
      {backHref && (
        <Button
          variant="outline"
          size="chrome"
          onClick={() => router.push(backHref)}
          title={t("backTitle")}
          className="text-muted-2"
        >
          {t("backButton")}
        </Button>
      )}
      {title && (
        // The editor's title is the pattern name, which the user chooses, so
        // it has to be allowed to run out of room without shoving the credits
        // bar and avatar off the header.
        //
        // #48: the dashboard is the one screen that renders no title at all
        // (its sidebar already names the section) -- rather than inventing a
        // visually-hidden duplicate of that same text and risking a second
        // match against Sidebar.myPatternsLabel-pinned test assertions, the
        // dashboard is left with landmarks only and no h1, which the issue
        // explicitly allows.
        <div className="flex min-w-0 flex-col gap-px">
          <h1 className="text-control truncate font-semibold">{title}</h1>
          {subtitle && (
            <span className="text-muted text-meta truncate">{subtitle}</span>
          )}
        </div>
      )}
      <div className="flex-1" />
      {credits && (
        // Planos.dc.html's compact pill: a single-line label + a small inline
        // bar + an inline "comprar"-style link, all inside one rounded-full
        // chip -- not the two-line block-plus-full-width-bar-plus-separate-
        // button this used to render (visibly heavier than the design, and
        // the sole reason PageHeader diverged from it).
        <div className="border-border bg-surface-alt rounded-pill flex h-[30px] items-center gap-2 border py-0 pr-1 pl-[11px]">
          <span className="text-muted-2 text-meta whitespace-nowrap tabular-nums">
            {t("creditsLabel", {
              planLabel: tPlan(`plans.${credits.plan}.name`),
              balance: credits.balance,
            })}
          </span>
          <span className="text-muted text-meta whitespace-nowrap">
            {t("outOfTotal", { total: credits.total })}
          </span>
          <div className="bg-track h-1 w-11 flex-none overflow-hidden rounded-full">
            <div className="bg-olive h-full" style={{ width: `${pct}%` }} />
          </div>
          <Button
            variant="ghost"
            size="chrome"
            className="text-olive hover:text-olive-dark h-6 flex-none rounded-full px-[9px] font-semibold"
            onClick={() => router.push("/settings?section=usage")}
          >
            {t("buyCreditsButton")}
          </Button>
        </div>
      )}
      {actions && (
        <>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-[7px]">{actions}</div>
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Explicit label: aria-hidden on the avatar alone did not keep its
              initials out of the computed name, so the trigger states it. */}
          <Button
            variant="ghost"
            size="chrome"
            aria-label={t("accountMenuLabel")}
            className="gap-1.5 px-1"
          >
            <Avatar
              title={userEmail}
              className="border-olive-border size-[30px] border"
            >
              <AvatarFallback className="bg-olive-tint text-olive text-ui font-semibold">
                {initialsFromEmail(userEmail)}
              </AvatarFallback>
            </Avatar>
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
            {t("signOutButton")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
