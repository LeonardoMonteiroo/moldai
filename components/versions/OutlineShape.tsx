import type { PieceOutline } from "@/lib/types";

// Same tiny polygon/path switch PatternCanvas's own (unexported) OutlineShape
// uses -- not worth cross-importing a private component for six lines.
// Shared between VersionCompare's overlay and VersionList's card thumbnails.
export function OutlineShape({
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
