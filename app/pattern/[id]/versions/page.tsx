import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { getUserById } from "@/lib/db/users";
import { loadPattern } from "@/lib/db/pattern";
import { loadWallet } from "@/lib/db/wallet";
import { buildCredits } from "@/lib/api/compose";
import { VersionsShell } from "@/components/versions/VersionsShell";

// Mirrors app/pattern/[id]/page.tsx's own generateMetadata: no session/
// pattern -- return {} rather than redirecting (the page component below
// owns the actual redirect), and a private pattern name must never appear in
// a tab title for a request that can't prove ownership of it.
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
  const t = await getTranslations("VersionsShell");
  return { title: t("tabTitle", { name: loaded.state.pattern.name }) };
}

export default async function PatternVersionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");
  // #62: the session cookie outlives account deletion (up to the JWT's
  // 30-day default) -- this page would otherwise render for an account that
  // no longer exists.
  const user = await getUserById(session.user.id);
  if (!user) redirect("/login");
  const { id } = await params;

  const loaded = await loadPattern(id, session.user.id);
  // Same "?missing=pattern" precedent as the editor route -- deliberately
  // one flag rather than distinguishing "deleted" from "not yours", which
  // would turn this into an existence oracle for other accounts' ids.
  if (!loaded) redirect("/?missing=pattern");

  const wallet = await loadWallet(session.user.id);
  if (!wallet) redirect("/login");

  return (
    <VersionsShell
      userEmail={session.user.email}
      credits={buildCredits(wallet, new Date())}
      patternId={id}
      patternName={loaded.state.pattern.name}
      activeVersion={loaded.state.pattern.version}
    />
  );
}
