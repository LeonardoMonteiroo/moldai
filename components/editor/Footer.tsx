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
    conflictActive ||
    generating ||
    pattern.pieces.length === 0 ||
    !pattern.spec;

  const statusText = conflictActive
    ? `v${pattern.version} · não exportável com conflito`
    : generating
      ? "gerando molde…"
      : `${pieceCount} peças · base ${pattern.baseSize} · unidade ${pattern.unit}`;

  // Só re-desenha o modelo quando o menu abre (buildExportModel re-drafta em cm).
  const a4Pages = useMemo(() => {
    if (!menuOpen || exportDisabled) return 0;
    const model = buildExportModel(pattern);
    return planTiles(model.sheetWidthCm, model.sheetHeightCm, "a4").pages
      .length;
  }, [menuOpen, exportDisabled, pattern]);

  const handleExport = (format: ExportFormat) => {
    setExportError(null);
    exportPattern(pattern, format, (msg) => setExportError(msg));
    setMenuOpen(false);
  };

  return (
    <div className="bg-surface border-border flex items-center gap-[10px] border-t px-4 py-3">
      <span className="text-muted text-[12px]">{statusText}</span>
      <div className="flex-1" />

      {exportError && (
        <span
          role="alert"
          className="text-alert bg-amber-bg border-amber-border rounded-item border px-[10px] py-[5px] text-[11.5px]"
        >
          {exportError}
        </span>
      )}

      <div className="relative">
        <button
          type="button"
          disabled={exportDisabled}
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-btn disabled:text-disabled disabled:border-disabled-border enabled:border-border enabled:hover:bg-surface-alt border px-[14px] py-2 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed"
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
            <div className="bg-surface border-border rounded-item shadow-card absolute right-0 bottom-full z-20 mb-1 min-w-[210px] border py-1">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => handleExport(fmt.id)}
                  className="hover:bg-surface-alt block w-full px-3 py-2 text-left transition-colors"
                >
                  <span className="block text-[12.5px]">{fmt.label}</span>
                  {fmt.id === "pdf-a4" && a4Pages > 0 && (
                    <span className="text-muted block text-[11px]">
                      ~{a4Pages} folha{a4Pages === 1 ? "" : "s"} A4
                    </span>
                  )}
                  {fmt.note && (
                    <span className="text-muted block text-[11px] leading-snug">
                      {fmt.note}
                    </span>
                  )}
                </button>
              ))}
              <div className="border-line text-muted mt-1 border-t px-3 pt-[6px] pb-1 text-[10.5px] leading-snug">
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
        className="rounded-btn bg-olive cursor-not-allowed px-4 py-2 text-[12.5px] font-semibold text-[#f7f7f2] opacity-50"
      >
        Salvar versão · em breve
      </button>
    </div>
  );
}
