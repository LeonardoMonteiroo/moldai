import type { ProofMesh, Shell, ShellId } from "./mesh";

// Turns a ProofMesh into flat 2D faces an SVG can draw -- a simple
// orthographic camera (rotate + a fixed pitch, no perspective divide), not a
// renderer. One quad face per (ring pair × ring sample), painter's-algorithm
// sorted back-to-front so the SVG can just draw `faces` in order with no
// z-buffer.
export interface ProjectedFace {
  d: string;
  shade: number;
  depth: number;
  part: ShellId;
}

// The component quantizes drag deltas to this step before re-projecting.
export const YAW_STEP_DEG = 3;
const PITCH_DEG = 8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

const LIGHT = normalize([0.55, 0.35, 0.75]);

// Rotates (x, y, z) about the Y axis by yawDeg, then about the X axis by a
// fixed pitch. Orthographic: the returned x/y ARE the projected 2D
// coordinates (in cm); z is kept only as a depth/shading signal.
function rotate(
  x: number,
  y: number,
  z: number,
  yawDeg: number,
  pitchDeg: number,
): [number, number, number] {
  const yaw = toRad(yawDeg);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const x1 = x * cosY + z * sinY;
  const z1 = -x * sinY + z * cosY;
  const pitch = toRad(pitchDeg);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const y1 = y * cosP - z1 * sinP;
  const z2 = y * sinP + z1 * cosP;
  return [x1, y1, z2];
}

export function projectMesh(
  mesh: ProofMesh,
  yawDeg: number,
): {
  faces: ProjectedFace[];
  viewBox: { x: number; y: number; w: number; h: number };
} {
  const faces: ProjectedFace[] = [];
  const shells: Shell[] = [mesh.form, ...mesh.garment];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const shell of shells) {
    for (let r = 0; r < shell.rings.length - 1; r++) {
      const a = shell.rings[r];
      const b = shell.rings[r + 1];
      const count = Math.min(a.points.length, b.points.length);
      for (let i = 0; i < count; i++) {
        const j = (i + 1) % count;
        const ax = a.points[i][0] + shell.centerXCm;
        const az = a.points[i][1];
        const bx0 = a.points[j][0] + shell.centerXCm;
        const bz0 = a.points[j][1];
        const cx0 = b.points[j][0] + shell.centerXCm;
        const cz0 = b.points[j][1];
        const dx0 = b.points[i][0] + shell.centerXCm;
        const dz0 = b.points[i][1];

        const p1 = rotate(ax, a.yCm, az, yawDeg, PITCH_DEG);
        const p2 = rotate(bx0, a.yCm, bz0, yawDeg, PITCH_DEG);
        const p3 = rotate(cx0, b.yCm, cz0, yawDeg, PITCH_DEG);
        const p4 = rotate(dx0, b.yCm, dz0, yawDeg, PITCH_DEG);

        // Outward-normal proxy: the (unrotated) quad's own centroid
        // direction from the shell's centre line, rotated by the same
        // yaw/pitch as the face -- then dotted with a fixed light.
        const ncx = (ax + bx0 + cx0 + dx0) / 4 - shell.centerXCm;
        const ncz = (az + bz0 + cz0 + dz0) / 4;
        // A horizontal cross-section's outward normal has no vertical
        // component -- only its own (x, z) direction from the shell centre.
        const [nx, nyR, nz] = rotate(ncx, 0, ncz, yawDeg, PITCH_DEG);
        const nlen = Math.hypot(nx, nyR, nz) || 1;
        const dot =
          (nx / nlen) * LIGHT[0] +
          (nyR / nlen) * LIGHT[1] +
          (nz / nlen) * LIGHT[2];
        const shade = Math.min(1, Math.max(0, (dot + 1) / 2));

        const depth = (p1[2] + p2[2] + p3[2] + p4[2]) / 4;
        const d =
          `M${p1[0].toFixed(2)} ${p1[1].toFixed(2)} ` +
          `L${p2[0].toFixed(2)} ${p2[1].toFixed(2)} ` +
          `L${p3[0].toFixed(2)} ${p3[1].toFixed(2)} ` +
          `L${p4[0].toFixed(2)} ${p4[1].toFixed(2)} Z`;

        minX = Math.min(minX, p1[0], p2[0], p3[0], p4[0]);
        maxX = Math.max(maxX, p1[0], p2[0], p3[0], p4[0]);
        minY = Math.min(minY, p1[1], p2[1], p3[1], p4[1]);
        maxY = Math.max(maxY, p1[1], p2[1], p3[1], p4[1]);

        faces.push({ d, shade, depth, part: shell.id });
      }
    }
  }

  // Painter's order: farthest first (largest depth), form before garment on
  // an exact tie so the dress form never draws over the garment hung on it.
  faces.sort((f1, f2) => {
    const delta = f2.depth - f1.depth;
    if (Math.abs(delta) > 1e-9) return delta;
    const rank = (f: ProjectedFace) => (f.part === "form" ? 0 : 1);
    return rank(f1) - rank(f2);
  });

  const pad = 4;
  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 0;
    minY = 0;
    maxY = 0;
  }
  return {
    faces,
    viewBox: {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    },
  };
}
