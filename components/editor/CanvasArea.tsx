"use client";

import { useEditorStore } from "@/lib/store";
import { TabBar } from "./TabBar";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { PatternCanvas } from "./PatternCanvas";
import { FloatingToolbar } from "./FloatingToolbar";
import { PieceDetailsPanel } from "./PieceDetailsPanel";
import { ConflictInfoCard } from "./ConflictInfoCard";
import { FichaTecnicaTab } from "./FichaTecnicaTab";
import { PlanoCorteTab } from "./PlanoCorteTab";
import { Prova3DTab } from "./Prova3DTab";

export function CanvasArea() {
  const pattern = useEditorStore((s) => s.pattern);
  const conflict = useEditorStore((s) => s.conflict);
  const activeTab = useEditorStore((s) => s.activeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const selectedPieceId = useEditorStore((s) => s.selectedPieceId);
  const selectPiece = useEditorStore((s) => s.selectPiece);
  const detailsPanelOpen = useEditorStore((s) => s.detailsPanelOpen);
  const toggleDetailsPanel = useEditorStore((s) => s.toggleDetailsPanel);
  const activeTool = useEditorStore((s) => s.activeTool);
  const setActiveTool = useEditorStore((s) => s.setActiveTool);
  const generationStatus = useEditorStore((s) => s.generationStatus);
  const generationStepIndex = useEditorStore((s) => s.generationStepIndex);
  const cancelGeneration = useEditorStore((s) => s.cancelGeneration);
  const graduateSizes = useEditorStore((s) => s.graduateSizes);

  if (!pattern) return null;
  const isGenerating = generationStatus === "generating";
  const selectedPiece = pattern.pieces.find((p) => p.id === selectedPieceId) ?? null;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {isGenerating ? (
        <GeneratingOverlay stepIndex={generationStepIndex} onCancel={cancelGeneration} />
      ) : (
        <TabBar
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          baseSize={pattern.baseSize}
          detailsOpen={detailsPanelOpen}
          onToggleDetails={toggleDetailsPanel}
          hasSelectedPiece={selectedPiece !== null && !conflict}
        />
      )}

      {activeTab === "molde2d" && (
        <div className="flex-1 relative pattern-grid bg-paper p-[22px] min-h-[300px] overflow-hidden">
          <PatternCanvas
            pieces={pattern.pieces}
            selectedPieceId={selectedPieceId}
            conflict={conflict}
            onSelectPiece={selectPiece}
            dimmed={isGenerating}
          />
          {!isGenerating && <FloatingToolbar activeTool={activeTool} onSelect={setActiveTool} />}
          {!isGenerating && conflict && <ConflictInfoCard conflict={conflict} />}
          {!isGenerating && !conflict && detailsPanelOpen && selectedPiece && (
            <PieceDetailsPanel
              piece={selectedPiece}
              pattern={pattern}
              onClose={toggleDetailsPanel}
              onGraduate={graduateSizes}
            />
          )}
        </div>
      )}
      {activeTab === "prova3d" && <Prova3DTab />}
      {activeTab === "ficha" && <FichaTecnicaTab pattern={pattern} />}
      {activeTab === "corte" && <PlanoCorteTab pattern={pattern} />}
    </div>
  );
}
