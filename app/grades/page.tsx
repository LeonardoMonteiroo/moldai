import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadWallet } from "@/lib/db/wallet";
import { buildCredits } from "@/lib/api/compose";
import { GradesShell } from "@/components/grades/GradesShell";

export default async function GradesPage() {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");

  const wallet = await loadWallet(session.user.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GradesShell
        userEmail={session.user.email}
        credits={buildCredits(wallet, new Date())}
      />
    </div>
  );
}
