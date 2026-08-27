import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { loadPattern } from "@/lib/db/pattern";
import { loadWallet } from "@/lib/db/wallet";
import { buildCredits } from "@/lib/api/compose";
import { ExportShell } from "@/components/export/ExportShell";

// No session/pattern -- return {} rather than redirecting, matching
// app/pattern/[id]/page.tsx: the page component below owns the real
// redirect, and a private pattern name must never appear in a tab title for
// a request that can't prove ownership of it.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await auth();
  if (!session?.user?.id) return {};
  const { id } = await params;
  const loaded = await loadPattern(id, session.user.id);
  if (!loaded) return {};
  const t = await getTranslations("Export");
  return { title: `${loaded.state.pattern.name} · ${t("title")}` };
}

export default async function PatternExportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");

  const { id } = await params;
  const [loaded, wallet] = await Promise.all([
    loadPattern(id, session.user.id),
    loadWallet(session.user.id),
  ]);
  // Same reason as the editor and every other pattern-scoped screen: a
  // deleted-or-not-owned pattern id sends the visitor to the dashboard with
  // a reason, rather than a bare redirect("/") or a 404 that leaks whether
  // the id belongs to someone else.
  if (!loaded) redirect("/?missing=pattern");
  // #62: the session cookie outlives account deletion (up to the JWT's
  // 30-day default) on any device that isn't the one that deleted it -- this
  // page would otherwise render for an account that no longer exists.
  if (!wallet) redirect("/login");

  return (
    <ExportShell
      pattern={{
        ...loaded.state.pattern,
        updatedAt: loaded.updatedAt.toISOString(),
      }}
      conflictActive={loaded.state.conflict !== null}
      credits={buildCredits(wallet, new Date())}
      userEmail={session.user.email}
    />
  );
}
