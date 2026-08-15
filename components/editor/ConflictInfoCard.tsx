import { ConflictInfo } from "@/lib/types";

export function ConflictInfoCard({ conflict }: { conflict: ConflictInfo }) {
  return (
    <div className="absolute right-5 top-5 w-[172px] bg-surface border border-border rounded-card p-3 flex flex-col gap-[7px] shadow-card">
      <span className="text-[11px] font-semibold tracking-[.8px] uppercase text-muted">
        Conflito
      </span>
      <span className="text-[12.5px] font-semibold">{conflict.title}</span>
      <span className="text-[12px] text-alert">diferença {conflict.diffCm.toString().replace(".", ",")} cm</span>
      <div className="h-px bg-line" />
      <span className="text-[11.5px] text-muted-2 leading-[1.45]">{conflict.suggestion}</span>
    </div>
  );
}
