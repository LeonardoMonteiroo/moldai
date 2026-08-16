"use client";

import { useState } from "react";
import { EditorTab } from "@/lib/store";
import { ALL_SIZES, SizeLabel } from "@/lib/types";

const TABS: { id: EditorTab; label: string }[] = [
  { id: "molde2d", label: "Molde 2D" },
  { id: "prova3d", label: "Prova 3D" },
  { id: "ficha", label: "Ficha técnica" },
  { id: "corte", label: "Plano de corte" },
];

function SizeSelector({ baseSize }: { baseSize: SizeLabel }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[12px] text-muted-2 px-[11px] py-[6px] border border-border rounded-btn bg-surface hover:bg-surface-alt transition-colors"
      >
        Tamanho {baseSize} ▾
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Fechar seletor de tamanho"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full right-0 mt-1 z-20 min-w-[190px] p-2 bg-surface border border-border rounded-item shadow-card">
            <div className="flex gap-[5px] text-[11.5px] px-1 pb-2">
              {ALL_SIZES.map((size) => (
                <span
                  key={size}
                  className={[
                    "px-[7px] py-[3px] rounded-[6px] font-semibold",
                    size === baseSize ? "bg-olive-tint text-olive" : "text-placeholder",
                  ].join(" ")}
                >
                  {size}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-[6px] border-t border-line pt-2 px-1">
              <span className="text-[10px] font-semibold uppercase tracking-[.6px] text-olive bg-olive-tint rounded-[5px] px-[6px] py-[2px]">
                em breve
              </span>
              <span className="text-[11px] text-muted leading-tight">
                Trocar o tamanho-base sem regerar
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function TabBar({
  activeTab,
  onChangeTab,
  baseSize,
  detailsOpen,
  onToggleDetails,
  hasSelectedPiece,
}: {
  activeTab: EditorTab;
  onChangeTab: (tab: EditorTab) => void;
  baseSize: SizeLabel;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  hasSelectedPiece: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-[11px] bg-surface border-b border-border">
      <div className="flex bg-paper border border-border rounded-item p-[3px] gap-[2px]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChangeTab(tab.id)}
            className={[
              "text-[12px] px-[11px] py-[5px] rounded-[6px] transition-colors",
              tab.id === activeTab
                ? "bg-surface font-semibold shadow-card"
                : "text-muted-2 hover:text-ink",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <SizeSelector baseSize={baseSize} />
      {activeTab === "molde2d" && (
        <button
          onClick={onToggleDetails}
          disabled={!hasSelectedPiece}
          className={[
            "text-[12px] font-medium px-[11px] py-[6px] rounded-btn border transition-colors disabled:opacity-40",
            detailsOpen
              ? "border-olive text-olive bg-olive-tint"
              : "border-border bg-surface hover:bg-surface-alt",
          ].join(" ")}
        >
          Detalhes da peça{detailsOpen ? " ✕" : ""}
        </button>
      )}
    </div>
  );
}
