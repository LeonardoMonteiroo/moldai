import { RefObject, useCallback, useState } from "react";
import type { Point } from "@/lib/types";
import {
  Viewport,
  Size,
  fit,
  zoomAt,
  zoomByCenter,
  panBy,
  scaleOf,
  ZOOM_STEP,
} from "./viewport";

// #8: exported so CutPlanTab can build the identical screen->user mapping
// for its own SVG (CutPlanPreview's manual-mode drag), the same DOM-coupled
// helper this hook already used internally -- no purity is lost by exporting
// it, since it was already reaching into the DOM (getScreenCTM).
export function toUser(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export function useCanvasViewport(
  svgRef: RefObject<SVGSVGElement | null>,
  natural: Size,
) {
  const [viewport, setViewport] = useState<Viewport>(() => fit(natural));
  // resets the framing when the piece's natural size changes (a new piece),
  // but not on version bumps that don't touch the geometry (e.g. grading a size)
  const [prevSize, setPrevSize] = useState({ w: natural.w, h: natural.h });
  if (prevSize.w !== natural.w || prevSize.h !== natural.h) {
    setPrevSize({ w: natural.w, h: natural.h });
    setViewport(fit(natural));
  }

  const zoomAtScreen = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const focus = toUser(svg, clientX, clientY);
      setViewport((vp) => zoomAt(vp, focus, factor, natural));
    },
    [svgRef, natural],
  );

  const panByScreen = useCallback(
    (dxScreen: number, dyScreen: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const ctm = svg.getScreenCTM();
      const s = ctm && ctm.a ? ctm.a : 1; // screen px per user unit
      setViewport((vp) => panBy(vp, dxScreen / s, dyScreen / s));
    },
    [svgRef],
  );

  const zoomIn = useCallback(
    () => setViewport((vp) => zoomByCenter(vp, ZOOM_STEP, natural)),
    [natural],
  );
  const zoomOut = useCallback(
    () => setViewport((vp) => zoomByCenter(vp, 1 / ZOOM_STEP, natural)),
    [natural],
  );
  const fitToScreen = useCallback(() => setViewport(fit(natural)), [natural]);

  const screenToUser = useCallback(
    (clientX: number, clientY: number): Point => {
      const svg = svgRef.current;
      return svg ? toUser(svg, clientX, clientY) : { x: 0, y: 0 };
    },
    [svgRef],
  );

  return {
    viewport,
    zoomAtScreen,
    panByScreen,
    zoomIn,
    zoomOut,
    fitToScreen,
    scale: scaleOf(viewport, natural),
    screenToUser,
  };
}
