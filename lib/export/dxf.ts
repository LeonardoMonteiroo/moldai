import type { ExPt, ExSeg, ExportModel } from "./model";

export const TOL_CM = 0.02; // 0,2 mm
const MAX_DEPTH = 16;

const mid = (a: ExPt, b: ExPt): ExPt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// distância perpendicular de p à reta a→b (em cm); corda degenerada → distância a `a`
function distToLine(p: ExPt, a: ExPt, b: ExPt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const cross = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx);
  return cross / Math.sqrt(len2);
}

export function flattenCubic(
  p0: ExPt,
  c1: ExPt,
  c2: ExPt,
  p3: ExPt,
  tolCm: number,
): ExPt[] {
  const out: ExPt[] = [];
  const recurse = (a: ExPt, b: ExPt, c: ExPt, d: ExPt, depth: number): void => {
    if (depth >= MAX_DEPTH || (distToLine(b, a, d) <= tolCm && distToLine(c, a, d) <= tolCm)) {
      out.push({ x: d.x, y: d.y });
      return;
    }
    const ab = mid(a, b), bc = mid(b, c), cd = mid(c, d);
    const abc = mid(ab, bc), bcd = mid(bc, cd);
    const m = mid(abc, bcd);
    recurse(a, ab, abc, m, depth + 1);
    recurse(m, bcd, cd, d, depth + 1);
  };
  recurse(p0, c1, c2, p3, 0);
  return out;
}

// Contorno achatado em cm: line -> 1 vértice, cubic -> pontos de flattenCubic.
// Fechado; remove o vértice final se coincidir com o inicial (dedup).
export function flattenOutlineCm(
  outline: { start: ExPt; segs: ExSeg[] },
  tolCm: number,
): ExPt[] {
  const verts: ExPt[] = [outline.start];
  let prev = outline.start;
  for (const s of outline.segs) {
    if (s.kind === "line") {
      verts.push(s.to);
      prev = s.to;
    } else {
      verts.push(...flattenCubic(prev, s.c1, s.c2, s.to, tolCm));
      prev = s.to;
    }
  }
  const first = verts[0];
  const last = verts[verts.length - 1];
  if (verts.length > 1 && Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
    verts.pop();
  }
  return verts;
}

const MM = 10; // cm -> mm (1:1)
const f = (n: number) => (Math.round(n * 100) / 100).toString();
const LAYERS = ["CONTORNO", "INTERNO", "GRAINLINE", "TEXTO"] as const;

export function toDxf(model: ExportModel): string {
  const L: (string | number)[] = [];
  const p = (code: number, value: string | number) => {
    L.push(code, value);
  };

  // comentário nativo DXF (código 999) — sem o problema do "--" do comentário XML
  p(999, `MoldAI · ${model.patternName} · tam ${model.size} · folga ${model.seamAllowanceCm ?? 0}cm (net line)`);

  // HEADER
  p(0, "SECTION"); p(2, "HEADER");
  p(9, "$ACADVER"); p(1, "AC1014");  // R14 — necessário p/ LWPOLYLINE em leitores estritos
  p(9, "$INSUNITS"); p(70, 4);       // 4 = milímetros
  p(9, "$MEASUREMENT"); p(70, 1);    // 1 = métrico
  p(0, "ENDSEC");

  // TABLES / LAYER
  p(0, "SECTION"); p(2, "TABLES");
  p(0, "TABLE"); p(2, "LAYER"); p(70, LAYERS.length);
  for (const name of LAYERS) {
    p(0, "LAYER"); p(2, name); p(70, 0); p(62, 7); p(6, "CONTINUOUS");
  }
  p(0, "ENDTAB");
  p(0, "ENDSEC");

  // ENTITIES
  p(0, "SECTION"); p(2, "ENTITIES");
  for (const piece of model.pieces) {
    const ox = piece.originCm.x;
    const oy = piece.originCm.y;
    const X = (x: number) => f((ox + x) * MM);
    // Y invertido: DXF tem +Y pra cima; ExportModel tem +Y pra baixo.
    const Y = (y: number) => f((model.sheetHeightCm - (oy + y)) * MM);

    // contorno -> vértices achatados (helper compartilhado com o PDF)
    const verts = flattenOutlineCm(piece.outline, TOL_CM);

    p(0, "LWPOLYLINE"); p(8, "CONTORNO"); p(90, verts.length); p(70, 1);
    for (const v of verts) {
      p(10, X(v.x)); p(20, Y(v.y));
    }

    if (piece.grainline) {
      const [a, b] = piece.grainline;
      p(0, "LINE"); p(8, "GRAINLINE");
      p(10, X(a.x)); p(20, Y(a.y));
      p(11, X(b.x)); p(21, Y(b.y));
    }

    if (piece.dart && piece.dart.length >= 3) {
      p(0, "LWPOLYLINE"); p(8, "INTERNO"); p(90, piece.dart.length); p(70, 1);
      for (const d of piece.dart) {
        p(10, X(d.x)); p(20, Y(d.y));
      }
    }

    p(0, "TEXT"); p(8, "TEXTO");
    p(10, X(piece.outline.start.x)); p(20, Y(piece.heightCm));
    p(40, 6); // altura do texto em mm
    p(1, `${piece.name.toUpperCase()} · ${piece.qty}x`);
  }
  p(0, "ENDSEC");

  p(0, "EOF");
  return L.join("\n");
}
