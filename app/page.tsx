import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EditorShell } from "@/components/editor/EditorShell";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <EditorShell userEmail={session.user.email} />
    </div>
  );
}
