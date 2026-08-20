import { describe, it, expect } from "vitest";
import { verificationEmail } from "./templates";
import type { Translate } from "@/lib/i18n/translate";

// A fake resolver: pure templates take the Translate seam, so no next-intl here.
const t: Translate = (key, values) =>
  values
    ? `${key}(${Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join(",")})`
    : key;

const LINK = "https://moldai.example/verify?token=abc123";

describe("verificationEmail", () => {
  it("resolves every string through the injected translator", () => {
    const m = verificationEmail(t, LINK, "Leonardo");
    expect(m.subject).toBe("subject");
    expect(m.text).toContain("greeting(name=Leonardo)");
    expect(m.text).toContain("expiry(hours=24)");
  });

  it("puts the link in both the text and the html part", () => {
    const m = verificationEmail(t, LINK, "Leonardo");
    expect(m.text).toContain(LINK);
    expect(m.html).toContain(LINK);
  });

  it("makes the html link clickable", () => {
    const m = verificationEmail(t, LINK, "Leonardo");
    expect(m.html).toContain(`href="${LINK}"`);
  });

  it("escapes html-significant characters in the name", () => {
    const m = verificationEmail(t, LINK, "x");
    const withTag = verificationEmail(
      (key, values) =>
        values ? `${key}:${Object.values(values).join("")}` : key,
      LINK,
      "<script>",
    );
    expect(withTag.html).not.toContain("<script>");
    expect(withTag.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("<html");
  });
});
