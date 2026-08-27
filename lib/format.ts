import type { Translate } from "@/lib/i18n/translate";

// One decimal place, pt-BR comma. #107: six independent local copies of this
// exact formula (five correct, one -- components/editor/MeasureLayer.tsx --
// missing the comma replace entirely, rendering "12.3 cm") had drifted
// across drafters, canvas overlays and detail panels. Everywhere a cm value
// reaches JSX or a pre-formatted catalog value now calls this instead of
// re-deriving it.
export function formatCm(v: number): string {
  return v.toFixed(1).replace(".", ",");
}

// One decimal place, pt-BR comma, an explicit leading "+" for a positive
// value (a bare "8,3%" reads as neutral; the drafted-ease report, #137,
// needs the sign to read at a glance since both directions are meaningful —
// negative is a real, intentional value for a knit, not an error). A
// negative value already carries its own "-" from toFixed.
export function formatPct(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1).replace(".", ",")}%`;
}

// Joins a list as prose. The conjunction is pt-BR in the catalog, not here.
export function formatList(t: Translate, items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}${t("listConjunction")}${items[items.length - 1]}`;
}

export function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const letters = local.replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 2) || "?").toUpperCase();
}

// "updated" labels on the dashboard, the usage list and the editor header.
// The caller supplies a translator scoped to the Format namespace.
export function relativeTime(
  t: Translate,
  iso: string,
  now: Date = new Date(),
): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return t("relativeNow");
  if (min < 60) return t("relativeMinutes", { n: min });
  const hours = Math.floor(min / 60);
  if (hours < 24) return t("relativeHours", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("relativeDays", { n: days });
  return new Date(iso).toLocaleDateString(t("dateLocale"));
}
