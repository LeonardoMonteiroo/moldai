"use client";

import { useRef } from "react";
import { buildPathD } from "@/lib/export/model";
import { toUser } from "@/lib/canvas/useCanvasViewport";
import { clampOriginCm, type CutPlan } from "@/lib/export/cutplan";

const NUDGE_CM = 1;
const COARSE_NUDGE_CM = 5;

/**
 * #8: the cut-plan nesting preview, extracted out of CutPlanTab so it can
 * carry drag/keyboard interaction for manual mode without bloating the tab.
 * `screenToUser` maps client coords into the fabric-cm user space. It
 * defaults to this component's OWN <svg> via useCanvasViewport's `toUser`;
 * the prop exists only so a test can inject a deterministic mapping. It used
 * to be REQUIRED, and CutPlanTab supplied one backed by an `svgRef` it
 * declared but never attached to any element -- so `svgRef.current` was
 * always null, every drag mapped to {0,0}, dx/dy were always 0 and no piece
 * ever moved. The drag tests passed throughout because they inject the prop
 * and so never exercised the production wiring.
 */
export function CutPlanPreview({
  plan,
  fabricWidthCm,
  manual,
  overlapIds,
  screenToUser,
  onMove,
  onNudgeAnnounce,
  labelFor,
}: {
  plan: CutPlan;
  fabricWidthCm: number;
  manual: boolean;
  overlapIds: string[];
  screenToUser?: (clientX: number, clientY: number) => { x: number; y: number };
  onMove: (id: string, originCm: { x: number; y: number }) => void;
  onNudgeAnnounce: (id: string) => void;
  labelFor: (instance: CutPlan["instances"][number]) => string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const mapPoint =
    screenToUser ??
    ((clientX: number, clientY: number) => {
      const svg = svgRef.current;
      return svg ? toUser(svg, clientX, clientY) : { x: 0, y: 0 };
    });
  const dragRef = useRef<{
    id: string;
    startUser: { x: number; y: number };
    startOrigin: { x: number; y: number };
  } | null>(null);

  function move(
    id: string,
    sizeCm: { widthCm: number; heightCm: number },
    origin: { x: number; y: number },
  ) {
    onMove(id, clampOriginCm(origin, sizeCm, fabricWidthCm));
  }

  function handlePointerDown(e: React.PointerEvent<SVGGElement>, id: string) {
    if (!manual) return;
    const it = plan.instances.find((i) => i.id === id);
    if (!it) return;
    const svg = svgRef.current;
    if (!svg) return;
    dragRef.current = {
      id,
      startUser: mapPoint(e.clientX, e.clientY),
      startOrigin: { ...it.originCm },
    };
    svg.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<SVGGElement>) {
    if (!manual) return;
    const drag = dragRef.current;
    if (!drag) return;
    const it = plan.instances.find((i) => i.id === drag.id);
    if (!it) return;
    const user = mapPoint(e.clientX, e.clientY);
    const dx = user.x - drag.startUser.x;
    const dy = user.y - drag.startUser.y;
    move(it.id, it, {
      x: drag.startOrigin.x + dx,
      y: drag.startOrigin.y + dy,
    });
  }

  function handlePointerUp(e: React.PointerEvent<SVGGElement>) {
    if (!manual) return;
    const svg = svgRef.current;
    if (svg?.hasPointerCapture(e.pointerId))
      svg.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }

  function handleKeyDown(e: React.KeyboardEvent<SVGGElement>, id: string) {
    if (!manual) return;
    const it = plan.instances.find((i) => i.id === id);
    if (!it) return;
    const step = e.shiftKey ? COARSE_NUDGE_CM : NUDGE_CM;
    let dx = 0;
    let dy = 0;
    switch (e.key) {
      case "ArrowLeft":
        dx = -step;
        break;
      case "ArrowRight":
        dx = step;
        break;
      case "ArrowUp":
        dy = -step;
        break;
      case "ArrowDown":
        dy = step;
        break;
      default:
        return;
    }
    e.preventDefault();
    move(it.id, it, { x: it.originCm.x + dx, y: it.originCm.y + dy });
    onNudgeAnnounce(id);
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${fabricWidthCm} ${plan.lengthCm}`}
      className="h-auto w-full"
      style={{ maxHeight: 460 }}
      preserveAspectRatio="xMidYMin meet"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Fabric-weave texture behind the pieces -- matches the design
          reference's legend row (Fundo / Tecido / Peça do molde), which
          pairs a plain background swatch with a second, textured "Tecido"
          swatch. Purely decorative: a diagonal hairline pattern over the
          same surface color, no effect on the real geometry below. */}
      <defs>
        <pattern
          id="cutPlanFabricWeave"
          width={3.2}
          height={3.2}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={3.2}
            stroke="var(--color-border)"
            strokeWidth={0.35}
            opacity={0.55}
          />
        </pattern>
      </defs>
      <rect
        x={0}
        y={0}
        width={fabricWidthCm}
        height={plan.lengthCm}
        fill="var(--color-surface)"
        stroke="var(--color-border)"
        strokeWidth={0.6}
      />
      <rect
        x={0}
        y={0}
        width={fabricWidthCm}
        height={plan.lengthCm}
        fill="url(#cutPlanFabricWeave)"
      />
      {plan.instances.map((it) => {
        const overlapping = overlapIds.includes(it.id);
        return (
          <g
            key={it.id}
            data-instance-id={it.id}
            role={manual ? "button" : undefined}
            tabIndex={manual ? 0 : undefined}
            aria-label={manual ? labelFor(it) : undefined}
            className={manual ? "cursor-grab focus:outline-none" : undefined}
            onPointerDown={(e) => handlePointerDown(e, it.id)}
            onKeyDown={(e) => handleKeyDown(e, it.id)}
          >
            <path
              d={buildPathD(
                it.outline.start,
                it.outline.segs,
                (x) => it.originCm.x + x,
                (y) => it.originCm.y + y,
              )}
              fill={
                overlapping
                  ? "var(--color-amber-bg)"
                  : "var(--color-olive-tint)"
              }
              stroke={overlapping ? "var(--color-alert)" : "var(--color-olive)"}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={it.originCm.x + it.widthCm / 2}
              y={it.originCm.y + it.heightCm / 2}
              fontSize={Math.max(3, fabricWidthCm / 34)}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--color-muted-2)"
            >
              {it.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
