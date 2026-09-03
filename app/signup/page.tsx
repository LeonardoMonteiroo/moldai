import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import SignupCard from "@/components/auth/SignupCard";
import { Wordmark } from "@/components/shared/Wordmark";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Signup");
  return { title: t("heading") };
}

export default function SignupPage() {
  return (
    <div className="bg-paper flex h-full justify-center overflow-y-auto px-4 py-8">
      {/* 420px, not the 380px every other auth card uses (Autenticacao.dc.html's
          cardWidth) -- signup carries 4 fields to login's 2 and reads cramped
          at the narrower width. */}
      <div className="bg-surface border-border rounded-card shadow-card my-auto w-full max-w-[420px] border p-7">
        <Wordmark />
        {/* The heading itself lives in SignupCard, not here -- it has to
            switch to the success heading once the account is created, and a
            static server-rendered <h1> alongside it produced two headings at
            once (fixed after the redesign handoff's Round 2 reference
            screenshot showed only one). generateMetadata below still needs
            its own translator for the tab title, independent of the DOM. */}
        <SignupCard />
      </div>
    </div>
  );
}
