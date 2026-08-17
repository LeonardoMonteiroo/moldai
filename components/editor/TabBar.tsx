"use client";

import { useState } from "react";
import { EditorTab } from "@/lib/store";
import { ALL_SIZES, SizeLabel } from "@/lib/types";

const TABS: { id: EditorTab; label: string }[] = [
  { id: "pattern2d", label: "Molde 2D" },
  { id: "proof3d", label: "Prova 3D" },
  { id: "techsheet", label: "Ficha técnica" },
  { id: "cutplan", label: "Plano de corte" },
];

function SizeSelector({ baseSize }: { baseSize: SizeLabel }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-muted-2 border-border rounded-btn bg-surface hover:bg-surface-alt border px-[11px] py-[6px] text-[12px] transition-colors"
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
          <div className="bg-surface border-border rounded-item shadow-card absolute top-full right-0 z-20 mt-1 min-w-[190px] border p-2">
            <div className="flex gap-[5px] px-1 pb-2 text-[11.5px]">
              {ALL_SIZES.map((size) => (
                <span
                  key={size}
                  className={[
                    "rounded-[6px] px-[7px] py-[3px] font-semibold",
                    size === baseSize
                      ? "bg-olive-tint text-olive"
                      : "text-placeholder",
                  ].join(" ")}
                >
                  {size}
                </span>
              ))}
            </div>
            <div className="border-line flex items-center gap-[6px] border-t px-1 pt-2">
              <span className="text-olive bg-olive-tint rounded-[5px] px-[6px] py-[2px] text-[10px] font-semibold tracking-[.6px] uppercase">
                em breve
              </span>
              <span className="text-muted text-[11px] leading-tight">
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
    <div className="bg-surface border-border flex items-center gap-2 border-b px-4 py-[11px]">
      <div className="bg-paper border-border rounded-item flex gap-[2px] border p-[3px]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChangeTab(tab.id)}
            className={[
              "rounded-[6px] px-[11px] py-[5px] text-[12px] transition-colors",
              tab.id === activeTab
                ? "bg-surface shadow-card font-semibold"
                : "text-muted-2 hover:text-ink",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <SizeSelector baseSize={baseSize} />
      {activeTab === "pattern2d" && (
        <button
          onClick={onToggleDetails}
          disabled={!hasSelectedPiece}
          className={[
            "rounded-btn border px-[11px] py-[6px] text-[12px] font-medium transition-colors disabled:opacity-40",
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
