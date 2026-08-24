"use client";

import { useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { EditorTab, useEditorStore } from "@/lib/store";
import { useCanvasViewport } from "@/lib/canvas/useCanvasViewport";
import { measureSeams, draftGradedOverlays } from "@/lib/draft/garment";
import { Tabs, TabsContent } from "@/components/ui/tabs";
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
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export function CanvasArea() {
  const t = useTranslations("CanvasArea");
  const tData = useTranslations("PatternData");
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
  const graduating = useEditorStore((s) => s.graduating);
  const measurements = useEditorStore((s) => s.measurements);
  const addMeasurement = useEditorStore((s) => s.addMeasurement);
  const removeMeasurement = useEditorStore((s) => s.removeMeasurement);
  const clearMeasurements = useEditorStore((s) => s.clearMeasurements);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const vbW = pattern?.viewBox?.w;
  const vbH = pattern?.viewBox?.h;
  const natural = useMemo(() => ({ w: vbW ?? 620, h: vbH ?? 380 }), [vbW, vbH]);
  const vp = useCanvasViewport(svgRef, natural);

  // The two seam lengths a conflict is about, re-derived from the pattern's own
  // spec instead of read off ConflictInfo (which only ever carried their
  // difference) — the same client-side re-draft in exact cm that TechSheetTab and
  // CutPlanTab do through buildExportModel. Memoized because this component
  // re-renders on every pan and zoom frame.
  const spec = pattern?.spec;
  const baseMeasurements = pattern?.baseMeasurements;
  const seams = useMemo(() => {
    if (!conflict || !spec || !baseMeasurements) return null;
    try {
      return measureSeams(spec, baseMeasurements, tData);
    } catch {
      // No usable spec: the card and the markers fall back to the difference
      // alone, rather than the whole canvas failing to render.
      return null;
    }
  }, [conflict, spec, baseMeasurements, tData]);

  // #59: the graduation curve for every applied size, drawn dashed over the
  // base -- recomputed here rather than read off the pattern, the same
  // never-persisted-only-derived precedent `seams` above already follows.
  const sizesApplied = pattern?.sizesApplied;
  const gradedOverlays = useMemo(() => {
    if (!spec || !baseMeasurements || !pattern || !sizesApplied?.length) {
      return [];
    }
    try {
      return draftGradedOverlays(
        spec,
        pattern.pieces,
        baseMeasurements,
        pattern.sizeTable,
        sizesApplied,
        tData,
      );
    } catch {
      return [];
    }
  }, [spec, baseMeasurements, pattern, sizesApplied, tData]);

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
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as EditorTab)}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
    >
      {isGenerating ? (
        <GeneratingOverlay
          stepIndex={generationStepIndex}
          onCancel={cancelGeneration}
        />
      ) : (
        <TabBar
          activeTab={activeTab}
          baseSize={pattern.baseSize}
          sizes={pattern.sizes}
          detailsOpen={detailsPanelOpen}
          onToggleDetails={toggleDetailsPanel}
          hasSelectedPiece={selectedPiece !== null && !conflict}
        />
      )}

      <TabsContent
        value="pattern2d"
        className="pattern-grid bg-paper relative min-h-[300px] overflow-hidden p-[22px]"
      >
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
            armholeLenCm={seams?.armholeLenCm}
            sleeveArmholeCm={seams?.sleeveArmholeCm}
            gradedOverlays={gradedOverlays}
            foldLabel={tData("foldLabel")}
          />
        </div>
        {!isGenerating && !hasPieces && (
          <Empty className="pointer-events-none absolute inset-0">
            <EmptyHeader>
              <EmptyTitle className="font-display text-muted-2">
                {t("emptyStateTitle")}
              </EmptyTitle>
              <EmptyDescription className="max-w-[300px]">
                {t("emptyStateDescription")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {!isGenerating && hasPieces && (
          <div className="absolute top-5 left-5 flex flex-col items-start gap-2">
            <FloatingToolbar activeTool={activeTool} onSelect={setActiveTool} />
            {activeTool === "measure" && (
              <p className="bg-surface border-border rounded-item shadow-card text-meta text-muted-2 max-w-[220px] border px-[10px] py-[7px]">
                {t("measurePointerOnlyNote")}
              </p>
            )}
          </div>
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
          <Button
            variant="outline"
            size="chrome"
            onClick={clearMeasurements}
            className="text-muted-2 shadow-card absolute bottom-5 left-5"
          >
            {t("clearMeasurementsButton")}
          </Button>
        )}
        {!isGenerating && conflict && (
          <ConflictInfoCard
            conflict={conflict}
            armholeLenCm={seams?.armholeLenCm}
            sleeveArmholeCm={seams?.sleeveArmholeCm}
          />
        )}
        {!isGenerating && !conflict && detailsPanelOpen && selectedPiece && (
          <PieceDetailsPanel
            piece={selectedPiece}
            pattern={pattern}
            onClose={toggleDetailsPanel}
            onGraduate={graduateSizes}
            graduating={graduating}
          />
        )}
      </TabsContent>
      <TabsContent value="proof3d" className="flex min-h-0 flex-1 flex-col">
        <Proof3DTab />
      </TabsContent>
      <TabsContent value="techsheet" className="flex min-h-0 flex-1 flex-col">
        <TechSheetTab pattern={pattern} />
      </TabsContent>
      <TabsContent value="cutplan" className="flex min-h-0 flex-1 flex-col">
        <CutPlanTab pattern={pattern} />
      </TabsContent>
    </Tabs>
  );
}
