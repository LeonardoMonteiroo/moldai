"use client";

import { useTranslations } from "next-intl";
import { useGradesStore } from "@/lib/gradesStore";

export function GradeLibrary() {
  const t = useTranslations("Grades");
  const tLib = useTranslations("GradeLibrary");
  const grades = useGradesStore((s) => s.grades);
  const selectedId = useGradesStore((s) => s.selectedId);
  const select = useGradesStore((s) => s.select);
  const create = useGradesStore((s) => s.create);

  return (
    <div className="flex w-[230px] shrink-0 flex-col gap-[9px]">
      {grades.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => select(g.id)}
          className={[
            "rounded-item flex flex-col gap-px border p-[11px] text-left transition-colors",
            g.id === selectedId
              ? "border-olive bg-olive-tint"
              : "border-border bg-surface hover:bg-surface-alt",
          ].join(" ")}
        >
          <span className="text-[12.5px] font-semibold">
            {g.name}
            {g.isActive && (
              <span className="text-olive ml-[6px] text-[10px] font-semibold tracking-[.6px] uppercase">
                {tLib("activeBadge")}
              </span>
            )}
          </span>
          <span className="text-muted-2 text-[11.5px]">
            {g.sizes[0]}–{g.sizes[g.sizes.length - 1]} ·{" "}
            {g.isSystem ? tLib("systemBadge") : tLib("customBadge")}
          </span>
        </button>
      ))}

      <div className="flex-1" />

      <div className="border-border rounded-card bg-paper text-muted border border-dashed p-3 text-[12px] leading-relaxed">
        {t("importLabel")}
      </div>

      <button
        type="button"
        onClick={() => create()}
        className="bg-ink rounded-btn px-[13px] py-[9px] text-center text-[12.5px] font-medium text-white transition-[filter] hover:brightness-[0.95]"
      >
        {t("newGradeButton")}
      </button>
    </div>
  );
}
