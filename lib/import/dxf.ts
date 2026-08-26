// A hand-written DXF reader — the inverse of lib/export/dxf.ts and
// lib/export/dxf-aama.ts, which this module is written to recognise as a
// baseline (see dxf.test.ts's round-trip suite). DXF's ASCII form is an
// alternating stream of "group code" / "value" lines; there is no bracket
// nesting to get wrong, so a single forward pass is enough — which is also
// what makes "never loops forever" easy to guarantee: every branch below
// either advances to the next raw entity or does nothing, there is no loop
// that can get stuck re-reading the same input.
//
// lib/ stays framework-free (no next-intl import, CLAUDE.md's rule) — this
// module returns plain data, never throws, and every defensive cap below
// exists because an uploaded file is untrusted input, exactly like the AI's
// spec (validateSpec) and the user's size-chart patch (validateSizeChartPatch).

/** A single flattened DXF polyline (LWPOLYLINE, or a classic POLYLINE/VERTEX/SEQEND run). */
export interface DxfPolylineEntity {
  kind: "polyline";
  layer: string;
  closed: boolean;
  vertices: [number, number][];
}

export interface DxfLineEntity {
  kind: "line";
  layer: string;
  a: [number, number];
  b: [number, number];
}

export interface DxfTextEntity {
  kind: "text";
  layer: string;
  text: string;
  anchor: [number, number];
}

export type DxfEntity = DxfPolylineEntity | DxfLineEntity | DxfTextEntity;

export interface DxfDocument {
  /** $INSUNITS header value (1=inch, 4=mm, 5=cm, …), or null if absent/unreadable. */
  insUnits: number | null;
  /** $ACADVER header value (e.g. "AC1014"), or null if absent. */
  acadVer: string | null;
  entities: DxfEntity[];
  /**
   * Distinct entity type names that were seen but not parsed into geometry
   * (SPLINE, ARC, CIRCLE, ELLIPSE, …) — what makes the limitation reportable
   * (analyzeDxf's `unsupportedEntities` check) instead of silently dropped.
   */
  unsupported: string[];
  /** True if any defensive cap below (size/entity/vertex count) discarded data. */
  truncated: boolean;
}

function emptyDocument(): DxfDocument {
  return {
    insUnits: null,
    acadVer: null,
    entities: [],
    unsupported: [],
    truncated: false,
  };
}

// Defensive caps — an uploaded file is untrusted input. These bound both the
// work a malformed/hostile file can force and the memory a legitimate but
// enormous one can consume.
export const MAX_DXF_CHARS = 8_000_000; // ~8 MB of text
export const MAX_ENTITIES = 5_000;
export const MAX_VERTICES_PER_ENTITY = 5_000;

// Entity type names that are structural/administrative, not geometry — never
// reported as "unsupported" even though they aren't turned into DxfEntity.
const ADMIN_TYPES = new Set([
  "SECTION",
  "ENDSEC",
  "TABLE",
  "ENDTAB",
  "LAYER",
  "BLOCK",
  "ENDBLK",
  "VERTEX",
  "SEQEND",
  "EOF",
  "DIMSTYLE",
  "APPID",
  "STYLE",
  "UCS",
  "VIEW",
  "VPORT",
  "CLASS",
  "CLASSES",
]);

// Entity types this reader turns into geometry — excluded from "unsupported"
// even on a malformed instance (e.g. a LINE with a non-finite coordinate).
const HANDLED_TYPES = new Set([
  "LWPOLYLINE",
  "POLYLINE",
  "LINE",
  "TEXT",
  "MTEXT",
  "INSERT",
]);

interface RawEntity {
  type: string;
  codes: [number, string][];
}

/** Splits the alternating code/value stream into runs starting at each group code 0. */
function splitIntoRawEntities(pairs: [number, string][]): RawEntity[] {
  const result: RawEntity[] = [];
  let current: RawEntity | null = null;
  for (const [code, value] of pairs) {
    if (code === 0) {
      if (current) result.push(current);
      current = { type: value.toUpperCase(), codes: [] };
    } else if (current) {
      current.codes.push([code, value]);
    }
    // Any pair before the first "0" (e.g. a leading comment, code 999) has
    // nowhere to attach and is simply dropped.
  }
  if (current) result.push(current);
  return result;
}

