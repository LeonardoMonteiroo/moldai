import type { ExportModel, ExportPiece } from "./model";
import { flattenOutlineCm, TOL_CM } from "./dxf";

// DXF "compatível AAMA/ASTM D6673" (subset). Diferente do DXF genérico
// (lib/export/dxf.ts, camadas nomeadas), este usa a convenção da indústria:
//
//   - camadas NUMERADAS com semântica fixa do D6673 (a 0 não se usa):
//       1  contorno da peça (+ texto de sistema da peça)
//       7  fio (grainline)
//       8  linhas internas (não cortadas) — usamos p/ a pence
//   - cada peça é um BLOCK, posicionado por um INSERT (peças são blocos no D6673)
//   - versão R13 (AC1012) + POLYLINE/VERTEX/SEQEND clássico (não LWPOLYLINE, que
//     é R14) — R13 é o que o D6673 referencia e maximiza compat com Audaces/Gerber.
//
// É um SUBSET honesto: o ExportModel só carrega contorno/fio/pence/nome, então
// piques (camada 4), furos (13) e linha de costura separada (14) NÃO são
// emitidos — o MoldAI ainda não os modela. O contorno é a linha líquida (sem
// margem de costura embutida), colocada na camada 1. O AAMA/ASTM estrito
// completo (system text estruturado, block records, esses elementos derivados)
// segue como "Fase 2.5".

const MM = 10; // cm -> mm (1:1)
const f = (n: number) => (Math.round(n * 100) / 100).toString();

// Camadas numeradas que este subset usa, com uma cor (código 62) cada.
const LAYERS: [string, number][] = [
  ["1", 7], // contorno — branco/preto
  ["7", 5], // fio — azul
  ["8", 3], // interno (pence) — verde
];

// Nome de BLOCK válido em DXF: só alfanumérico/_/-/$; prefixo garante letra inicial.
function blockName(id: string): string {
  return "PIECE_" + id.toUpperCase().replace(/[^A-Z0-9_$-]/g, "_");
}

export function toDxfAama(model: ExportModel): string {
  const L: (string | number)[] = [];
  const p = (code: number, value: string | number) => {
    L.push(code, value);
  };

  p(
    999,
    `MoldAI AAMA/ASTM subset · ${model.patternName} · tam ${model.size} · folga ${model.seamAllowanceCm ?? 0}cm (net line, camada 1)`,
  );

  // HEADER — R13, milímetros, métrico.
  p(0, "SECTION");
  p(2, "HEADER");
  p(9, "$ACADVER");
  p(1, "AC1012"); // R13 — base do D6673
  p(9, "$INSUNITS");
  p(70, 4); // 4 = milímetros
  p(9, "$MEASUREMENT");
  p(70, 1); // 1 = métrico
  p(0, "ENDSEC");

  // TABLES / LAYER — camadas numeradas.
  p(0, "SECTION");
  p(2, "TABLES");
  p(0, "TABLE");
  p(2, "LAYER");
  p(70, LAYERS.length);
  for (const [name, color] of LAYERS) {
    p(0, "LAYER");
    p(2, name);
    p(70, 0);
    p(62, color);
    p(6, "CONTINUOUS");
  }
  p(0, "ENDTAB");
  p(0, "ENDSEC");

  // Geometria local da peça -> DXF-up dentro do BLOCK (Y invertido pela altura da
  // peça). O INSERT reposiciona o bloco no lençol (também com Y invertido).
  const emitBlockBody = (piece: ExportPiece) => {
    const h = piece.heightCm;
    const X = (x: number) => f(x * MM);
    const Y = (y: number) => f((h - y) * MM); // +Y pra cima dentro do bloco

    // contorno -> POLYLINE fechado na camada 1 (helper de achatamento do DXF genérico)
    const verts = flattenOutlineCm(piece.outline, TOL_CM);
    p(0, "POLYLINE");
    p(8, "1");
    p(66, 1);
    p(70, 1); // 70=1 fechado
    for (const v of verts) {
      p(0, "VERTEX");
      p(8, "1");
      p(10, X(v.x));
      p(20, Y(v.y));
    }
    p(0, "SEQEND");
    p(8, "1");

    // nome/qtd como texto de sistema da peça, na camada 1
    p(0, "TEXT");
    p(8, "1");
    p(10, X(0));
    p(20, f(Math.max(0, h * MM - 8)));
    p(40, 8); // altura do texto em mm
    p(1, `${piece.name.toUpperCase()} ${piece.qty}X`);

    // fio -> LINE na camada 7
    if (piece.grainline) {
      const [a, b] = piece.grainline;
      p(0, "LINE");
      p(8, "7");
      p(10, X(a.x));
      p(20, Y(a.y));
      p(11, X(b.x));
      p(21, Y(b.y));
    }

    // pence -> POLYLINE aberto na camada 8 (linha interna, não corta)
    if (piece.dart && piece.dart.length >= 3) {
      p(0, "POLYLINE");
      p(8, "8");
      p(66, 1);
      p(70, 0);
      for (const d of piece.dart) {
        p(0, "VERTEX");
        p(8, "8");
        p(10, X(d.x));
        p(20, Y(d.y));
      }
      p(0, "SEQEND");
      p(8, "8");
    }
  };

  // BLOCKS — uma definição de bloco por peça.
  p(0, "SECTION");
  p(2, "BLOCKS");
  for (const piece of model.pieces) {
    const bn = blockName(piece.id);
    p(0, "BLOCK");
    p(8, "0");
    p(2, bn);
    p(70, 0);
    p(10, 0);
    p(20, 0);
    p(30, 0);
    p(3, bn);
    emitBlockBody(piece);
    p(0, "ENDBLK");
    p(8, "0");
  }
  p(0, "ENDSEC");

  // ENTITIES — um INSERT por bloco, posicionado no lençol (Y invertido).
  p(0, "SECTION");
  p(2, "ENTITIES");
  for (const piece of model.pieces) {
    const ix = piece.originCm.x;
    const iy = model.sheetHeightCm - piece.originCm.y - piece.heightCm;
    p(0, "INSERT");
    p(8, "0");
    p(2, blockName(piece.id));
    p(10, f(ix * MM));
    p(20, f(iy * MM));
    p(30, 0);
  }
  p(0, "ENDSEC");

  p(0, "EOF");
  return L.join("\n");
}
