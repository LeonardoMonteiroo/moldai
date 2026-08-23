import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserById } from "@/lib/db/users";
import { loadPattern } from "@/lib/db/pattern";
import { EditorShell } from "@/components/editor/EditorShell";

export default async function PatternPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");
  // #62: the session cookie outlives account deletion (up to the JWT's
  // 30-day default) on any device that isn't the one that deleted it -- the
  // editor would otherwise render for an account that no longer exists.
  const user = await getUserById(session.user.id);
  if (!user) redirect("/login");
  const { id } = await params;

  const loaded = await loadPattern(id, session.user.id);
  // Carries the reason, so the dashboard can say why you ended up there —
  // this used to be a bare redirect("/") with nothing to explain it. The flag
  // deliberately does not distinguish "deleted" from "not yours": that would
  // turn the dashboard into an existence oracle for other accounts' ids.
  if (!loaded) redirect("/?missing=pattern");

  return <EditorShell userEmail={session.user.email} patternId={id} />;
}
