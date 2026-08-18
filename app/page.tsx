import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listMoldesForUser, createMolde } from "@/lib/db/molde";

// Interim home: the real dashboard (list/search/create UI) lands in a
// follow-up plan and replaces this file's body — same route.
export default async function Home() {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");

  const moldes = await listMoldesForUser(session.user.id);
  const id = moldes[0]?.id ?? (await createMolde(session.user.id));
  redirect(`/molde/${id}`);
}
