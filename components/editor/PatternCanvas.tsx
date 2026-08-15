import { ConflictInfo, Piece, PieceOutline } from "@/lib/types";

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
    return <polygon points={outline.points} className={className} style={style} />;
  }
  return <path d={outline.d} className={className} style={style} />;
}

export function PatternCanvas({
  pieces,
  selectedPieceId,
  conflict,
  onSelectPiece,
  dimmed,
}: {
  pieces: Piece[];
  selectedPieceId: string | null;
  conflict: ConflictInfo | null;
  onSelectPiece: (id: string) => void;
  dimmed?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 620 380"
      className="w-full h-full transition-opacity duration-300"
      style={{ opacity: dimmed ? 0.4 : 1 }}
    >
      {pieces.map((piece) => {
        const isSelected = piece.id === selectedPieceId;
        return (
          <g
            key={piece.id}
            onClick={() => onSelectPiece(piece.id)}
            className="cursor-pointer"
          >
            {piece.guideOutline && (
              <OutlineShape
                outline={piece.guideOutline}
                className="fill-none stroke-pattern-guide"
                style={{ strokeWidth: 1.1, strokeDasharray: "5 4" }}
              />
            )}
            <OutlineShape
              outline={piece.outline}
              className={isSelected ? "fill-olive-tint stroke-ink" : "fill-white stroke-ink"}
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
              <path d={piece.dart.d} className="fill-none stroke-olive" style={{ strokeWidth: 1.2 }} />
            )}
            <text x={piece.label.x} y={piece.label.y} className="fill-muted" style={{ fontSize: 11 }}>
              {piece.name.toUpperCase()} · {piece.qty}×
            </text>
          </g>
        );
      })}

      {conflict &&
        conflict.markers.map((marker, i) => (
          <circle
            key={i}
            cx={marker.cx}
            cy={marker.cy}
            r={marker.r}
            className="fill-none stroke-alert"
            style={{ strokeWidth: 2, strokeDasharray: "4 3" }}
          />
        ))}
    </svg>
  );
}
