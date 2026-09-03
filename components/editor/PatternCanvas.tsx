import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import {
  ConflictInfo,
  Piece,
  PieceOutline,
  Point,
  Measurement,
  resolvePieceInternals,
} from "@/lib/types";
import { EditorTool } from "@/lib/store";
import type { GradedOverlay, SeamMeasurement } from "@/lib/draft/garment";
import { Viewport, ZOOM_STEP } from "@/lib/canvas/viewport";
import { nearestSnap } from "@/lib/canvas/measure";
import { fitPieceLabel, pieceLabelText } from "@/lib/canvas/pieceLabel";
import { formatCm } from "@/lib/format";
import { MeasureLayer } from "./MeasureLayer";

const SEAM_LABEL_FONT_SIZE = 10;
const FOLD_LABEL_FONT_SIZE = 9;
// Same cm formatting the sibling MeasureLayer uses for its on-canvas
// distances — a unit suffix, not catalog copy.
const seamValue = (v: number) => `${formatCm(v)} cm`;

function OutlineShape({
  outline,
  className,
  style,
}: {
  outline: PieceOutline;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (outline.kind === "polygon") {
    return (
      <polygon points={outline.points} className={className} style={style} />
    );
  }
  return <path d={outline.d} className={className} style={style} />;
}

export function PatternCanvas({
  pieces,
  selectedPieceId,
  conflict,
  dimmed,
  viewport,
  scale,
  activeTool,
  measurements,
  svgRef,
  onSelectPiece,
  onWheelZoom,
  onPan,
  screenToUser,
  onAddMeasurement,
  onRemoveMeasurement,
  armholeLenCm,
  sleeveArmholeCm,
  seamGraph,
  gradedOverlays = [],
  foldLabel,
}: {
  pieces: Piece[];
  selectedPieceId: string | null;
  conflict: ConflictInfo | null;
  dimmed?: boolean;
  viewport: Viewport;
  scale: number;
  activeTool: EditorTool;
  measurements: Measurement[];
  svgRef: RefObject<SVGSVGElement | null>;
  onSelectPiece: (id: string) => void;
  onWheelZoom: (clientX: number, clientY: number, factor: number) => void;
  onPan: (dxScreen: number, dyScreen: number) => void;
  screenToUser: (clientX: number, clientY: number) => Point;
  onAddMeasurement: (a: Point, b: Point) => void;
  onRemoveMeasurement: (id: string) => void;
  // The two divergent seam lengths behind `conflict`, derived from the pattern's
  // spec by the caller (lib/draft's measureSeams) rather than read off the
  // persisted ConflictInfo, which never carried them.
  armholeLenCm?: number;
  sleeveArmholeCm?: number;
  // #134: the FULL seam graph, re-derived by the caller (measureSeamGraph)
  // the same way armholeLenCm/sleeveArmholeCm above always have been --
  // matched to each of `conflict.entries` by `key` for the per-entry marker
  // labels below.
  seamGraph?: SeamMeasurement[] | null;
  // #59: one dashed outline per applied graduation size, already aligned onto
  // its piece's placed position by the caller (CanvasArea, via
  // draftGradedOverlays) -- this component only renders them.
  gradedOverlays?: GradedOverlay[];
  // #126: pt-BR "dobra" from the PatternData catalog, resolved by the caller
  // (CanvasArea) -- this presentational component never calls useTranslations.
  foldLabel?: string;
}) {
  const [pending, setPending] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [snap, setSnap] = useState<Point | null>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const downPieceId = useRef<string | null>(null);

  const snapPoints = useMemo(
    () => pieces.flatMap((p) => p.vertices ?? []),
    [pieces],
  );

  // #134: legacy fallback -- a conflict persisted before `entries` existed
  // has none, and detectConflict built its single markers pair in
  // [pieceAId, pieceBId] order (the body's armhole first, then the sleeve
  // cap), dropping any piece whose vertices are missing (a blob drafted
  // before the measure tool's snap can be). A live conflict (always carries
  // `entries` now) is labelled per-entry below instead, from each entry's
  // own aLenCm/bLenCm rather than these two props.
  const legacySeamLabels =
    conflict &&
    !conflict.entries &&
    conflict.markers.length === 2 &&
    armholeLenCm != null &&
    sleeveArmholeCm != null
      ? [seamValue(armholeLenCm), seamValue(sleeveArmholeCm)]
      : null;

  const seamMeasurementsByKey = useMemo(
    () => new Map((seamGraph ?? []).map((m) => [m.key, m])),
    [seamGraph],
  );

  // ~10px screen snap threshold converted to user units, read from the CTM at
  // the moment of the event (exact, not the render-time value)
  const thresholdUser = () => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    return ctm
      ? 10 / ctm.a
      : (10 * viewport.w) / (svg?.clientWidth || viewport.w);
  };

  // Ctrl/⌘ + wheel = zoom-at-cursor; a plain wheel pans instead.
  //
  // A bare wheel used to zoom, which made an ordinary two-finger trackpad
  // scroll over the canvas rocket the zoom: every tick multiplies by
  // ZOOM_STEP, and one gesture emits dozens of them (~12 ticks is already
  // 3.1x), leaving the pattern far off-screen with no obvious way back.
  // Ctrl-to-zoom is the convention every canvas tool uses, and a trackpad
  // pinch natively arrives as a wheel event with ctrlKey set, so pinch-zoom
  // keeps working untouched. Non-passive listener, for preventDefault.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
        onWheelZoom(e.clientX, e.clientY, factor);
        return;
      }
      // Same handler the drag gesture uses, so both pans agree on direction:
      // scrolling down moves the content up, like dragging upward.
      onPan(-e.deltaX, -e.deltaY);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [svgRef, onWheelZoom, onPan]);

  // switching tools clears the preview ("adjust state on prop change" pattern)
  const [prevTool, setPrevTool] = useState(activeTool);
  if (prevTool !== activeTool) {
    setPrevTool(activeTool);
    setPending(null);
    setSnap(null);
    setCursor(null);
  }

  // Esc cancels the pending point while the measure tool is active
  useEffect(() => {
    if (activeTool !== "measure") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPending(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTool]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool !== "cursor") return;
    // Read the real target now, before setPointerCapture below makes the
    // browser retarget the eventual click to the capturing <svg> — see
    // handlePointerUp, which is what actually resolves the selection.
    downPieceId.current =
      (e.target as Element)
        .closest?.("[data-piece-id]")
        ?.getAttribute("data-piece-id") ?? null;
    drag.current = { x: e.clientX, y: e.clientY };
    dragStart.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeTool === "cursor") {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      onPan(dx, dy);
      drag.current = { x: e.clientX, y: e.clientY };
      if (
        dragStart.current &&
        Math.abs(e.clientX - dragStart.current.x) +
          Math.abs(e.clientY - dragStart.current.y) >
          3
      ) {
        moved.current = true;
      }
      return;
    }
    // measure tool: preview + snap
    const u = screenToUser(e.clientX, e.clientY);
    const s = nearestSnap(u, snapPoints, thresholdUser());
    setSnap(s);
    setCursor(s ?? u);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeTool === "cursor") {
      if (!moved.current && downPieceId.current) {
        onSelectPiece(downPieceId.current);
      }
      downPieceId.current = null;
      drag.current = null;
      dragStart.current = null;
      svgRef.current?.releasePointerCapture(e.pointerId);
    }
  };

  // click on the SVG background: while measuring, places/finalizes points
  const handleClick = (e: React.MouseEvent) => {
    if (activeTool !== "measure") return;
    const u = screenToUser(e.clientX, e.clientY);
    const s = nearestSnap(u, snapPoints, thresholdUser());
    const point = s ?? u;
    if (!pending) {
      setPending(point);
    } else {
      onAddMeasurement(pending, point);
      setPending(null);
    }
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`}
      className="h-full w-full transition-opacity duration-300"
      style={{
        opacity: dimmed ? 0.4 : 1,
        cursor: activeTool === "measure" ? "crosshair" : "grab",
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
    >
      {pieces.map((piece) => {
        const isSelected = piece.id === selectedPieceId;
        const labelText = pieceLabelText(piece);
        const label = fitPieceLabel(piece, labelText);
        const overlays = gradedOverlays.filter((o) => o.pieceId === piece.id);
        // #51: selecting a piece by pointer only ever fires while the cursor
        // tool is active (handlePointerDown/Up above both gate on it) --
        // keyboard selection mirrors that instead of introducing a new mode
        // the pointer path never had.
        const selectable = activeTool === "cursor";
        return (
          <g
            key={piece.id}
            data-piece-id={piece.id}
            tabIndex={selectable ? 0 : undefined}
            role={selectable ? "button" : undefined}
            aria-pressed={selectable ? isSelected : undefined}
            aria-label={selectable ? labelText : undefined}
            className={
              selectable
                ? "focus-visible:outline-olive cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
                : undefined
            }
            onKeyDown={
              selectable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectPiece(piece.id);
                    }
                  }
                : undefined
            }
          >
            {piece.guideOutline && (
              <OutlineShape
                outline={piece.guideOutline}
                className="stroke-pattern-guide fill-none"
                style={{ strokeWidth: 1.1, strokeDasharray: "5 4" }}
              />
            )}
            {overlays.map((overlay) => (
              <OutlineShape
                key={overlay.size}
                outline={overlay.outline}
                className="stroke-pattern-guide fill-none"
                style={{ strokeWidth: 1.1, strokeDasharray: "5 4" }}
              />
            ))}
            <OutlineShape
              outline={piece.outline}
              className={
                isSelected
                  ? "fill-olive-tint stroke-ink"
                  : "stroke-ink fill-white"
              }
              style={{ strokeWidth: 1.7 }}
            />
            {piece.grainline && (
              <line
                x1={piece.grainline.x1}
                y1={piece.grainline.y1}
                x2={piece.grainline.x2}
                y2={piece.grainline.y2}
                className="stroke-olive"
                style={{ strokeWidth: 1.2, strokeDasharray: "7 5" }}
              />
            )}
            {/* #127: darts (now possibly more than one), each dart's own
                fold line, and its drill hole(s) -- resolvePieceInternals()
                falls back to the legacy `piece.darts` field for a pattern
                drafted before this channel existed, so an old blob keeps
                rendering its dart(s) with no reset migration. Each kind
                renders as a visually distinct element/dash so they read
                apart on canvas. */}
            {resolvePieceInternals(piece).map((entry, i) => {
              switch (entry.kind) {
                case "dart":
                case "pleat":
                case "styleLine":
                  return (
                    <path
                      key={i}
                      d={entry.d}
                      data-internal-kind={entry.kind}
                      className="stroke-olive fill-none"
                      style={
                        entry.kind === "dart"
                          ? { strokeWidth: 1.2 }
                          : { strokeWidth: 1.2, strokeDasharray: "3 2" }
                      }
                    />
                  );
                case "foldLine":
                  // A dart's own press line -- distinct from both the
                  // dart's solid legs above and the piece's cut-on-fold
                  // axis rendered further below (its own longer chain-dash).
                  return (
                    <line
                      key={i}
                      x1={entry.x1}
                      y1={entry.y1}
                      x2={entry.x2}
                      y2={entry.y2}
                      data-internal-kind="foldLine"
                      className="stroke-olive"
                      style={{ strokeWidth: 0.8, strokeDasharray: "2 2" }}
                    />
                  );
                case "drillHole":
                  return (
                    <circle
                      key={i}
                      cx={entry.x}
                      cy={entry.y}
                      r={Math.max(2, entry.r)}
                      data-internal-kind="drillHole"
                      className="stroke-ink fill-none"
                      style={{ strokeWidth: 1 }}
                    />
                  );
                case "placementMark":
                  return (
                    <circle
                      key={i}
                      cx={entry.x}
                      cy={entry.y}
                      r={2}
                      data-internal-kind="placementMark"
                      className="fill-ink"
                    />
                  );
                default:
                  return null;
              }
            })}
            {/* #124: a short tick from the outline inward at each notch --
                single/double/triple are told apart purely by how far the
                tick reaches (NOTCH_DEPTH_CM), matching the printed/exported
                marks rather than a second visual channel like color or
                width. */}
            {piece.notches?.map((notch, i) => (
              <line
                key={i}
                x1={notch.x1}
                y1={notch.y1}
                x2={notch.x2}
                y2={notch.y2}
                className="stroke-ink"
                style={{ strokeWidth: 1.5 }}
              />
            ))}
            {piece.foldEdge &&
              piece.vertices &&
              (() => {
                const [ai, bi] = piece.foldEdge!;
                const a = piece.vertices![ai];
                const b = piece.vertices![bi];
                if (!a || !b) return null;
                // #126: a chain dash (long-short), distinct from the
                // grainline's even dash and the graded overlay's uniform
                // one, matching the cut-on-fold symbol convention.
                return (
                  <g>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      className="stroke-ink"
                      style={{ strokeWidth: 1, strokeDasharray: "8 2 2 2" }}
                    />
                    {foldLabel && (
                      <text
                        x={(a.x + b.x) / 2 + 4}
                        y={(a.y + b.y) / 2}
                        className="fill-muted"
                        style={{ fontSize: FOLD_LABEL_FONT_SIZE }}
                      >
                        {foldLabel}
                      </text>
                    )}
                  </g>
                );
              })()}
            <text
              x={label.x}
              y={label.y}
              className="fill-muted"
              style={{ fontSize: label.fontSize }}
            >
              {label.text}
            </text>
          </g>
        );
      })}

      {conflict &&
        !conflict.entries &&
        conflict.markers.map((marker, i) => (
          <g key={i}>
            <circle
              cx={marker.cx}
              cy={marker.cy}
              r={marker.r}
              className="stroke-alert fill-none"
              style={{ strokeWidth: 2, strokeDasharray: "4 3" }}
            />
            {legacySeamLabels && (
              // Anchored outside the circle, growing away from the piece: the
              // markers sit at each piece's right edge, so this lands on grid.
              <text
                x={marker.cx + marker.r + 4}
                y={marker.cy + 3.5}
                className="fill-alert"
                style={{ fontSize: SEAM_LABEL_FONT_SIZE }}
              >
                {legacySeamLabels[i]}
              </text>
            )}
          </g>
        ))}

      {/* #134: one marker pair per divergent seam, each labelled from the
          FRESHLY re-derived measurement matching its entry's own `key`
          (seamMeasurementsByKey) -- ConflictInfo itself only persists the
          entry's diffCm, not the two lengths, the same rule the legacy
          branch above already followed. */}
      {conflict?.entries?.flatMap((entry) => {
        const measurement = seamMeasurementsByKey.get(entry.key);
        return entry.markers.map((marker, i) => (
          <g key={`${entry.key}-${i}`}>
            <circle
              cx={marker.cx}
              cy={marker.cy}
              r={marker.r}
              className="stroke-alert fill-none"
              style={{ strokeWidth: 2, strokeDasharray: "4 3" }}
            />
            {entry.markers.length === 2 && measurement && (
              <text
                x={marker.cx + marker.r + 4}
                y={marker.cy + 3.5}
                className="fill-alert"
                style={{ fontSize: SEAM_LABEL_FONT_SIZE }}
              >
                {seamValue(i === 0 ? measurement.aLenCm : measurement.bLenCm)}
              </text>
            )}
          </g>
        ));
      })}

      <MeasureLayer
        measurements={measurements}
        pending={pending}
        cursor={cursor}
        snap={snap}
        scale={scale}
        onRemove={activeTool === "measure" ? onRemoveMeasurement : undefined}
      />
    </svg>
  );
}
