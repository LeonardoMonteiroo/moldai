"use client";

import { Credits, Pattern } from "@/lib/types";
import { useEditorStore } from "@/lib/store";

export function Topbar({ pattern, credits }: { pattern: Pattern; credits: Credits }) {
  const pct = Math.round((credits.balance / credits.total) * 100);
  const resetPattern = useEditorStore((s) => s.resetPattern);

  const handleReset = () => {
    if (window.confirm("Resetar o molde? Isso apaga o molde atual e toda a conversa.")) {
      resetPattern();
    }
  };

  return (
    <div className="flex items-center gap-4 px-[18px] py-3 bg-surface border-b border-border">
      <span className="font-display font-bold text-[19px] tracking-[-0.4px]">
        Mold<span className="text-olive">AI</span>
      </span>
      <div className="w-px h-5 bg-border" />
      <div className="flex flex-col gap-px">
        <span className="text-[13px] font-semibold">{pattern.name}</span>
        <span className="text-[11px] text-muted">
          {pattern.savedAgo} · v{pattern.version}
        </span>
      </div>
      <button
        onClick={handleReset}
        title="Resetar o molde e o chat"
        className="text-[12px] font-medium px-[11px] py-[6px] border border-border rounded-btn bg-surface text-muted-2 hover:bg-surface-alt transition-colors"
      >
        ↺ Resetar
      </button>
      <div className="flex-1" />
      <div className="flex flex-col gap-[5px] w-[168px]">
        <div className="flex justify-between text-[11px] text-muted">
          <span>
            {credits.planLabel} · {credits.balance} créditos
          </span>
          <span>de {credits.total}</span>
        </div>
        <div className="h-[5px] rounded-full bg-track overflow-hidden">
          <div className="h-full bg-olive" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button className="text-[12px] font-medium px-[13px] py-[7px] border border-border rounded-btn bg-surface hover:bg-surface-alt transition-colors">
        Comprar créditos
      </button>
      <div className="w-[30px] h-[30px] rounded-full bg-olive-tint border border-olive-border flex items-center justify-center text-[12px] font-semibold text-olive">
        LU
      </div>
    </div>
  );
}
