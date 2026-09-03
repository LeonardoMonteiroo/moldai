import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { OG_COLORS, OG_SIZE } from "@/lib/brand/og";

// B10 ship requirements: a link to this site shared anywhere should preview
// as something branded rather than a bare URL. Next generates og:image and
// twitter:image from this one file for the whole app, since it sits at the
// root segment.
//
// The card is drawn by satori, not by the browser: no stylesheet, no
// @theme tokens, and only a subset of CSS (every container needs an
// explicit display). That is why the colors come from lib/brand/og.ts as
// literals rather than from app/globals.css, and why the layout here is
// plain flexbox with no shorthand.
//
// The wordmark is set in the default font rather than Geist: loading a font
// file makes this a build-time filesystem read for one social card, and the
// card is type-only, so the shape of the letters is not carrying the brand
// on its own here.

export const alt = "MoldAI";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function OpengraphImage() {
  const t = await getTranslations("Landing");

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: OG_COLORS.paper,
        color: OG_COLORS.ink,
        padding: "80px",
      }}
    >
      <div style={{ display: "flex", fontSize: 34, color: OG_COLORS.olive }}>
        MoldAI
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            lineHeight: 1.05,
            maxWidth: "900px",
          }}
        >
          {t("hero.title")}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: OG_COLORS.muted,
            maxWidth: "860px",
          }}
        >
          {t("hero.body")}
        </div>
      </div>

      <div style={{ display: "flex", fontSize: 26, color: OG_COLORS.muted }}>
        {t("hero.proof.seams")}
      </div>
    </div>,
    size,
  );
}
