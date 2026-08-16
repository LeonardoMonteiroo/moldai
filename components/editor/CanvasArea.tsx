"use client";

import { useMemo, useRef } from "react";
import { useEditorStore } from "@/lib/store";
import { useCanvasViewport } from "@/lib/canvas/useCanvasViewport";
import { TabBar } from "./TabBar";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { PatternCanvas } from "./PatternCanvas";
import { FloatingToolbar } from "./FloatingToolbar";
import { ZoomControls } from "./ZoomControls";
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
  const measurements = useEditorStore((s) => s.measurements);
  const addMeasurement = useEditorStore((s) => s.addMeasurement);
  const removeMeasurement = useEditorStore((s) => s.removeMeasurement);
  const clearMeasurements = useEditorStore((s) => s.clearMeasurements);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const vbW = pattern?.viewBox?.w;
  const vbH = pattern?.viewBox?.h;
  const natural = useMemo(() => ({ w: vbW ?? 620, h: vbH ?? 380 }), [vbW, vbH]);
  const version = pattern?.version ?? 0;
  const vp = useCanvasViewport(svgRef, natural, version);

  if (!pattern) return null;
  const isGenerating = generationStatus === "generating";
  const selectedPiece = pattern.pieces.find((p) => p.id === selectedPieceId) ?? null;
  const hasPieces = pattern.pieces.length > 0;

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
            dimmed={isGenerating}
            viewport={vp.viewport}
            scale={vp.scale}
            activeTool={activeTool}
            measurements={measurements}
            svgRef={svgRef}
            onSelectPiece={selectPiece}
            onWheelZoom={vp.zoomAtScreen}
            onPan={vp.panByScreen}
            screenToUser={vp.screenToUser}
            onAddMeasurement={(a, b) => addMeasurement({ id: crypto.randomUUID(), a, b })}
            onRemoveMeasurement={removeMeasurement}
          />
          {!isGenerating && !hasPieces && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6 pointer-events-none">
              <span className="font-display text-[18px] font-semibold text-muted-2">
                Molde em branco
              </span>
              <span className="text-[12.5px] text-muted max-w-[300px]">
                Descreva a peça que você quer no chat ao lado — a IA gera seu primeiro
                molde do zero.
              </span>
            </div>
          )}
          {!isGenerating && hasPieces && (
            <FloatingToolbar activeTool={activeTool} onSelect={setActiveTool} />
          )}
          {!isGenerating && hasPieces && (
            <ZoomControls
              scale={vp.scale}
              onZoomIn={vp.zoomIn}
              onZoomOut={vp.zoomOut}
              onFit={vp.fitToScreen}
            />
          )}
          {!isGenerating && hasPieces && measurements.length > 0 && (
            <button
              onClick={clearMeasurements}
              className="absolute left-5 bottom-5 bg-surface border border-border rounded-item px-3 h-[34px] text-[12px] text-muted-2 hover:bg-surface-alt shadow-card transition-colors"
            >
              Limpar medições
            </button>
          )}
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
