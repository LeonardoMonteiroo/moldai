import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { getUserById } from "@/lib/db/users";
import { loadWallet } from "@/lib/db/wallet";
import { getLedgerHistory } from "@/lib/db/account";
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

  const [user, wallet, ledger, params] = await Promise.all([
    getUserById(session.user.id),
    loadWallet(session.user.id),
    getLedgerHistory(session.user.id, 30),
    searchParams,
  ]);
  // #62: the session cookie outlives account deletion (up to the JWT's
  // 30-day default) on any device that isn't the one that deleted it --
  // without this, the page rendered a real settings shell, with a
  // fabricated free wallet, for an account that no longer exists.
  if (!user || !wallet) redirect("/login");

  return (
    <SettingsShell
      userEmail={session.user.email}
      initialName={user?.name ?? ""}
      credits={buildCredits(wallet, new Date())}
      ledger={ledger}
      activeSection={parseSection(params.section)}
    />
  );
}
