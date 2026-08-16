"use client";

import { useEffect, useMemo, useState } from "react";
import { Pattern } from "@/lib/types";
import { exportPattern, ExportFormat } from "@/lib/export";
import { buildExportModel } from "@/lib/export/model";
import { planTiles } from "@/lib/export/pdf";

const FORMATS: { id: ExportFormat; label: string; note?: string }[] = [
  { id: "svg", label: "SVG · 1:1 (plotter)" },
  { id: "dxf", label: "DXF · genérico 1:1 (CAD)" },
  {
    id: "dxf-aama",
    label: "DXF · Audaces/AAMA-ASTM · beta",
    note: "Camadas numeradas D6673. Ainda sem piques/furos/linha de costura.",
  },
  { id: "pdf-a4", label: "PDF · A4 (colar em casa)" },
  { id: "pdf-single", label: "PDF · folha única (plotter)" },
];

export function Footer({
  pattern,
  conflictActive,
  generating,
}: {
  pattern: Pattern;
  conflictActive: boolean;
  generating: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    if (!exportError) return;
    const t = setTimeout(() => setExportError(null), 6000);
    return () => clearTimeout(t);
  }, [exportError]);
  const pieceCount = pattern.pieces.reduce((sum, p) => sum + p.qty, 0);
  const exportDisabled =
    conflictActive || generating || pattern.pieces.length === 0 || !pattern.spec;

  const statusText = conflictActive
    ? `v${pattern.version} · não exportável com conflito`
    : generating
      ? "gerando molde…"
      : `${pieceCount} peças · base ${pattern.baseSize} · unidade ${pattern.unit}`;

  // Só re-desenha o modelo quando o menu abre (buildExportModel re-drafta em cm).
  const a4Pages = useMemo(() => {
    if (!menuOpen || exportDisabled) return 0;
    const model = buildExportModel(pattern);
    return planTiles(model.sheetWidthCm, model.sheetHeightCm, "a4").pages.length;
  }, [menuOpen, exportDisabled, pattern]);

  const handleExport = (format: ExportFormat) => {
    setExportError(null);
    exportPattern(pattern, format, (msg) => setExportError(msg));
    setMenuOpen(false);
  };

  return (
    <div className="flex items-center gap-[10px] px-4 py-3 bg-surface border-t border-border">
      <span className="text-[12px] text-muted">{statusText}</span>
      <div className="flex-1" />

      {exportError && (
        <span
          role="alert"
          className="text-[11.5px] text-alert bg-amber-bg border border-amber-border rounded-item px-[10px] py-[5px]"
        >
          {exportError}
        </span>
      )}

      <div className="relative">
        <button
          type="button"
          disabled={exportDisabled}
          onClick={() => setMenuOpen((o) => !o)}
          className="text-[12.5px] font-medium px-[14px] py-2 rounded-btn border transition-colors disabled:cursor-not-allowed disabled:text-disabled disabled:border-disabled-border enabled:border-border enabled:hover:bg-surface-alt"
        >
          Exportar
        </button>
        {menuOpen && !exportDisabled && (
          <>
            <button
              type="button"
              aria-label="Fechar menu de exportação"
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute bottom-full right-0 mb-1 z-20 min-w-[210px] py-1 bg-surface border border-border rounded-item shadow-card">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => handleExport(fmt.id)}
                  className="block w-full text-left px-3 py-2 hover:bg-surface-alt transition-colors"
                >
                  <span className="block text-[12.5px]">{fmt.label}</span>
                  {fmt.id === "pdf-a4" && a4Pages > 0 && (
                    <span className="block text-[11px] text-muted">
                      ~{a4Pages} folha{a4Pages === 1 ? "" : "s"} A4
                    </span>
                  )}
                  {fmt.note && (
                    <span className="block text-[11px] text-muted leading-snug">
                      {fmt.note}
                    </span>
                  )}
                </button>
              ))}
              <div className="border-t border-line mt-1 pt-[6px] px-3 pb-1 text-[10.5px] text-muted leading-snug">
                Linha líquida — sem margem de costura embutida.
              </div>
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        disabled
        title="O molde é salvo automaticamente a cada geração. Versionamento manual chega em breve."
        className="text-[12.5px] font-semibold px-4 py-2 rounded-btn bg-olive text-[#f7f7f2] opacity-50 cursor-not-allowed"
      >
        Salvar versão · em breve
      </button>
    </div>
  );
}
