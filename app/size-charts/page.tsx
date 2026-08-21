import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadWallet } from "@/lib/db/wallet";
import { buildCredits } from "@/lib/api/compose";
import { SizeChartsShell } from "@/components/size-charts/SizeChartsShell";

export default async function SizeChartsPage() {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");

  const wallet = await loadWallet(session.user.id);

  return (
    <SizeChartsShell
      userEmail={session.user.email}
      credits={buildCredits(wallet, new Date())}
    />
  );
}
