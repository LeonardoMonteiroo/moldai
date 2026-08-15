import { EditorTab } from "@/lib/store";
import { SizeLabel } from "@/lib/types";

const TABS: { id: EditorTab; label: string }[] = [
  { id: "molde2d", label: "Molde 2D" },
  { id: "prova3d", label: "Prova 3D" },
  { id: "ficha", label: "Ficha técnica" },
  { id: "corte", label: "Plano de corte" },
];

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
      <span className="text-[12px] text-muted-2 px-[11px] py-[6px] border border-border rounded-btn bg-surface">
        Tamanho {baseSize} ▾
      </span>
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
