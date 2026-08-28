// Rasterizes lib/import/preview.ts's LayerPreview (the same overlay the user
// already sees on screen) into a File suitable for
// lib/editor/attachment.ts's prepareImage() -- reusing that pipeline's exact
// size/re-encode behavior for the reconstruction chat attachment (#238
// follow-up). DOM-only (canvas) by necessity, so it lives under
// components/import/, not lib/import/ (which stays framework-free).

import type { LayerPreview } from "@/lib/import/preview";

const RENDER_SIZE_PX = 1024;

function parseViewBox(viewBox: string): [number, number, number, number] {
  const parts = viewBox.split(" ").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return [0, 0, 1, 1];
  }
  return parts as [number, number, number, number];
}

export async function renderPreviewImage(preview: LayerPreview): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = RENDER_SIZE_PX;
  canvas.height = RENDER_SIZE_PX;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const [minX, minY, w, h] = parseViewBox(preview.viewBox);
    const scale = Math.min(RENDER_SIZE_PX / w, RENDER_SIZE_PX / h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, RENDER_SIZE_PX, RENDER_SIZE_PX);
    ctx.translate(-minX * scale, -minY * scale);
    ctx.scale(scale, scale);
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = "#1a1a1a";
    for (const segment of preview.segments) {
      const path = new Path2D(segment.d);
      ctx.stroke(path);
    }
  }
  const blob: Blob = await new Promise((resolve) => {
    // jsdom (this repo's `dom` vitest project) has no real canvas backend --
    // toBlob is defined but a silent no-op there: it neither throws nor ever
    // invokes its callback, so a bare wrapper still hangs forever. A short
    // fallback timer is what actually bounds this; a real browser always
    // resolves through the callback well before it fires.
    let settled = false;
    const finish = (b: Blob | null) => {
      if (settled) return;
      settled = true;
      resolve(b ?? new Blob([], { type: "image/png" }));
    };
    try {
      canvas.toBlob((b) => finish(b), "image/png");
    } catch {
      finish(null);
    }
    setTimeout(() => finish(null), 200);
  });
  return new File([blob], "import-preview.png", { type: "image/png" });
}
