"use client";

import { useTranslations } from "next-intl";
import type { ExportFormat } from "@/lib/export";
import { EXPORT_FORMATS, EXPORT_FORMAT_LABELS } from "@/lib/export/formats";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Order and labels come from EXPORT_FORMATS/EXPORT_FORMAT_LABELS
// (lib/export/formats.ts) so this menu and the public landing page's format
// strip cannot disagree about what the app writes. The per-format caveats
// live in the same table: formatDxfAamaNote (drill holes, layer 13, still
// unemitted), formatPdfLayeredNote (the layered PDF omits the net sewing
// line and the fold for legibility), formatPltNote (HPGL/2 written to spec
// and verified structurally, never plotted on physical hardware, plus the
// plotter-internal-font limit on the piece label).
const REAL_FORMATS: { id: ExportFormat; labelKey: string; noteKey?: string }[] =
  EXPORT_FORMATS.map((id) => ({ id, ...EXPORT_FORMAT_LABELS[id] }));

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
