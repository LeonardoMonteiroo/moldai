import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LoginCard from "@/components/auth/LoginCard";
import { Wordmark } from "@/components/shared/Wordmark";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Login");
  return { title: t("heading") };
}

export default async function LoginPage() {
  const t = await getTranslations("Login");
  return (
    <div className="bg-paper flex h-full justify-center overflow-y-auto px-4 py-8">
      <div className="bg-surface border-border rounded-card shadow-card my-auto w-full max-w-[380px] border p-7">
        <Wordmark />
        <h1 className="text-body mt-4 font-semibold">{t("heading")}</h1>
        <LoginCard />
      </div>
    </div>
  );
}
