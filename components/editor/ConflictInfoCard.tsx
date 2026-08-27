import { useTranslations } from "next-intl";
import { ConflictEntry, ConflictInfo } from "@/lib/types";
import type { SeamMeasurement } from "@/lib/draft/garment";
import { formatCm } from "@/lib/format";

// One decimal, the same basis the drafters' own detailRows use — so the card's
// "Cava · frente 22,7 cm" is the number the piece details panel already shows.
// Each of the three values is rounded from the raw cm independently, which is
// why the two lengths need not subtract to exactly the gap (22,712 − 19,656 is
// 3,06 → "falta 3,1", while the displayed operands read 22,7 and 19,7). The
// alternative — deriving the gap from the rounded operands — would make the card
// contradict the chat message and the persisted ConflictInfo about the same
// divergence, which is the worse of the two roundings.
const cm = formatCm;

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

// #134: one entry's own pair of bars -- the same visual the single
// armhole/cap conflict always had, generalised to any pair. A small heading
// only appears above it when the card is listing more than one entry (a
// single entry's own heading would just repeat the card's title). The two
// lengths are NOT read off `entry` (ConflictInfo persists only its diffCm,
// like the original single-pair shape always did) -- they come from
// `measurement`, re-derived at render time by the caller
// (measureSeamGraph), matched back to this entry by `key`. Falls back to
// the bare diff line when the fresh measurement isn't available (no usable
// spec, same fallback measureSeams' own absence already causes).
function EntryRows({
  entry,
  measurement,
  showHeading,
  t,
}: {
  entry: ConflictEntry;
  measurement?: SeamMeasurement;
  showHeading: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!measurement) {
    return (
      <div className="flex flex-col gap-[3px]">
        {showHeading && (
          <span className="text-muted-2 text-meta font-semibold">
            {entry.label}
          </span>
        )}
        <span className="text-alert text-ui">
          {t("entryDiffLabel", { diff: cm(entry.diffCm) })}
        </span>
      </div>
    );
  }
  const { aLenCm, bLenCm } = measurement;
  const longest = Math.max(aLenCm, bLenCm);
  const aIsLonger = aLenCm > bLenCm;
  const pct = (v: number) => (longest > 0 ? (v / longest) * 100 : 0);
  return (
    <div className="flex flex-col gap-[7px]">
      {showHeading && (
        <span className="text-muted-2 text-meta font-semibold">
          {entry.label}
        </span>
      )}
      <SeamRow
        label={entry.aLabel}
        value={t("valueCm", { value: cm(aLenCm) })}
        fillPct={pct(aLenCm)}
        showGap={!aIsLonger}
      />
      <SeamRow
        label={entry.bLabel}
        value={t("valueCm", { value: cm(bLenCm) })}
        fillPct={pct(bLenCm)}
        showGap={aIsLonger}
      />
      <span className="text-alert text-ui">
        {t("entryDiffLabel", { diff: cm(entry.diffCm) })}
      </span>
    </div>
  );
}

export function ConflictInfoCard({
  conflict,
  armholeLenCm,
  sleeveArmholeCm,
  seamGraph,
}: {
  conflict: ConflictInfo;
  // Derived at render time from the pattern's spec (lib/draft's measureSeams),
  // not carried by ConflictInfo — absent for a garment the drafter reports no
  // seams for, and then the card falls back to the bare difference line. Only
  // consulted when `conflict.entries` is absent (a legacy persisted blob) --
  // a live conflict's own numbers now come from `seamGraph` instead.
  armholeLenCm?: number;
  sleeveArmholeCm?: number;
  // #134: the FULL seam graph, re-derived by the caller (measureSeamGraph)
  // the same way armholeLenCm/sleeveArmholeCm above always have been --
  // matched to each of `conflict.entries` by `key`.
  seamGraph?: SeamMeasurement[] | null;
}) {
  const t = useTranslations("ConflictInfoCard");
  const entries = conflict.entries;
  const measurementsByKey = new Map((seamGraph ?? []).map((m) => [m.key, m]));
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
      {entries && entries.length > 0 ? (
        <div className="flex flex-col gap-[10px]">
          {entries.map((entry) => (
            <EntryRows
              key={entry.key}
              entry={entry}
              measurement={measurementsByKey.get(entry.key)}
              showHeading={entries.length > 1}
              t={t}
            />
          ))}
        </div>
      ) : hasSeams ? (
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
