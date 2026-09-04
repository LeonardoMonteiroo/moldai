"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { EditorTab, useEditorStore } from "@/lib/store";
import { useCanvasViewport } from "@/lib/canvas/useCanvasViewport";
import {
  measureSeams,
  measureSeamGraph,
  draftGradedOverlays,
} from "@/lib/draft/engine/facade";
import { DEFAULT_ENGINE_ID } from "@/lib/draft/engine/capability";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TabBar } from "./TabBar";
import { ExportModal, exportVariantForTab } from "./ExportModal";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { PatternCanvas } from "./PatternCanvas";
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
  // EDCH-02/EDCH-04: exportDisabled/exportDisabledTitle/statusText moved
  // here from the now-deleted Footer.tsx -- same Footer.* keys (see
  // spec.md's Out of Scope: that namespace already backs ExportFormatList
  // on the /export screen too, not 1:1 with a component).
  const tFooter = useTranslations("Footer");
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
  const [exportModalOpen, setExportModalOpen] = useState(false);

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
      return measureSeams(DEFAULT_ENGINE_ID, spec, baseMeasurements, tData);
    } catch {
      // No usable spec: the card and the markers fall back to the difference
      // alone, rather than the whole canvas failing to render.
      return null;
    }
  }, [conflict, spec, baseMeasurements, tData]);

  // #134: the FULL seam graph, re-derived the same way `seams` above always
  // has been (never read off the persisted ConflictInfo, which only ever
  // carries `diffCm` per entry) -- ConflictInfoCard/PatternCanvas match each
  // of `conflict.entries`' own divergences back to its measured lengths here
  // by `key`.
  const seamGraph = useMemo(() => {
    if (!conflict?.entries || !spec || !baseMeasurements) return null;
    try {
      return measureSeamGraph(DEFAULT_ENGINE_ID, spec, baseMeasurements, tData);
    } catch {
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
        DEFAULT_ENGINE_ID,
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

  // Moved from Footer.tsx verbatim (#115/#116/#17 -- see that history):
  // copies-to-cut summed across pieces, not the piece count; one disabled
  // reason per cause; an enabled Exportar is just a link, no title needed.
  const conflictActive = conflict !== null;
  const exportDisabled =
    conflictActive || isGenerating || pattern.pieces.length === 0 || !spec;
  const exportTitle = conflictActive
    ? tFooter("exportDisabledConflictTitle")
    : isGenerating
      ? tFooter("exportDisabledGeneratingTitle")
      : pattern.pieces.length === 0 || !spec
        ? tFooter("exportDisabledBlankTitle")
        : undefined;
  const copyCount = pattern.pieces.reduce((sum, p) => sum + p.qty, 0);
  const statusText = conflictActive
    ? tFooter("statusConflict", { version: pattern.version })
    : isGenerating
      ? tFooter("statusGenerating")
      : tFooter("statusReady", {
          copyCount,
          baseSize: pattern.baseSize,
          unit: pattern.unit,
        });

  const exportVariant = exportVariantForTab(activeTab);

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as EditorTab)}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-0"
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
            onExport={() => setExportModalOpen(true)}
            exportDisabled={exportDisabled}
            exportTitle={exportTitle}
          />
        )}

        <TabsContent
          value="pattern2d"
          className="pattern-grid bg-paper relative min-h-[300px] overflow-hidden p-[22px]"
        >
          <div
            className={[
              // EDCH-03: top-[58px] (Editor.dc.html:227) clears the floating
              // tab bar's ~46px height + margin, replacing the old top-[22px]
              // that assumed a flow-reserved static row above the canvas.
              "absolute top-[58px] bottom-[22px] left-[22px] transition-[right] duration-200",
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
              seamGraph={seamGraph}
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
          {!isGenerating &&
            hasPieces &&
            (activeTool === "measure" || measurements.length > 0) && (
              // The vertical select/measure tool column is gone: Editor.dc.html
              // has no such control, and its measure toggle lives in the
              // bottom-right zoom cluster instead (see ZoomControls). What stays
              // here is only what the measure tool itself needs while active --
              // its pointer-only note and "Limpar medições" -- which the design
              // depicts nowhere, so they keep this documented placement rather
              // than the bottom-left corner the status pill now claims.
              <div className="absolute top-[54px] left-4 z-10 flex flex-col items-start gap-2">
                {activeTool === "measure" && (
                  <p className="bg-surface border-border rounded-item shadow-card text-meta text-muted-2 max-w-[220px] border px-[10px] py-[7px]">
                    {t("measurePointerOnlyNote")}
                  </p>
                )}
                {measurements.length > 0 && (
                  <Button
                    variant="outline"
                    size="chrome"
                    onClick={clearMeasurements}
                    className="text-muted-2 shadow-card"
                  >
                    {t("clearMeasurementsButton")}
                  </Button>
                )}
              </div>
            )}
          {!isGenerating && hasPieces && (
            <ZoomControls
              scale={vp.scale}
              onZoomIn={vp.zoomIn}
              onZoomOut={vp.zoomOut}
              onFit={vp.fitToScreen}
              measureActive={activeTool === "measure"}
              onToggleMeasure={() =>
                setActiveTool(activeTool === "measure" ? "cursor" : "measure")
              }
            />
          )}
          {!isGenerating && (
            // EDCH-04: the status line moved here from Footer.tsx, as a
            // floating pill at the canvas's bottom-left corner
            // (Editor.dc.html:487-489).
            <div
              role="status"
              className="bg-surface/86 border-border text-muted shadow-card text-meta absolute bottom-4 left-4 z-10 flex h-[30px] items-center gap-2 rounded-full border px-3 backdrop-blur-sm"
            >
              {statusText}
            </div>
          )}
          {!isGenerating && conflict && (
            <ConflictInfoCard
              conflict={conflict}
              armholeLenCm={seams?.armholeLenCm}
              sleeveArmholeCm={seams?.sleeveArmholeCm}
              seamGraph={seamGraph}
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
        {/* EDCH-03: pt-[58px] on each panel clears the floating tab bar that
          now overlays the top of every tab, not just pattern2d -- the same
          58px PatternCanvas's own inset uses. The tab's own content
          (Proof3DTab/TechSheetTab/CutPlanTab) is out of scope; this is only
          the shared wrapper's clearance. */}
        <TabsContent
          value="proof3d"
          className="flex min-h-0 flex-1 flex-col pt-[58px]"
        >
          <Proof3DTab />
        </TabsContent>
        <TabsContent
          value="techsheet"
          className="flex min-h-0 flex-1 flex-col pt-[58px]"
        >
          <TechSheetTab pattern={pattern} />
        </TabsContent>
        <TabsContent
          value="cutplan"
          className="flex min-h-0 flex-1 flex-col pt-[58px]"
        >
          <CutPlanTab pattern={pattern} />
        </TabsContent>
      </Tabs>
      {exportVariant && (
        <ExportModal
          pattern={pattern}
          variant={exportVariant}
          conflictActive={conflictActive}
          open={exportModalOpen}
          onOpenChange={setExportModalOpen}
        />
      )}
    </>
  );
}
