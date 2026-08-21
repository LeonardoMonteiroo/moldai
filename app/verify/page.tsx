import { getTranslations } from "next-intl/server";
import VerifyCard from "@/components/auth/VerifyCard";
import { Wordmark } from "@/components/shared/Wordmark";

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
        <Wordmark />
        <h1 className="text-body mt-4 font-semibold">{t("heading")}</h1>
        {token ? (
          <VerifyCard token={token} />
        ) : (
          <p className="text-alert text-ui mt-3">{t("missingToken")}</p>
        )}
      </div>
    </div>
  );
}
