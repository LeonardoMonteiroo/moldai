"use client";

import { useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { useEditorStore } from "@/lib/store";
import { useCanvasViewport } from "@/lib/canvas/useCanvasViewport";
import { TabBar } from "./TabBar";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { PatternCanvas } from "./PatternCanvas";
import { FloatingToolbar } from "./FloatingToolbar";
import { ZoomControls } from "./ZoomControls";
import { PieceDetailsPanel } from "./PieceDetailsPanel";
import { ConflictInfoCard } from "./ConflictInfoCard";
import { TechSheetTab } from "./TechSheetTab";
import { CutPlanTab } from "./CutPlanTab";
import { Proof3DTab } from "./Proof3DTab";

export function CanvasArea() {
  const t = useTranslations("CanvasArea");
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
  const vp = useCanvasViewport(svgRef, natural);

  if (!pattern) return null;
  const isGenerating = generationStatus === "generating";
  const selectedPiece =
    pattern.pieces.find((p) => p.id === selectedPieceId) ?? null;
  const hasPieces = pattern.pieces.length > 0;
  // A floating panel occupies the canvas's right corner (conflict or details).
  // We reserve that strip so the drawing doesn't end up hidden behind it.
  const rightOverlayOpen =
    !isGenerating && (!!conflict || (detailsPanelOpen && !!selectedPiece));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {isGenerating ? (
        <GeneratingOverlay
          stepIndex={generationStepIndex}
          onCancel={cancelGeneration}
        />
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

      {activeTab === "pattern2d" && (
        <div className="pattern-grid bg-paper relative min-h-[300px] flex-1 overflow-hidden p-[22px]">
          <div
            className={[
              "absolute top-[22px] bottom-[22px] left-[22px] transition-[right] duration-200",
              rightOverlayOpen ? "right-[268px]" : "right-[22px]",
            ].join(" ")}
          >
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
              onAddMeasurement={(a, b) =>
                addMeasurement({ id: crypto.randomUUID(), a, b })
              }
              onRemoveMeasurement={removeMeasurement}
            />
          </div>
          {!isGenerating && !hasPieces && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <span className="font-display text-muted-2 text-[18px] font-semibold">
                {t("emptyStateTitle")}
              </span>
              <span className="text-muted max-w-[300px] text-[12.5px]">
                {t("emptyStateDescription")}
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
              className="bg-surface border-border rounded-item text-muted-2 hover:bg-surface-alt shadow-card absolute bottom-5 left-5 h-[34px] border px-3 text-[12px] transition-colors"
            >
              {t("clearMeasurementsButton")}
            </button>
          )}
          {!isGenerating && conflict && (
            <ConflictInfoCard conflict={conflict} />
          )}
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
      {activeTab === "proof3d" && <Proof3DTab />}
      {activeTab === "techsheet" && <TechSheetTab pattern={pattern} />}
      {activeTab === "cutplan" && <CutPlanTab pattern={pattern} />}
    </div>
  );
}
