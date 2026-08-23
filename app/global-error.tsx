"use client";

import { useEffect } from "react";
import { Bricolage_Grotesque, Archivo } from "next/font/google";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shared/Wordmark";
// global-error replaces the root layout entirely when active, so
// NextIntlClientProvider isn't mounted -- useTranslations has no provider to
// read from. The catalog is imported directly instead: this is a static,
// build-time JSON import, not the async next-intl server API, so it works
// from this required-to-be-client-component boundary. pt-BR text still
// lives only in messages/pt-BR.json, never hardcoded in this file.
import messages from "@/messages/pt-BR.json";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const t = messages.GlobalError;

// #98: the root layout itself throwing (e.g. RootLayout's own
// getMessages() call failing) has no segment-level error.tsx above it to
// catch it -- global-error is the only boundary that can. It must define
// its own <html>/<body>, since it replaces the root layout when active.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html
      lang="pt-BR"
      className={`${bricolage.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="bg-paper text-ink flex min-h-screen items-center justify-center px-4 font-sans">
        <div
          role="alert"
          className="bg-surface border-border rounded-card shadow-card flex w-full max-w-[380px] flex-col items-center gap-4 border p-7 text-center"
        >
          <Wordmark />
          <div className="flex flex-col gap-1">
            <h1 className="text-body font-semibold">{t.heading}</h1>
            <p className="text-muted text-ui">{t.message}</p>
          </div>
          <Button variant="outline" size="chrome" onClick={() => retry()}>
            {t.retryButton}
          </Button>
        </div>
      </body>
    </html>
  );
}
