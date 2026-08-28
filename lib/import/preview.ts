// Turns an already-parsed DxfDocument (lib/import/dxf.ts) into a plain SVG
// path per layer -- the ground-truth drawing LayerMappingPanel's canvas
// shows so a user can identify which of a file's layers is the real cut
// line by SIGHT, for a file whose layer names carry no usable vocabulary
// (see docs/decisions.md's oskar_combined_cm.dxf case: layers named by RGB
// color + linetype have no name-based signal at all).
//
// Pure and DOM-free, like every other lib/import module -- an uploaded
// file's geometry is untrusted input, but there is nothing here to reject:
// a document with no drawable entities just yields an empty preview.
//
// TEXT entities are administrative labels, not pattern geometry, and are
// skipped entirely -- they contribute no segment and don't affect the
// viewBox, so a stray annotation far from the pattern can't blow up the
// frame.

import type { DxfDocument } from "./dxf";

export interface LayerPreviewSegment {
  layer: string;
  /** SVG path `d` attribute covering every entity on this layer, as one or more subpaths. */
  d: string;
}

export interface LayerPreview {
  viewBox: string;
  segments: LayerPreviewSegment[];
}

function fmt(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : "0";
}

// DXF's Y axis points up; SVG's points down. Flipping Y here (rather than
// with a transform on the <svg>) keeps every coordinate in the `d` string
// already correct, so nothing downstream needs to know this happened.
function flip(y: number): number {
  return -y;
}

export function buildLayerPreview(doc: DxfDocument): LayerPreview {
  const fragmentsByLayer = new Map<string, string[]>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function touch(x: number, y: number): void {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  function push(layer: string, fragment: string): void {
    if (!fragmentsByLayer.has(layer)) fragmentsByLayer.set(layer, []);
    fragmentsByLayer.get(layer)!.push(fragment);
  }

  for (const e of doc.entities) {
    if (e.kind === "polyline") {
      if (e.vertices.length < 2) continue;
      const points = e.vertices.map(([x, y]): [number, number] => [x, flip(y)]);
      for (const [x, y] of points) touch(x, y);
      const [first, ...rest] = points;
      let d = `M ${fmt(first[0])} ${fmt(first[1])}`;
      for (const [x, y] of rest) d += ` L ${fmt(x)} ${fmt(y)}`;
      if (e.closed) d += " Z";
      push(e.layer, d);
    } else if (e.kind === "line") {
      const ax = e.a[0];
      const ay = flip(e.a[1]);
      const bx = e.b[0];
      const by = flip(e.b[1]);
      touch(ax, ay);
      touch(bx, by);
      push(e.layer, `M ${fmt(ax)} ${fmt(ay)} L ${fmt(bx)} ${fmt(by)}`);
    }
    // "text": administrative label, deliberately not drawn or measured.
  }

  const segments: LayerPreviewSegment[] = Array.from(
    fragmentsByLayer,
    ([layer, fragments]) => ({ layer, d: fragments.join(" ") }),
  );

  if (!Number.isFinite(minX)) {
    return { viewBox: "0 0 1 1", segments: [] };
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const pad = Math.max(width, height, 1) * 0.02;
  const viewBox = [
    fmt(minX - pad),
    fmt(minY - pad),
    fmt(width + pad * 2),
    fmt(height + pad * 2),
  ].join(" ");

  return { viewBox, segments };
}

/** A stable, deterministic color per layer name -- so the same layer always
 * renders the same color across re-renders (no flicker as the user hovers
 * other rows) without keeping a color assignment anywhere in state. */
export function colorForLayer(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}
