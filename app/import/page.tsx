import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import { ImportShell } from "@/components/import/ImportShell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Import");
  return { title: t("title") };
}

export default async function ImportPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");

  return <ImportShell userEmail={session.user.email} />;
}
