import type { Metadata } from "next";
import { Bricolage_Grotesque, Archivo } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
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

export const metadata: Metadata = {
  // #109: every full-page route now sets its own `title` via
  // generateMetadata, so `default` below is really only the fallback for a
  // segment that doesn't (there is none left) -- `template` is what turns
  // each route's plain string into a distinguishable tab, brand suffixed.
  title: {
    template: "%s — MoldAI",
    default: "MoldAI — Editor de molde",
  },
  description:
    "MoldAI gera moldes de vestuário a partir de linguagem natural, foto, croqui ou tabela de medidas.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const messages = await getMessages();
  return (
    <html
      lang="pt-BR"
      className={`${bricolage.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="bg-paper text-ink flex h-screen flex-col overflow-hidden font-sans">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
