"use client";

import { ArrowRightIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { PatternVersionEntry } from "@/lib/api-client";
import type { Pattern } from "@/lib/types";
import { draftGarment, measureSeams } from "@/lib/draft/engine/facade";
import { engineFor } from "@/lib/draft/engine/capability";
import { planCutLayout, FABRIC_WIDTHS_CM } from "@/lib/export/cutplan";
import { formatCm } from "@/lib/format";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { OutlineShape } from "./OutlineShape";

// Consumption is compared at a fixed fabric width -- the two versions have
// to share one width or the numbers wouldn't be comparable. The narrowest
// preset is also the most common roll width, per lib/export/cutplan.ts.
const COMPARE_FABRIC_WIDTH_CM = FABRIC_WIDTHS_CM[0];

// Meters at 2 decimals, pt-BR comma -- CLAUDE.md's formatCm precedent (never
// a bare toFixed, which renders a dot decimal separator) at a different
// precision than formatCm's own 1-decimal cm convention.
function formatMeters(cm: number): string {
  return (cm / 100).toFixed(2).replace(".", ",");
}

// One "O que mudou" row: label, the "a → b unit" range in the version's own
// display precision, and a delta computed from THAT displayed precision (not
// raw floating point) -- two values that render identically show "—", never
// a spurious "+0,0" from float noise below the shown precision.
type DiffRow = {
  label: string;
  range: string;
  delta: string;
  unchanged: boolean;
};

function diffRow(
  label: string,
  aCm: number,
  bCm: number,
  unit: string,
  format: (n: number) => string,
): DiffRow {
  const aStr = format(aCm);
  const bStr = format(bCm);
  const unchanged = aStr === bStr;
  const delta = bCm - aCm;
  return {
    label,
    range: `${aStr} → ${bStr} ${unit}`,
    delta: unchanged ? "—" : (delta > 0 ? "+" : "−") + format(Math.abs(delta)),
    unchanged,
  };
}

// Builds the minimal Pattern shape buildExportModel/planCutLayout actually
// read (spec, sizeTable, baseSize) -- see lib/export/model.ts's
// buildExportModel, which never touches `pieces`. Nothing else about a
// PatternVersion snapshot licenses reconstructing a real Pattern, so the
// rest of the shape is inert filler.
function toComparablePattern(v: PatternVersionEntry): Pattern {
  return {
    id: v.id,
    name: "",
    version: v.version,
    baseSize: v.baseSize,
    unit: "cm",
    sizes: v.sizes,
    sizesApplied: [],
    sizesPending: v.sizes,
    sizeTable: v.sizeTable,
    pieces: [],
    spec: v.spec,
  };
}

export function VersionCompare({
  versions,
  fromVersion,
  toVersion,
  restoring,
  onRestore,
}: {
  versions: PatternVersionEntry[];
  /** Controlled selection, lifted into VersionsShell so a VersionList card
   *  click and this panel always agree on what's being compared. */
  fromVersion: number;
  toVersion: number;
  restoring: boolean;
  onRestore: (versionId: string) => void;
}) {
  const t = useTranslations("VersionCompare");
  // Shared with VersionList -- version formatting and the restore-confirm
  // copy are the identical strings that screen already uses.
  const tList = useTranslations("VersionList");
  const tData = useTranslations("PatternData");
  const [overlay, setOverlay] = useState(true);
  const [confirmingRestore, setConfirmingRestore] = useState(false);

  const from = versions.find((v) => v.version === fromVersion);
  const to = versions.find((v) => v.version === toVersion);

  const drafted = useMemo(() => {
    if (!from || !to) return null;
    const fromBase = from.sizeTable[from.baseSize];
    const toBase = to.sizeTable[to.baseSize];
    if (!fromBase || !toBase) return null;
    // #267: each version's own frozen engine, never a fresh default.
    return {
      from: draftGarment(
        engineFor(from.engine ?? undefined),
        from.spec,
        fromBase,
        tData,
      ),
      to: draftGarment(
        engineFor(to.engine ?? undefined),
        to.spec,
        toBase,
        tData,
      ),
    };
    // tData is a stable translator instance for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const deltas = useMemo(() => {
    if (!from || !to) return null;
    const fromBase = from.sizeTable[from.baseSize];
    const toBase = to.sizeTable[to.baseSize];
    if (!fromBase || !toBase) return null;
    const fromSeams = measureSeams(
      engineFor(from.engine ?? undefined),
      from.spec,
      fromBase,
      tData,
    );
    const toSeams = measureSeams(
      engineFor(to.engine ?? undefined),
      to.spec,
      toBase,
      tData,
    );
    const fromCut = planCutLayout(
      toComparablePattern(from),
      COMPARE_FABRIC_WIDTH_CM,
      tData,
    );
    const toCut = planCutLayout(
      toComparablePattern(to),
      COMPARE_FABRIC_WIDTH_CM,
      tData,
    );
    return {
      armholeFrom: fromSeams.armholeLenCm,
      armholeTo: toSeams.armholeLenCm,
      garmentLengthFrom: fromSeams.garmentLengthCm,
      garmentLengthTo: toSeams.garmentLengthCm,
      lengthFromCm: fromCut.lengthCm,
      lengthToCm: toCut.lengthCm,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  if (versions.length < 2 || !from || !to) {
    return (
      <div className="border-border rounded-card text-muted text-control flex flex-1 items-center justify-center border bg-white p-8 text-center">
        {t("needsTwoVersions")}
      </div>
    );
  }

  const maxW = drafted
    ? Math.max(drafted.from.viewBox.w, drafted.to.viewBox.w)
    : 1;
  const maxH = drafted
    ? Math.max(drafted.from.viewBox.h, drafted.to.viewBox.h)
    : 1;
  const pieceNames = drafted
    ? drafted.to.pieces.map((piece) => piece.name).join(" · ")
    : "";

  const rows = [
    deltas?.armholeFrom !== undefined &&
      deltas.armholeTo !== undefined &&
      diffRow(
        t("armholeDeltaLabel"),
        deltas.armholeFrom,
        deltas.armholeTo,
        "cm",
        formatCm,
      ),
    deltas?.garmentLengthFrom !== undefined &&
      deltas.garmentLengthTo !== undefined &&
      diffRow(
        t("lengthDeltaLabel"),
        deltas.garmentLengthFrom,
        deltas.garmentLengthTo,
        "cm",
        formatCm,
      ),
    deltas &&
      diffRow(
        t("consumptionDeltaLabel"),
        deltas.lengthFromCm,
        deltas.lengthToCm,
        "m",
        formatMeters,
      ),
  ].filter((row): row is DiffRow => row !== false);

  return (
    <div className="flex min-h-0 flex-1 gap-[14px]">
      <section className="border-border rounded-card bg-surface flex min-w-0 flex-1 flex-col overflow-hidden border">
        <div className="border-border flex flex-none items-center gap-[10px] border-b px-[14px] py-[10px]">
          <div className="flex min-w-0 items-center gap-[7px]">
            <span className="text-control flex items-center gap-[6px] font-semibold">
              <span className="border-muted-2 inline-block w-3 border-t-[1.5px] border-dashed" />
              {tList("versionLabel", { version: fromVersion })}
            </span>
            {/* The design's own 14px arrow. This one is purely visual (it is
                already aria-hidden), so it is an icon, not text -- unlike the
                "v6 → v7" runs below and in each diff row, which the design
                writes as text and which stay that way. */}
            <ArrowRightIcon
              className="text-muted size-[14px] shrink-0"
              aria-hidden
            />
            <span className="text-control flex items-center gap-[6px] font-semibold">
              <span className="border-ink inline-block w-3 border-t-[1.5px]" />
              {tList("versionLabel", { version: toVersion })}
            </span>
          </div>
          <div className="flex-1" />
          <Toggle
            variant="outline"
            pressed={overlay}
            onPressedChange={setOverlay}
          >
            {t("overlayToggle")}
          </Toggle>
        </div>

        {drafted && (
          <div
            data-slot="version-compare-overlay"
            className="bg-surface-alt relative min-h-0 flex-1"
          >
            {overlay && (
              <svg
                viewBox={`0 0 ${maxW} ${maxH}`}
                className="absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)]"
                aria-hidden="true"
              >
                {drafted.from.pieces.map((piece) => (
                  <OutlineShape
                    key={piece.id}
                    outline={piece.outline}
                    className="stroke-pattern-guide fill-none"
                    style={{ strokeWidth: 1.1, strokeDasharray: "5 4" }}
                  />
                ))}
              </svg>
            )}
            <svg
              viewBox={`0 0 ${maxW} ${maxH}`}
              className="absolute inset-3 h-[calc(100%-24px)] w-[calc(100%-24px)]"
              role="img"
              aria-label={t("overlayAriaLabel", {
                from: fromVersion,
                to: toVersion,
              })}
            >
              {drafted.to.pieces.map((piece) => (
                <OutlineShape
                  key={piece.id}
                  outline={piece.outline}
                  className="stroke-ink fill-none"
                  style={{ strokeWidth: 1.4 }}
                />
              ))}
            </svg>
            <span className="text-muted text-tick absolute bottom-[10px] left-[14px]">
              {pieceNames}
            </span>
          </div>
        )}
      </section>

      <section className="border-border rounded-card bg-surface flex w-[268px] flex-none flex-col overflow-hidden border">
        <div className="border-border flex flex-none items-baseline gap-2 border-b px-[14px] py-[10px]">
          <h2 className="text-control m-0 font-semibold">
            {t("whatChangedTitle")}
          </h2>
          <span className="text-muted text-meta">
            {tList("versionLabel", { version: fromVersion })} →{" "}
            {tList("versionLabel", { version: toVersion })}
          </span>
        </div>
        <ul className="m-0 flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
          {rows.map((row) => (
            <li
              key={row.label}
              className="border-border flex items-baseline gap-2 border-b px-[14px] py-2"
            >
              <span className="text-muted-2 text-control min-w-0 flex-1">
                {row.label}
              </span>
              <span className="text-control whitespace-nowrap tabular-nums">
                {row.range}
              </span>
              <span
                className={[
                  "text-meta w-[52px] text-right font-semibold whitespace-nowrap tabular-nums",
                  row.unchanged ? "text-muted" : "text-olive-dark",
                ].join(" ")}
              >
                {row.delta}
              </span>
            </li>
          ))}
        </ul>
        <div className="border-border bg-surface-alt flex flex-none flex-col gap-[9px] border-t px-[14px] py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={restoring}
            onClick={() => setConfirmingRestore(true)}
          >
            {tList("restoreButton", { version: fromVersion })}
          </Button>
        </div>
      </section>

      {confirmingRestore && (
        <ConfirmModal
          title={tList("restoreModalTitle", { version: fromVersion })}
          description={tList("restoreModalDescription")}
          confirmLabel={tList("restoreModalConfirmButton")}
          cancelLabel={tList("restoreModalCancelButton")}
          variant="default"
          onConfirm={() => {
            setConfirmingRestore(false);
            onRestore(from.id);
          }}
          onCancel={() => setConfirmingRestore(false)}
        />
      )}
    </div>
  );
}
