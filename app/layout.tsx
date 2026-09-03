import type { Metadata } from "next";
import { Bricolage_Grotesque, Archivo, Geist } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { siteUrl } from "@/lib/seo/site";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700"],
});

// The public marketing surface (/ and /planos) runs its own type system --
// Geist alone, on Tailwind's default scale -- while the authenticated app
// keeps Bricolage + Archivo on the named --text-tick..--text-hero scale.
// The two are deliberately separate systems with an explicit boundary
// (the `font-marketing` utility opts in); see CLAUDE.md. Weights stop
// at 700: the marketing system never uses a 900/black weight.
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  // Without this, Next resolves every relative social-image URL against
  // `metadataBase || VERCEL_PROJECT_PRODUCTION_URL || http://localhost:3000`
  // (resolvers/resolve-url.js). This app is self-hosted Docker, so neither
  // Vercel variable is ever set and production took the localhost default:
  // every og:image and twitter:image on every page pointed at
  // http://localhost:3000/opengraph-image, making app/opengraph-image.tsx's
  // card unreachable for every real share. Nothing failed loudly -- the tags
  // were all present, and the only symptom was a blank preview on someone
  // else's machine.
  //
  // Read at module scope, which is server boot for the dynamic routes that
  // matter here (/, /planos, /privacy, /terms are all `f`, so they get the
  // runtime APP_URL from env_file). The two statically prerendered pages
  // (/login, /signup) freeze whatever APP_URL the BUILD saw, which is why the
  // Dockerfile's build stage takes it as an ARG.
  metadataBase: siteUrl(),
  // #109: every full-page route now sets its own `title` via
  // generateMetadata, so `default` below is really only the fallback for a
  // segment that doesn't (there is none left) -- `template` is what turns
  // each route's plain string into a distinguishable tab, brand suffixed.
  title: {
    template: "%s - MoldAI",
    default: "MoldAI - Editor de molde",
  },
  description:
    "MoldAI gera moldes de vestuário a partir de linguagem natural, foto, croqui ou tabela de medidas.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const messages = await getMessages();
  return (
    <html
      lang="pt-BR"
      className={`${bricolage.variable} ${archivo.variable} ${geist.variable} h-full antialiased`}
    >
      <body className="bg-paper text-ink flex h-screen flex-col overflow-hidden font-sans">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
