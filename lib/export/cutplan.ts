import type { Pattern } from "@/lib/types";
import { buildExportModel, type ExportPiece } from "./model";

// Larguras de rolo mais comuns no varejo de tecidos (cm).
export const FABRIC_WIDTHS_CM = [140, 150, 160] as const;

const PAD_CM = 4; // margem entre as peças e a ourela
const GAP_CM = 3; // espaço entre peças

export interface CutInstance {
  id: string; // único por cópia (peça#n)
  name: string;
  outline: ExportPiece["outline"];
  widthCm: number;
  heightCm: number;
  originCm: { x: number; y: number };
}

export interface CutPlan {
  fabricWidthCm: number;
  lengthCm: number; // comprimento de tecido ocupado
  usedAreaCm2: number; // soma das bboxes das cópias
  efficiency: number; // usedArea / (largura × comprimento), em (0,1]
  instances: CutInstance[];
  overflow: boolean; // alguma peça mais larga que o tecido utilizável
}

// Encaixe (nesting) real, porém first-fit — não ótimo. Reaproveita a geometria em
// cm exato de buildExportModel (re-drafta via draftPiecesCm, não inverte px), expande
// cada peça pela quantidade a cortar e empacota as cópias em prateleiras dentro de uma
// faixa da LARGURA DO TECIDO. O fio fica travado (sem rotação): a peça mantém a
// orientação em que foi modelada, então a copa/neckline continuam alinhados ao urdume.
export function planCutLayout(
  pattern: Pattern,
  fabricWidthCm: number,
): CutPlan {
  const model = buildExportModel(pattern);

  // expande qty: cada cópia é uma instância a cortar
  const instances: CutInstance[] = model.pieces.flatMap((p) =>
    Array.from({ length: p.qty }, (_, k) => ({
      id: `${p.id}#${k + 1}`,
      name: p.name,
      outline: p.outline,
      widthCm: p.widthCm,
      heightCm: p.heightCm,
      originCm: { x: PAD_CM, y: PAD_CM },
    })),
  );

  const usableW = fabricWidthCm - PAD_CM * 2;
  let overflow = false;

  // ordena por altura desc p/ prateleiras mais justas; a ordem de saída segue a original
  const order = [...instances].sort((a, b) => b.heightCm - a.heightCm);
  let cursorX = PAD_CM;
  let cursorY = PAD_CM;
  let rowH = 0;
  for (const it of order) {
    if (it.widthCm > usableW) overflow = true;
    if (cursorX > PAD_CM && cursorX - PAD_CM + it.widthCm > usableW) {
      cursorY += rowH + GAP_CM; // nova prateleira ao longo do tecido
      cursorX = PAD_CM;
      rowH = 0;
    }
    it.originCm = { x: cursorX, y: cursorY };
    cursorX += it.widthCm + GAP_CM;
    rowH = Math.max(rowH, it.heightCm);
  }

  const lengthCm = (instances.length ? cursorY + rowH : 0) + PAD_CM;
  const usedAreaCm2 = instances.reduce(
    (s, it) => s + it.widthCm * it.heightCm,
    0,
  );
  const efficiency =
    lengthCm > 0 ? usedAreaCm2 / (fabricWidthCm * lengthCm) : 0;

  return {
    fabricWidthCm,
    lengthCm,
    usedAreaCm2,
    efficiency,
    instances,
    overflow,
  };
}
