"use client";

import { Pattern } from "@/lib/types";

export function Footer({
  pattern,
  exportBlocked,
}: {
  pattern: Pattern;
  exportBlocked: boolean;
}) {
  const pieceCount = pattern.pieces.reduce((sum, p) => sum + p.qty, 0);

  return (
    <div className="flex items-center gap-[10px] px-4 py-3 bg-surface border-t border-border">
      <span className="text-[12px] text-muted">
        {exportBlocked
          ? `v${pattern.version} · não exportável com conflito`
          : `${pieceCount} peças · base ${pattern.baseSize} · unidade ${pattern.unit}`}
      </span>
      <div className="flex-1" />
      <button
        disabled={exportBlocked}
        className="text-[12.5px] font-medium px-[14px] py-2 rounded-btn border transition-colors disabled:cursor-not-allowed disabled:text-disabled disabled:border-disabled-border enabled:border-border enabled:hover:bg-surface-alt"
      >
        Exportar
      </button>
      <button className="text-[12.5px] font-semibold px-4 py-2 rounded-btn bg-olive text-[#f7f7f2] hover:bg-olive-dark transition-colors">
        Salvar versão
      </button>
    </div>
  );
}
