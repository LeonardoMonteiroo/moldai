import type { Metadata } from "next";
import { Bricolage_Grotesque, Archivo } from "next/font/google";
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
  title: "MoldAI — Editor de molde",
  description: "MoldAI gera moldes de vestuário a partir de linguagem natural, foto, croqui ou tabela de medidas.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${bricolage.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="h-screen flex flex-col overflow-hidden font-sans bg-paper text-ink">
        {children}
      </body>
    </html>
  );
}
