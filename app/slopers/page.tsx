import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadWallet } from "@/lib/db/wallet";
import { buildCredits } from "@/lib/api/compose";
import { SlopersShell } from "@/components/slopers/SlopersShell";

export default async function SlopersPage() {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");

  const wallet = await loadWallet(session.user.id);

  return (
    <SlopersShell
      userEmail={session.user.email}
      credits={buildCredits(wallet, new Date())}
    />
  );
}
