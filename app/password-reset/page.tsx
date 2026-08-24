import PasswordResetCard from "@/components/auth/PasswordResetCard";
import { Wordmark } from "@/components/shared/Wordmark";

// One of the three centered-card screens that bypass AppShell (with /login
// and /signup), following app/verify/page.tsx's shape: a thin server
// component reading the token search param as plain data, handing it to a
// client card. Unlike /verify, a missing token is not an error state here --
// it is the entry point reached from "Esqueci minha senha" (no link yet),
// while a token present is the entry point reached from the mailed link.
export default async function PasswordResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? "";

  return (
    <div className="bg-paper flex h-full justify-center overflow-y-auto px-4 py-8">
      <div className="bg-surface border-border rounded-card shadow-card my-auto w-full max-w-[380px] border p-7">
        <Wordmark />
        <PasswordResetCard token={token} />
      </div>
    </div>
  );
}
