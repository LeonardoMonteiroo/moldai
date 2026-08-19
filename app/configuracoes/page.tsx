import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/lib/db/users";
import { loadWallet } from "@/lib/db/wallet";
import { buildCredits } from "@/lib/api/compose";
import { SettingsShell } from "@/components/settings/SettingsShell";

export default async function ConfiguracoesPage() {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");

  const [user, wallet] = await Promise.all([
    getUserById(session.user.id),
    loadWallet(session.user.id),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SettingsShell
        userEmail={session.user.email}
        initialName={user?.name ?? ""}
        credits={buildCredits(wallet, new Date())}
      />
    </div>
  );
}
