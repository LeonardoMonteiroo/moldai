import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { EditorShell } from "@/components/editor/EditorShell";

export default async function Home() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <EditorShell userEmail={session.user.email} />
    </div>
  );
}
