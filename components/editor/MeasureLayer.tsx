import type { Measurement, Point } from "@/lib/types";
import { distanceCm } from "@/lib/canvas/measure";
import { formatCm } from "@/lib/format";

// #107: was `.toFixed(1)` with no comma replace at all -- the measure tool's
// on-canvas distance rendered "12.3 cm" in a pt-BR interface, next to the
// seam labels beside it which already got the comma right.
function label(a: Point, b: Point): string {
  return `${formatCm(distanceCm(a, b))} cm`;
}

export function MeasureLayer({
  measurements,
  pending,
  cursor,
  snap,
  scale,
  onRemove,
}: {
  measurements: Measurement[];
  pending: Point | null;
  cursor: Point | null;
  snap: Point | null;
  scale: number;
  onRemove?: (id: string) => void;
}) {
  const fs = 12 / scale; // font-size constant on screen
  const r = 3 / scale; // tick radius constant on screen
  const mid = (a: Point, b: Point) => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  });

  return (
    <g>
      {measurements.map((m) => {
        const c = mid(m.a, m.b);
        return (
          <g
            key={m.id}
            onClick={
              onRemove
                ? (e) => {
                    e.stopPropagation();
                    onRemove(m.id);
                  }
                : undefined
            }
            className={onRemove ? "cursor-pointer" : undefined}
          >
            <line
              x1={m.a.x}
              y1={m.a.y}
              x2={m.b.x}
              y2={m.b.y}
              className="stroke-olive"
              style={{ strokeWidth: 1.4 }}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={m.a.x} cy={m.a.y} r={r} className="fill-olive" />
            <circle cx={m.b.x} cy={m.b.y} r={r} className="fill-olive" />
            <text
              x={c.x}
              y={c.y - fs * 0.4}
              textAnchor="middle"
              className="fill-ink"
              style={{ fontSize: fs }}
            >
              {label(m.a, m.b)}
            </text>
          </g>
        );
      })}

      {pending && cursor && (
        <g>
          <line
            x1={pending.x}
            y1={pending.y}
            x2={cursor.x}
            y2={cursor.y}
            className="stroke-olive"
            style={{ strokeWidth: 1.2, strokeDasharray: "5 4" }}
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={pending.x} cy={pending.y} r={r} className="fill-olive" />
          <text
            x={(pending.x + cursor.x) / 2}
            y={(pending.y + cursor.y) / 2 - fs * 0.4}
            textAnchor="middle"
            className="fill-muted"
            style={{ fontSize: fs }}
          >
            {label(pending, cursor)}
          </text>
        </g>
      )}

      {snap && (
        <circle
          cx={snap.x}
          cy={snap.y}
          r={5 / scale}
          className="stroke-olive fill-none"
          style={{ strokeWidth: 1.5 }}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}
