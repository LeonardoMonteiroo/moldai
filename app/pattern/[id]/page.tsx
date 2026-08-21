import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadPattern } from "@/lib/db/pattern";
import { EditorShell } from "@/components/editor/EditorShell";

export default async function PatternPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");
  const { id } = await params;

  const loaded = await loadPattern(id, session.user.id);
  if (!loaded) redirect("/");

  return <EditorShell userEmail={session.user.email} patternId={id} />;
}
