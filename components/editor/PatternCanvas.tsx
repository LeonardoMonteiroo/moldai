import { RefObject, useEffect, useMemo, useRef, useState } from "react";
import {
  ConflictInfo,
  Piece,
  PieceOutline,
  Point,
  Measurement,
} from "@/lib/types";
import { EditorTool } from "@/lib/store";
import { Viewport, ZOOM_STEP } from "@/lib/canvas/viewport";
import { nearestSnap } from "@/lib/canvas/measure";
import { fitPieceLabel, pieceLabelText } from "@/lib/canvas/pieceLabel";
import { formatCm } from "@/lib/format";
import { MeasureLayer } from "./MeasureLayer";

const SEAM_LABEL_FONT_SIZE = 10;
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

  // detectConflict builds the markers in [pieceAId, pieceBId] order — the body's
  // armhole first, then the sleeve cap — and drops any piece whose vertices are
  // missing, which a blob drafted before the measure tool's snap can be. Label
  // them only when both survived, so a collapsed array can never print the
  // body's length beside the sleeve.
  const seamLabels =
    conflict &&
    conflict.markers.length === 2 &&
    armholeLenCm != null &&
    sleeveArmholeCm != null
      ? [seamValue(armholeLenCm), seamValue(sleeveArmholeCm)]
      : null;

  // ~10px screen snap threshold converted to user units, read from the CTM at
  // the moment of the event (exact, not the render-time value)
  const thresholdUser = () => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    return ctm
      ? 10 / ctm.a
      : (10 * viewport.w) / (svg?.clientWidth || viewport.w);
  };

  // mouse wheel = zoom-at-cursor (both tools); non-passive listener for preventDefault
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      onWheelZoom(e.clientX, e.clientY, factor);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [svgRef, onWheelZoom]);

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
        return (
          <g
            key={piece.id}
            data-piece-id={piece.id}
            className={activeTool === "cursor" ? "cursor-pointer" : undefined}
          >
            {piece.guideOutline && (
              <OutlineShape
                outline={piece.guideOutline}
                className="stroke-pattern-guide fill-none"
                style={{ strokeWidth: 1.1, strokeDasharray: "5 4" }}
              />
            )}
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
            {piece.dart && (
              <path
                d={piece.dart.d}
                className="stroke-olive fill-none"
                style={{ strokeWidth: 1.2 }}
              />
            )}
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
        conflict.markers.map((marker, i) => (
          <g key={i}>
            <circle
              cx={marker.cx}
              cy={marker.cy}
              r={marker.r}
              className="stroke-alert fill-none"
              style={{ strokeWidth: 2, strokeDasharray: "4 3" }}
            />
            {seamLabels && (
              // Anchored outside the circle, growing away from the piece: the
              // markers sit at each piece's right edge, so this lands on grid.
              <text
                x={marker.cx + marker.r + 4}
                y={marker.cy + 3.5}
                className="fill-alert"
                style={{ fontSize: SEAM_LABEL_FONT_SIZE }}
              >
                {seamLabels[i]}
              </text>
            )}
          </g>
        ))}

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
