"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { PatternVersionEntry } from "@/lib/api-client";
import type { Pattern, PieceOutline } from "@/lib/types";
import { draftGarment, measureSeams } from "@/lib/draft/garment";
import { planCutLayout, FABRIC_WIDTHS_CM } from "@/lib/export/cutplan";
import { formatCm } from "@/lib/format";
import { Toggle } from "@/components/ui/toggle";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// Same tiny polygon/path switch PatternCanvas's own (unexported) OutlineShape
// uses -- not worth cross-importing a private component for six lines.
function OutlineShape({
  outline,
  className,
  style,
}: {
  outline: PieceOutline;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (outline.kind === "polygon") {
    return (
      <polygon points={outline.points} className={className} style={style} />
    );
  }
  return <path d={outline.d} className={className} style={style} />;
}

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
}: {
  versions: PatternVersionEntry[];
}) {
  const t = useTranslations("VersionCompare");
  const tData = useTranslations("PatternData");
  // Defaults to the two most recent -- `versions` is sorted newest-first by
  // the API (lib/db/patternVersion.ts's listVersions).
  const [toId, setToId] = useState(versions[0]?.id ?? "");
  const [fromId, setFromId] = useState(
    versions[1]?.id ?? versions[0]?.id ?? "",
  );
  const [overlay, setOverlay] = useState(true);

  const fromVersion = versions.find((v) => v.id === fromId) ?? versions[1];
  const toVersion = versions.find((v) => v.id === toId) ?? versions[0];

  const drafted = useMemo(() => {
    if (!fromVersion || !toVersion) return null;
    const fromBase = fromVersion.sizeTable[fromVersion.baseSize];
    const toBase = toVersion.sizeTable[toVersion.baseSize];
    if (!fromBase || !toBase) return null;
    return {
      from: draftGarment(fromVersion.spec, fromBase, tData),
      to: draftGarment(toVersion.spec, toBase, tData),
    };
    // tData is a stable translator instance for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromVersion, toVersion]);

  const deltas = useMemo(() => {
    if (!fromVersion || !toVersion) return null;
    const fromBase = fromVersion.sizeTable[fromVersion.baseSize];
    const toBase = toVersion.sizeTable[toVersion.baseSize];
    if (!fromBase || !toBase) return null;
    const fromSeams = measureSeams(fromVersion.spec, fromBase, tData);
    const toSeams = measureSeams(toVersion.spec, toBase, tData);
    const fromCut = planCutLayout(
      toComparablePattern(fromVersion),
      COMPARE_FABRIC_WIDTH_CM,
      tData,
    );
    const toCut = planCutLayout(
      toComparablePattern(toVersion),
      COMPARE_FABRIC_WIDTH_CM,
      tData,
    );
    return {
      armholeFrom: fromSeams.armholeLenCm,
      armholeTo: toSeams.armholeLenCm,
      lengthFromCm: fromCut.lengthCm,
      lengthToCm: toCut.lengthCm,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromVersion, toVersion]);

  if (versions.length < 2 || !fromVersion || !toVersion) {
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

  return (
    <div className="border-border rounded-card flex flex-1 flex-col gap-[14px] border bg-white p-[18px]">
      <div className="flex flex-wrap items-end gap-[14px]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="version-compare-from">{t("fromLabel")}</Label>
          <Select value={fromId} onValueChange={setFromId}>
            <SelectTrigger
              id="version-compare-from"
              size="sm"
              className="w-[140px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {t("versionOption", { version: v.version })}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="version-compare-to">{t("toLabel")}</Label>
          <Select value={toId} onValueChange={setToId}>
            <SelectTrigger
              id="version-compare-to"
              size="sm"
              className="w-[140px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {t("versionOption", { version: v.version })}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Toggle
          variant="outline"
          className="ml-auto"
          pressed={overlay}
          onPressedChange={setOverlay}
        >
          {t("overlayToggle")}
        </Toggle>
      </div>

      {drafted && (
        <div
          data-slot="version-compare-overlay"
          className="bg-surface-alt rounded-item relative w-full"
          style={{ aspectRatio: `${maxW} / ${maxH}` }}
        >
          {overlay && (
            <svg
              viewBox={`0 0 ${maxW} ${maxH}`}
              className="absolute inset-0 h-full w-full"
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
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label={t("overlayAriaLabel", {
              from: fromVersion.version,
              to: toVersion.version,
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
        </div>
      )}

      {deltas && (
        <div className="grid grid-cols-2 gap-[10px]">
          {deltas.armholeFrom !== undefined &&
            deltas.armholeTo !== undefined && (
              <div className="border-border rounded-item border p-[10px]">
                <span className="text-muted text-meta">
                  {t("armholeDeltaLabel")}
                </span>
                <p className="text-control">
                  {formatCm(deltas.armholeFrom)} → {formatCm(deltas.armholeTo)}{" "}
                  cm
                </p>
              </div>
            )}
          <div className="border-border rounded-item border p-[10px]">
            <span className="text-muted text-meta">
              {t("consumptionDeltaLabel")}
            </span>
            <p className="text-control">
              {formatMeters(deltas.lengthFromCm)} →{" "}
              {formatMeters(deltas.lengthToCm)} m
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
