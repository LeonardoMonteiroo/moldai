"use client";

import { useTranslations } from "next-intl";
import type { ExportFormat } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const REAL_FORMATS: { id: ExportFormat; labelKey: string; noteKey?: string }[] =
  [
    { id: "svg", labelKey: "formatSvg" },
    { id: "dxf", labelKey: "formatDxf" },
    { id: "dxf-aama", labelKey: "formatDxfAama", noteKey: "formatDxfAamaNote" },
    { id: "pdf-a4", labelKey: "formatPdfA4" },
    { id: "pdf-single", labelKey: "formatPdfSingle" },
  ];

// #17 decisions (issue body): three of the design's five format rows have no
// writer in lib/export yet. They render disabled + "em breve" rather than
// being hidden, per CLAUDE.md's rule that a scope boundary must be explicit
// where the user meets it. Plotter/.plt/.hpgl has its own tracked issue
// (#135); Molde.me and the tech-sheet .pdf/.xlsx export do not exist yet
// either.
const SOON_FORMATS = ["moldeme", "plotter", "techsheet"] as const;

export function ExportFormatList({
  selected,
  onSelect,
}: {
  selected: ExportFormat;
  onSelect: (format: ExportFormat) => void;
}) {
  const t = useTranslations("Footer");
  const tExport = useTranslations("Export");

  return (
    <div
      role="radiogroup"
      aria-label={tExport("formatsHeading")}
      className="flex flex-col gap-2"
    >
      {REAL_FORMATS.map((fmt) => {
        const isSelected = selected === fmt.id;
        return (
          <Button
            key={fmt.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            variant={isSelected ? "accent" : "outline"}
            onClick={() => onSelect(fmt.id)}
            className="h-auto w-full flex-col items-start gap-[3px] px-[14px] py-[10px] text-left"
          >
            <span className="text-control font-semibold">
              {t(fmt.labelKey)}
            </span>
            {fmt.noteKey && (
              <span className="text-muted text-meta leading-snug font-normal">
                {t(fmt.noteKey)}
              </span>
            )}
          </Button>
        );
      })}
      {SOON_FORMATS.map((id) => (
        <Button
          key={id}
          type="button"
          role="radio"
          aria-checked={false}
          disabled
          variant="outline"
          title={tExport("comingSoonTitle")}
          className="h-auto w-full flex-col items-start gap-[3px] px-[14px] py-[10px] text-left"
        >
          <span className="flex w-full items-center justify-between gap-2">
            <span className="text-control font-semibold">
              {tExport(`format.${id}`)}
            </span>
            <Badge variant="soon">{tExport("comingSoonBadge")}</Badge>
          </span>
          {id === "plotter" && (
            <span className="text-muted text-meta leading-snug font-normal">
              {tExport("formatPlotterNote")}
            </span>
          )}
        </Button>
      ))}
    </div>
  );
}
