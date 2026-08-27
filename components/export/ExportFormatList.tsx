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
    // #136: one page, every graded size (base + sizesApplied) layered as
    // real Optional Content Groups plus a legend -- a single ungraded
    // pattern still produces a valid, if trivial, one-layer file.
    {
      id: "pdf-layered",
      labelKey: "formatPdfLayered",
      noteKey: "formatPdfLayeredNote",
    },
    // #135: HPGL/2, written to spec and verified structurally (syntax,
    // 0.02cm coordinate round-trip, strip count, distinct pens) but never
    // plotted on physical hardware -- badged 'beta' in its own catalog
    // label (formatPlt), same marker formatDxfAama uses for its known gap;
    // formatPltNote states the untested-hardware caveat plus the LB-text
    // font limitation.
    { id: "plt", labelKey: "formatPlt", noteKey: "formatPltNote" },
  ];

// #17 decisions (issue body): two of the design's five format rows have no
// writer in lib/export yet. They render disabled + "em breve" rather than
// being hidden, per CLAUDE.md's rule that a scope boundary must be explicit
// where the user meets it. Molde.me and the tech-sheet .pdf/.xlsx export do
// not exist yet. Plotter/.plt/.hpgl (#135) and the layered multi-size PDF
// (#136) shipped and moved up into REAL_FORMATS above.
const SOON_FORMATS = ["moldeme", "techsheet"] as const;

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
        </Button>
      ))}
    </div>
  );
}
