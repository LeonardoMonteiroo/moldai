import { useTranslations } from "next-intl";
import { Pattern } from "@/lib/types";
import { buildExportModel } from "@/lib/export/model";
import {
  buildEaseReport,
  GIRTHS,
  type EaseReport,
} from "@/lib/draft/easeReport";
import { formatCm as cm, formatPct } from "@/lib/format";
import { engineFor } from "@/lib/draft/engine/capability";
import {
  buildSpecParams,
  STYLE_VALUE_CATALOG,
  type SpecParam,
} from "@/lib/draft/specParams";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function TechSheetTab({ pattern }: { pattern: Pattern }) {
  const t = useTranslations("TechSheetTab");
  const tData = useTranslations("PatternData");
  // Dimensions (w × h in cm) per piece, from the model re-drafted in exact cm.
  const dims: Record<string, { w: number; h: number }> = {};
  if (pattern.spec && pattern.pieces.length > 0) {
    try {
      for (const p of buildExportModel(pattern, tData).pieces)
        dims[p.id] = { w: p.widthCm, h: p.heightCm };
    } catch {
      /* no valid spec: falls back to the no-dimensions behavior */
    }
  }

  // #115: distinct piece count -- what the cards below this summary actually
  // enumerate -- kept separate from the copies-to-cut total (qty summed
  // across pieces), which used to be mislabeled as the piece count. Same
  // "cópias" wording CutPlanTab's own metric already uses for the identical
  // number.
  const pieceCount = pattern.pieces.length;
  const totalCopies = pattern.pieces.reduce((s, p) => s + p.qty, 0);

  // #332: the style half of the spec, in the order the pattern's FROZEN
  // engine declares it, filtered to the fields that engine actually reads for
  // this garment type. This is where folga de costura, caimento and
  // elasticidade now live -- they used to be three chips in the row below,
  // which meant the summary row owned some style fields and nothing owned the
  // rest. It also retires the hand-written knit/hasBodice branch that used to
  // gate the caimento/tecido chip: styleFieldsByType already lists `fit` only
  // for blouse/dress and `stretch` only for tshirt, so #125's rule is now
  // structural rather than restated here.
  const specParams = pattern.spec
    ? buildSpecParams(pattern.spec, engineFor(pattern.engine))
    : [];

  // #137: the drafted-ease report -- finished garment girth vs. the frozen
  // sizeTable row it was drafted from, measured off the actual geometry
  // (never the wearingEaseCm the drafter was merely ASKED for, which the
  // chipFit/chipFabric chips above already surface). Pure/null-safe -- no
  // try/catch needed, buildEaseReport returns null itself rather than
  // throwing when there's nothing to measure yet.
  const easeReport = pattern.spec ? buildEaseReport(pattern, tData) : null;

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-[22px]">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="font-display text-title font-semibold">
            {t("title")}
          </span>
          <span className="text-muted text-ui">
            {t("subtitle", {
              name: pattern.name,
              baseSize: pattern.baseSize,
              unit: pattern.unit,
            })}
          </span>
        </div>

        {/* pattern summary */}
        {pattern.spec && (
          <div className="text-meta mb-4 flex flex-wrap gap-2">
            <Chip
              label={t("chipType")}
              value={t("garmentType." + pattern.spec.type)}
            />
            <Chip
              label={t("chipGender")}
              value={t("gender." + pattern.spec.gender)}
            />
            <Chip label={t("chipPieces")} value={`${pieceCount}`} />
            <Chip label={t("chipCopies")} value={`${totalCopies}`} />
            {/* Absent on patterns drafted before the snapshot recorded it —
                omitted rather than guessed at. */}
            {pattern.sizeChartName && (
              <Chip label={t("chipSizeChart")} value={pattern.sizeChartName} />
            )}
            {/* #267: the frozen choice, made visible -- with one engine and
                no picker, this chip is the only place EngineId reaches a
                screen at all. Catalog lookup keyed by the enum value, never
                a hand-written label map. Always renders (even for a pattern
                predating the freeze, which resolves through engineFor to
                the default) since, unlike sizeChartName, there is always a
                real engine to name. */}
            <Chip
              label={t("chipEngine")}
              value={t(`engine.${engineFor(pattern.engine)}`)}
            />
          </div>
        )}

        {specParams.length > 0 && (
          <SpecParamsCard params={specParams} t={t} tData={tData} />
        )}

        {easeReport && (
          <EaseReportCard report={easeReport} t={t} tData={tData} />
        )}

        <div className="flex flex-col gap-3">
          {pattern.pieces.map((piece) => {
            const d = dims[piece.id];
            const detailRows = [
              ...(d
                ? [
                    {
                      label: t("dimensionsLabel"),
                      value: `${cm(d.w)} × ${cm(d.h)} cm`,
                    },
                  ]
                : []),
              ...(piece.detailRows ?? []),
            ];
            return (
              <div
                key={piece.id}
                className="border-border rounded-card bg-surface overflow-hidden border"
              >
                <div className="bg-surface-alt border-line flex items-baseline gap-2 border-b px-3 py-[9px]">
                  <span className="text-control font-semibold">
                    {piece.name}
                  </span>
                  <span className="text-muted text-ui">{piece.qty}×</span>
                </div>
                {detailRows.length > 0 ? (
                  <Table>
                    <TableBody>
                      {detailRows.map((row) => (
                        <TableRow key={row.label}>
                          {/* Labels wrap: the primitive keeps cells on one line,
                              which would scroll a long drafter label sideways
                              instead of using the width the card already has. */}
                          <TableCell className="text-muted w-1/2 px-3 py-[7px] whitespace-normal">
                            {row.label}
                          </TableCell>
                          <TableCell className="px-3 py-[7px] font-medium">
                            {row.value}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-muted text-ui px-3 py-[9px]">
                    {t("noDetails")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

// #332: the "Parametros" panel -- the style half of the spec this pattern was
// actually drafted from, read-only. Same card shell and two-column Table the
// piece cards below already use, so it reads as one more section of the sheet
// rather than a new kind of surface.
//
// Every string is a catalog lookup keyed by the EN code: the row label from
// PatternData.styleField.* (the catalog #325 completed), an enum value from
// whichever PatternData catalog STYLE_VALUE_CATALOG names for that field. A cm
// field is formatted by the same formatCm the rest of the sheet uses, and
// `darts` -- the only boolean GarmentStyle has -- resolves through
// params.yes/no.
//
// The frozen size chart and engine are deliberately NOT repeated here: the
// chipSizeChart/chipEngine chips above already state them, so the whole
// "recipe" is on this one surface without saying either twice.
function SpecParamsCard({
  params,
  t,
  tData,
}: {
  params: SpecParam[];
  t: ReturnType<typeof useTranslations>;
  tData: ReturnType<typeof useTranslations>;
}) {
  const valueOf = (p: SpecParam): string => {
    if (p.kind === "cm") return `${cm(p.value as number)} cm`;
    if (p.kind === "boolean") return t(p.value ? "params.yes" : "params.no");
    const catalog =
      STYLE_VALUE_CATALOG[p.field as keyof typeof STYLE_VALUE_CATALOG];
    return tData(`${catalog}.${p.value}`);
  };
  return (
    <div className="border-border rounded-card bg-surface mb-4 overflow-hidden border">
      <div className="bg-surface-alt border-line flex items-baseline gap-2 border-b px-3 py-[9px]">
        <span className="text-control font-semibold">{t("params.title")}</span>
        <span className="text-muted text-ui">{t("params.subtitle")}</span>
      </div>
      <Table>
        <TableBody>
          {params.map((p) => (
            <TableRow key={p.field}>
              <TableCell className="text-muted w-1/2 px-3 py-[7px] whitespace-normal">
                {tData("styleField." + p.field)}
              </TableCell>
              <TableCell className="px-3 py-[7px] font-medium">
                {valueOf(p)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// #137: the drafted-ease report -- finished garment girth vs. the frozen
// sizeTable row, cm and %, plus the fit class those numbers imply
// (tData("fit." + …), the SAME PatternData.fit.* catalog the chipFit chip
// above reads, per the catalog-lookup-keyed-by-EN-enum rule: never a second
// label map). A girth with no matching panel (or, for a radial skirt
// silhouette, no reliable height scan) renders as an explicit note instead
// of a row -- CLAUDE.md's "surface a scope boundary where the user meets
// it," never a silent omission.
function EaseReportCard({
  report,
  t,
  tData,
}: {
  report: EaseReport;
  t: ReturnType<typeof useTranslations>;
  tData: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="border-border rounded-card bg-surface mb-4 overflow-hidden border">
      <div className="bg-surface-alt border-line flex items-baseline gap-2 border-b px-3 py-[9px]">
        <span className="text-control font-semibold">
          {t("easeReport.title")}
        </span>
        <span className="text-muted text-ui">{t("easeReport.subtitle")}</span>
      </div>
      {report.girths.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("easeReport.colGirth")}</TableHead>
              <TableHead>{t("easeReport.colFinished")}</TableHead>
              <TableHead>{t("easeReport.colBody")}</TableHead>
              <TableHead>{t("easeReport.colDiff")}</TableHead>
              <TableHead>{t("easeReport.colFit")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {GIRTHS.map((girth) => {
              const g = report.girths.find((e) => e.girth === girth);
              if (!g) return null;
              return (
                <TableRow key={girth}>
                  <TableCell className="font-medium">
                    {t("easeReport.girth." + girth)}
                  </TableCell>
                  <TableCell>{cm(g.finishedCm)} cm</TableCell>
                  <TableCell>{cm(g.bodyCm)} cm</TableCell>
                  {/* Negative ease is shown as such (a knit is drafted that
                      way on purpose), never hidden or treated as an error. */}
                  <TableCell>
                    {cm(g.diffCm)} cm ({formatPct(g.diffPct)})
                  </TableCell>
                  <TableCell>{tData("fit." + g.fitClass)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {report.unavailable.length > 0 && (
        <div className="text-muted text-ui flex flex-col gap-1 px-3 py-[9px]">
          {report.unavailable.map((u) => (
            <span key={u.girth}>
              {t(`easeReport.unavailable.${u.reason}`, {
                girth: t(`easeReport.girth.${u.girth}`).toLowerCase(),
              })}
            </span>
          ))}
        </div>
      )}
      {report.cap && (
        <div className="border-line flex flex-wrap gap-2 border-t px-3 py-[9px]">
          <Chip
            label={t("easeReport.capArmhole")}
            value={`${cm(report.cap.armholeArcCm)} cm`}
          />
          <Chip
            label={t("easeReport.capSleeve")}
            value={`${cm(report.cap.capArcCm)} cm`}
          />
          <Chip
            label={t("easeReport.capEase")}
            value={`${cm(report.cap.easeCm)} cm`}
          />
        </div>
      )}
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="border-border rounded-item bg-surface inline-flex items-baseline gap-[5px] border px-[9px] py-[4px]">
      <span className="text-muted text-tick tracking-eyebrow font-semibold uppercase">
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
