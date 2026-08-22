import { useTranslations } from "next-intl";
import { ConflictInfo } from "@/lib/types";

// One decimal, the same basis the drafters' own detailRows use — so the card's
// "Cava · frente 22,7 cm" is the number the piece details panel already shows.
// Each of the three values is rounded from the raw cm independently, which is
// why the two lengths need not subtract to exactly the gap (22,712 − 19,656 is
// 3,06 → "falta 3,1", while the displayed operands read 22,7 and 19,7). The
// alternative — deriving the gap from the rounded operands — would make the card
// contradict the chat message and the persisted ConflictInfo about the same
// divergence, which is the worse of the two roundings.
const cm = (n: number) => n.toFixed(1).replace(".", ",");

// Both seams share one scale: each bar is the seam's share of the longer of the
// two, so the shorter one's missing span is the visible remainder — drawn in the
// alert token, since the gap is what's wrong, not either seam on its own.
function SeamBar({ fillPct, showGap }: { fillPct: number; showGap: boolean }) {
  return (
    <div className="bg-track flex h-[5px] overflow-hidden rounded-full">
      <div className="bg-olive" style={{ width: `${fillPct}%` }} />
      {showGap && <div className="bg-alert flex-1" />}
    </div>
  );
}

function SeamRow({
  label,
  value,
  fillPct,
  showGap,
}: {
  label: string;
  value: string;
  fillPct: number;
  showGap: boolean;
}) {
  return (
    <div className="flex flex-col gap-[3px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-muted-2 text-meta">{label}</span>
        <span className="text-ui tabular-nums">{value}</span>
      </div>
      <SeamBar fillPct={fillPct} showGap={showGap} />
    </div>
  );
}

export function ConflictInfoCard({
  conflict,
  armholeLenCm,
  sleeveArmholeCm,
}: {
  conflict: ConflictInfo;
  // Derived at render time from the pattern's spec (lib/draft's measureSeams),
  // not carried by ConflictInfo — absent for a garment the drafter reports no
  // seams for, and then the card falls back to the bare difference line.
  armholeLenCm?: number;
  sleeveArmholeCm?: number;
}) {
  const t = useTranslations("ConflictInfoCard");
  const hasSeams = armholeLenCm != null && sleeveArmholeCm != null;
  const longest = hasSeams ? Math.max(armholeLenCm, sleeveArmholeCm) : 0;
  const bodyIsLonger = hasSeams && armholeLenCm > sleeveArmholeCm;
  const pct = (v: number) => (longest > 0 ? (v / longest) * 100 : 0);

  return (
    <div className="bg-surface border-border rounded-card shadow-card absolute top-5 right-5 flex w-[212px] flex-col gap-[7px] border p-3">
      <span className="text-muted text-meta tracking-eyebrow font-semibold uppercase">
        {t("sectionLabel")}
      </span>
      <span className="text-ui font-semibold">{conflict.title}</span>
      {hasSeams ? (
        <div className="flex flex-col gap-[7px]">
          <SeamRow
            label={t("bodyRowLabel")}
            value={t("valueCm", { value: cm(armholeLenCm) })}
            fillPct={pct(armholeLenCm)}
            showGap={!bodyIsLonger}
          />
          <SeamRow
            label={t("sleeveRowLabel")}
            value={t("valueCm", { value: cm(sleeveArmholeCm) })}
            fillPct={pct(sleeveArmholeCm)}
            showGap={bodyIsLonger}
          />
          <span className="text-alert text-ui">
            {t("gapLabel", {
              direction: bodyIsLonger ? "larger" : "smaller",
              diff: cm(conflict.diffCm),
            })}
          </span>
        </div>
      ) : (
        <span className="text-alert text-ui">
          {t("diffLabel", { diff: cm(conflict.diffCm) })}
        </span>
      )}
      <div className="bg-line h-px" />
      <span className="text-muted-2 text-meta leading-[1.45]">
        {conflict.suggestion}
      </span>
    </div>
  );
}
