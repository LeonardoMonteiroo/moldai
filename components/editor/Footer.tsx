"use client";

import { useState } from "react";
import { Pattern } from "@/lib/types";
import { exportPattern, ExportFormat } from "@/lib/export";

const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "svg", label: "SVG · 1:1 (plotter)" },
  { id: "dxf", label: "DXF · geometria 1:1 (CAD)" },
];

export function Footer({
  pattern,
  exportBlocked,
}: {
  pattern: Pattern;
  exportBlocked: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pieceCount = pattern.pieces.reduce((sum, p) => sum + p.qty, 0);
  const exportDisabled = exportBlocked || pattern.pieces.length === 0 || !pattern.spec;

  const handleExport = (format: ExportFormat) => {
    exportPattern(pattern, format);
    setMenuOpen(false);
  };

  return (
    <div className="flex items-center gap-[10px] px-4 py-3 bg-surface border-t border-border">
      <span className="text-[12px] text-muted">
        {exportBlocked
          ? `v${pattern.version} · não exportável com conflito`
          : `${pieceCount} peças · base ${pattern.baseSize} · unidade ${pattern.unit}`}
      </span>
      <div className="flex-1" />

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
            <div className="absolute bottom-full right-0 mb-1 z-20 min-w-[180px] py-1 bg-surface border border-border rounded-item shadow-card">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => handleExport(fmt.id)}
                  className="block w-full text-left text-[12.5px] px-3 py-2 hover:bg-surface-alt transition-colors"
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        className="text-[12.5px] font-semibold px-4 py-2 rounded-btn bg-olive text-[#f7f7f2] hover:bg-olive-dark transition-colors"
      >
        Salvar versão
      </button>
    </div>
  );
}