function codeValue(raw: RawEntity, code: number): string | undefined {
  return raw.codes.find(([c]) => c === code)?.[1];
}

function finiteOr(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * LWPOLYLINE encodes a curved segment as a bulge (group code 42) on the
 * vertex the arc starts from — this reader flattens every polyline to
 * straight chords (collectXY only reads 10/20), so a nonzero bulge is a
 * real, silent loss of curvature. Detected file-wide rather than pinned to
 * one vertex: good enough to report "this file had curves that got
 * flattened" via `unsupported`, without building an arc-to-polyline
 * converter for a first pass.
 */
function hasNonzeroBulge(codes: [number, string][]): boolean {
  return codes.some(([code, value]) => {
    if (code !== 42) return false;
    const n = Number(value);
    return Number.isFinite(n) && n !== 0;
  });
}

/**
 * Pairs sequential (xCode, yCode) group codes into vertices, dropping any
 * pair where either coordinate is missing, NaN or Infinite rather than
 * letting a bad file poison the whole polyline — the same drop-don't-persist
 * philosophy validateSizeChartPatch documents for a NaN measurement.
 *
 * `truncated` is true only when a *real* (cap+1)th valid vertex was found —
 * not merely when the entity happens to have exactly `cap` vertices and
 * nothing more. The earlier version set it on `vertices.length >= cap`
 * regardless of whether anything followed, which fired on every polyline
 * that legitimately had exactly `cap` vertices.
 */
function collectXY(
  codes: [number, string][],
  xCode: number,
  yCode: number,
  cap: number,
): { vertices: [number, number][]; truncated: boolean } {
  const verts: [number, number][] = [];
  let pendingX: number | null = null;
  for (const [code, value] of codes) {
    if (code === xCode) {
      const n = Number(value);
      pendingX = Number.isFinite(n) ? n : null;
    } else if (code === yCode) {
      if (pendingX !== null) {
        const n = Number(value);
        if (Number.isFinite(n)) {
          if (verts.length >= cap) return { vertices: verts, truncated: true };
          verts.push([pendingX, n]);
        }
      }
      pendingX = null;
    }
  }
  return { vertices: verts, truncated: false };
}

interface PendingPolyline {
  layer: string;
  closed: boolean;
  vertices: [number, number][];
}

export function parseDxf(text: string): DxfDocument {
  if (typeof text !== "string" || text.length === 0) return emptyDocument();

  const source =
    text.length > MAX_DXF_CHARS ? text.slice(0, MAX_DXF_CHARS) : text;
  let truncated = source.length !== text.length;

  const lines = source.split(/\r\n|\r|\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const codeStr = lines[i]?.trim();
    if (!codeStr) continue;
    const code = Number(codeStr);
    if (!Number.isFinite(code)) continue;
    pairs.push([code, (lines[i + 1] ?? "").trim()]);
  }

  const rawEntities = splitIntoRawEntities(pairs);

  let insUnits: number | null = null;
  let acadVer: string | null = null;
  let section: string | null = null;
  let mode: "top" | "block" = "top";
  let blockName: string | null = null;
  let pendingPolyline: PendingPolyline | null = null;
  // Two independent budgets, not one shared counter: entities *defined*
  // inside a BLOCK are a template, not yet part of the document's output —
  // charging them against the same pool an INSERT's expansion also charges
  // double-counts every block-based piece (toDxfAama wraps every piece in
  // its own BLOCK/INSERT pair, so this app's own primary round-trip format
  // hit the double charge on every file). `blockBudget` bounds how much can
  // be stored across all block *definitions* (a memory cap on templates that
  // may never be inserted); `entityBudget` bounds the final, expanded
  // `entities` output — the number that actually matters to the caller.
  let entityBudget = MAX_ENTITIES;
  let blockBudget = MAX_ENTITIES;

  const blocks = new Map<string, DxfEntity[]>();
  // A BLOCK's own base point (codes 10/20) — INSERT positions a block by
  // `insertion + R(rotation) * scale * (localPoint - basePoint)`, not by the
  // raw local coordinates. This app's own writer always emits (0,0), but a
  // real Gerber/Lectra/Optitex export routinely does not.
  const blockBasePoints = new Map<string, [number, number]>();
  const entities: DxfEntity[] = [];
  const unsupported = new Set<string>();

  const targetList = (): DxfEntity[] | null =>
    mode === "block"
      ? blockName
        ? (blocks.get(blockName) ?? null)
        : null
      : entities;

  /** Peeks the budget for the current mode, flagging `truncated` if exhausted. Does not spend. */
  function hasBudget(): boolean {
    const budget = mode === "block" ? blockBudget : entityBudget;
    if (budget <= 0) {
      truncated = true;
      return false;
    }
    return true;
  }
  /** Spends one unit of whichever budget `hasBudget()` just confirmed — only called on an actual push. */
  function spendBudget(): void {
    if (mode === "block") blockBudget--;
    else entityBudget--;
  }

  /** A POLYLINE/VERTEX run interrupted before its SEQEND — `truncated` must say so. */
  function abandonPendingPolyline(): void {
    if (pendingPolyline && pendingPolyline.vertices.length > 0)
      truncated = true;
    pendingPolyline = null;
  }

  for (const raw of rawEntities) {
    switch (raw.type) {
      case "SECTION": {
        const name = codeValue(raw, 2);
        section = name ? name.toUpperCase() : null;
        if (section === "HEADER") {
          let varName: string | null = null;
          for (const [code, value] of raw.codes) {
            if (code === 9) {
              varName = value;
              continue;
            }
            if (varName === "$INSUNITS") {
              const n = Number(value);
              if (Number.isFinite(n)) insUnits = n;
              varName = null;
            } else if (varName === "$ACADVER") {
              acadVer = value;
              varName = null;
            } else {
              varName = null;
            }
          }
        }
        break;
      }
      case "ENDSEC":
        section = null;
        break;
      case "BLOCK": {
        if (section !== "BLOCKS") break;
        const name = codeValue(raw, 2);
        blockName = name ?? null;
        if (blockName) {
          blocks.set(blockName, []);
          const bx = finiteOr(codeValue(raw, 10), 0);
          const by = finiteOr(codeValue(raw, 20), 0);
          blockBasePoints.set(blockName, [bx, by]);
        }
        mode = "block";
        abandonPendingPolyline();
        break;
      }
      case "ENDBLK":
        mode = "top";
        blockName = null;
        abandonPendingPolyline();
        break;
      case "LWPOLYLINE": {
        if (section !== "ENTITIES" && mode !== "block") break;
        // Recorded regardless of budget: an honest "curves were flattened"
        // note about the *file*, not about what made it into the output.
        if (hasNonzeroBulge(raw.codes)) unsupported.add("LWPOLYLINE_BULGE");
        if (!hasBudget()) break;
        const layer = codeValue(raw, 8) ?? "0";
        const flags = finiteOr(codeValue(raw, 70), 0);
        const closed = (flags & 1) === 1;
        const { vertices, truncated: verticesTruncated } = collectXY(
          raw.codes,
          10,
          20,
          MAX_VERTICES_PER_ENTITY,
        );
        if (verticesTruncated) truncated = true;
        if (vertices.length >= 2) {
          const list = targetList();
          if (list) {
            list.push({ kind: "polyline", layer, closed, vertices });
            spendBudget();
          }
        }
        break;
      }
      case "POLYLINE": {
        if (section !== "ENTITIES" && mode !== "block") break;
        abandonPendingPolyline();
        const layer = codeValue(raw, 8) ?? "0";
        const flags = finiteOr(codeValue(raw, 70), 0);
        pendingPolyline = { layer, closed: (flags & 1) === 1, vertices: [] };
        break;
      }
      case "VERTEX": {
        if (!pendingPolyline) break;
        if (pendingPolyline.vertices.length >= MAX_VERTICES_PER_ENTITY) {
          truncated = true;
          break;
        }
        const x = Number(codeValue(raw, 10));
        const y = Number(codeValue(raw, 20));
        if (Number.isFinite(x) && Number.isFinite(y)) {
          pendingPolyline.vertices.push([x, y]);
        }
        break;
      }
      case "SEQEND": {
        if (pendingPolyline && pendingPolyline.vertices.length >= 2) {
          if (hasBudget()) {
            const list = targetList();
            if (list) {
              list.push({
                kind: "polyline",
                layer: pendingPolyline.layer,
                closed: pendingPolyline.closed,
                vertices: pendingPolyline.vertices,
              });
              spendBudget();
            }
          }
        }
        pendingPolyline = null;
        break;
      }
      case "LINE": {
        if (section !== "ENTITIES" && mode !== "block") break;
        if (!hasBudget()) break;
        const layer = codeValue(raw, 8) ?? "0";
        const ax = Number(codeValue(raw, 10));
        const ay = Number(codeValue(raw, 20));
        const bx = Number(codeValue(raw, 11));
        const by = Number(codeValue(raw, 21));
        if ([ax, ay, bx, by].every(Number.isFinite)) {
          const list = targetList();
          if (list) {
            list.push({ kind: "line", layer, a: [ax, ay], b: [bx, by] });
            spendBudget();
          }
        }
        break;
      }
      case "TEXT":
      case "MTEXT": {
        if (section !== "ENTITIES" && mode !== "block") break;
        if (!hasBudget()) break;
        const layer = codeValue(raw, 8) ?? "0";
        const text = codeValue(raw, 1) ?? "";
        const x = finiteOr(codeValue(raw, 10), 0);
        const y = finiteOr(codeValue(raw, 20), 0);
        const list = targetList();
        if (list) {
          list.push({ kind: "text", layer, text, anchor: [x, y] });
          spendBudget();
        }
        break;
      }
      case "INSERT": {
        if (section !== "ENTITIES") break;
        const name = codeValue(raw, 2);
        const blockEntities = name ? blocks.get(name) : undefined;
        if (!blockEntities) break; // unresolved reference — skip, don't fabricate geometry
        const [bpx, bpy] = (name && blockBasePoints.get(name)) ?? [0, 0];
        const ix = finiteOr(codeValue(raw, 10), 0);
        const iy = finiteOr(codeValue(raw, 20), 0);
        const sx = finiteOr(codeValue(raw, 41), 1);
        const sy = finiteOr(codeValue(raw, 42), sx);
        const rotDeg = finiteOr(codeValue(raw, 50), 0);
        const rad = (rotDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        // World = insertion + R(rotation) * scale * (local - basePoint).
        const transform = ([x, y]: [number, number]): [number, number] => {
          const lx = x - bpx;
          const ly = y - bpy;
          const sx2 = lx * sx;
          const sy2 = ly * sy;
          return [sx2 * cos - sy2 * sin + ix, sx2 * sin + sy2 * cos + iy];
        };
        for (const be of blockEntities) {
          if (!hasBudget()) break;
          if (be.kind === "polyline") {
            entities.push({ ...be, vertices: be.vertices.map(transform) });
          } else if (be.kind === "line") {
            entities.push({ ...be, a: transform(be.a), b: transform(be.b) });
          } else {
            entities.push({ ...be, anchor: transform(be.anchor) });
          }
          spendBudget();
        }
        break;
      }
      default: {
        if (
          !ADMIN_TYPES.has(raw.type) &&
          !HANDLED_TYPES.has(raw.type) &&
          (section === "ENTITIES" || mode === "block")
        ) {
          unsupported.add(raw.type);
        }
      }
    }
  }

  return {
    insUnits,
    acadVer,
    entities,
    unsupported: Array.from(unsupported),
    truncated,
  };
}
