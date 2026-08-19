import { redirect } from "next/navigation";
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsShell
        userEmail={session.user.email}
        initialName={user?.name ?? ""}
        credits={buildCredits(wallet, new Date())}
        ledger={ledger}
        activeSection={parseSection(params.section)}
      />
    </div>
  );
}
