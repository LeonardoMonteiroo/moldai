import { getTranslations } from "next-intl/server";
import VerifyCard from "@/components/auth/VerifyCard";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations("Verify");
  const token = (await searchParams).token ?? "";

  return (
    <div className="bg-paper flex min-h-screen items-center justify-center px-4">
      <div className="bg-surface border-border rounded-card shadow-card w-full max-w-[380px] border p-7">
        <span className="font-display text-[22px] font-bold tracking-[-0.4px]">
          Mold<span className="text-olive">AI</span>
        </span>
        <h1 className="mt-4 text-[15px] font-semibold">{t("heading")}</h1>
        {token ? (
          <VerifyCard token={token} />
        ) : (
          <p className="text-alert mt-3 text-[12px]">{t("missingToken")}</p>
        )}
      </div>
    </div>
  );
}
