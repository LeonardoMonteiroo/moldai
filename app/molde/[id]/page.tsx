import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadMolde } from "@/lib/db/molde";
import { EditorShell } from "@/components/editor/EditorShell";

export default async function MoldePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");
  const { id } = await params;

  const moldeState = await loadMolde(id, session.user.id);
  if (!moldeState) redirect("/");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EditorShell userEmail={session.user.email} moldeId={id} />
    </div>
  );
}
