import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { getUserById } from "@/lib/db/users";
import { loadWallet } from "@/lib/db/wallet";
import { getLedgerHistory, getUsageThisCycle } from "@/lib/db/account";
import {
  countPatternsForUser,
  countPatternsCreatedSince,
} from "@/lib/db/pattern";
import { buildCredits } from "@/lib/api/compose";
import { SettingsShell } from "@/components/settings/SettingsShell";
import {
  SETTINGS_SECTIONS,
  type SettingsSection,
} from "@/lib/settings/sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("SettingsShell");
  return { title: t("title") };
}

function parseSection(value: string | undefined): SettingsSection {
  return SETTINGS_SECTIONS.includes(value as SettingsSection)
    ? (value as SettingsSection)
    : "profile";
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");

  const [user, wallet, ledger, patternCount, params] = await Promise.all([
    getUserById(session.user.id),
    loadWallet(session.user.id),
    getLedgerHistory(session.user.id, 30),
    countPatternsForUser(session.user.id),
    searchParams,
  ]);
  // #62: the session cookie outlives account deletion (up to the JWT's
  // 30-day default) on any device that isn't the one that deleted it --
  // without this, the page rendered a real settings shell, with a
  // fabricated free wallet, for an account that no longer exists.
  if (!user || !wallet) redirect("/login");

  // Cycle start for the "Usados neste ciclo"/"criados esta semana" stat
  // cards -- derived from the wallet's own renewsAt/planInterval (annual
  // subscriptions renew every 365 days, everything else every 30), not
  // guessed from the capped 30-row ledger, which could under-report a very
  // active account's usage if it holds more than 30 transactions this cycle.
  const cycleLengthDays = wallet.planInterval === "year" ? 365 : 30;
  const cycleStart = wallet.renewsAt
    ? new Date(wallet.renewsAt.getTime() - cycleLengthDays * 86_400_000)
    : new Date(0);
  const weekAgo = new Date(new Date().getTime() - 7 * 86_400_000);
  const [usageThisCycle, patternsCreatedThisWeek] = await Promise.all([
    getUsageThisCycle(session.user.id, cycleStart),
    countPatternsCreatedSince(session.user.id, weekAgo),
  ]);

  return (
    <SettingsShell
      userEmail={session.user.email}
      initialName={user?.name ?? ""}
      hasPassword={user.passwordHash !== null}
      credits={buildCredits(wallet, new Date())}
      ledger={ledger}
      activeSection={parseSection(params.section)}
      memberSince={user.createdAt.toISOString()}
      patternCount={patternCount}
      usageThisCycle={usageThisCycle}
      patternsCreatedThisWeek={patternsCreatedThisWeek}
    />
  );
}
