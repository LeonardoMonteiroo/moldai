import { create } from "zustand";
import { parseDxf, type DxfDocument } from "./import/dxf";
import {
  analyzeDxf,
  computeVerification,
  hasClosedPolyline,
} from "./import/analyze";
import { parseRul, analyzeRul } from "./import/rul";
import type { ImportAnalysis, LayerRole } from "./import/types";

/**
 * Client-side cap on the *source* file, mirroring lib/editor/attachment.ts's
 * MAX_ATTACHMENT_SOURCE_BYTES precedent — reject an oversized upload before
 * any decode/parse work, not after. parseDxf itself also caps text length,
 * entity count and vertices-per-entity (an untrusted file, same trust
 * boundary as validateSpec/validateSizeChartPatch), so this is belt-and-
 * braces against a file so large that even reading it as text is wasteful.
 */
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

/**
 * A `.RUL` companion is plain text and, per the ANSI/AAMA grade rule table
 * shape parseRul targets, orders of magnitude smaller than a real pattern's
 * own DXF geometry — this cap exists for the same belt-and-braces reason as
 * MAX_IMPORT_FILE_BYTES, sized down accordingly.
 */
export const MAX_RUL_FILE_BYTES = 2 * 1024 * 1024;

/** Wire-ish codes `pick()` can leave in `actionError`, resolved per-code by FileSummaryCard. */
export type ImportPickErrorCode =
  "file_too_large" | "read_failed" | "no_pieces_found";

/** Wire-ish codes `pickRul()` can leave in `rulActionError`, resolved per-code by RulCompanionCard. */
export type RulPickErrorCode = "rul_file_too_large" | "rul_read_failed";

interface ImportStore {
  step: 1 | 2;
  fileName: string | null;
  fileSizeBytes: number;
  /** Kept alongside `analysis` so `setRole` can recompute pieceCount/checks live. */
  doc: DxfDocument | null;
  analysis: ImportAnalysis | null;
  roles: Record<string, LayerRole>;
  /** The layer group currently hovered/focused in LayerMappingPanel — highlighted in LayerPreviewCanvas, dimming every other layer. Null when nothing is hovered. */
  hoveredLayers: string[] | null;
  /** True while a picked file is being read/parsed — the screen's one live region. */
  loading: boolean;
  /** Code for the last failed pick, or null — resolved through the catalog per-code. */
  actionError: ImportPickErrorCode | null;
  /** Code for the last failed `.RUL` pick, or null — independent of `actionError`: a RUL companion is additive, so its own failure must never block the DXF-only flow. */
  rulActionError: RulPickErrorCode | null;
  pick: (file: File) => Promise<void>;
  /** Attaches an optional `.RUL` companion's grading-rule summary onto `analysis.rul`. No-op before a DXF has been picked. */
  pickRul: (file: File) => Promise<void>;
  /** Drops the attached `.RUL` summary so the user can pick a different companion file. */
  clearRul: () => void;
  setRole: (layer: string, role: LayerRole) => void;
  /** Same as `setRole`, applied to every layer in one group at once (LayerMappingPanel's grouped rows). */
  setRoleForLayers: (layers: string[], role: LayerRole) => void;
  setHoveredLayers: (layers: string[] | null) => void;
  reset: () => void;
  clearActionError: () => void;
}

/**
 * This screen has no server load, so unlike the other four stores
 * (CLAUDE.md's "four stores" section) there is no `error`/`ready` load
 * split — everything here is a client-side parse triggered by a user
 * action, so `actionError` alone (the mutation-failure half of that split)
 * is all "don't add abstractions beyond what's needed" calls for.
 */
export const useImportStore = create<ImportStore>((set, get) => ({
  step: 1,
  fileName: null,
  fileSizeBytes: 0,
  doc: null,
  analysis: null,
  roles: {},
  hoveredLayers: null,
  loading: false,
  actionError: null,
  rulActionError: null,

  pick: async (file) => {
    set({ actionError: null, loading: true });

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      set({ actionError: "file_too_large", loading: false });
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      set({ actionError: "read_failed", loading: false });
      return;
    }

    const doc = parseDxf(text);

    // The gate is "does this file contain any closed polyline at all", not
    // analysis.pieceCount === 0 — an unrecognised-vocabulary file legitimately
    // reports 0 pieces (nothing is mapped to "cut" yet) and must still reach
    // step 2, where the user assigns that mapping. Only a file with no
    // plausible piece boundary anywhere is rejected outright.
    if (!hasClosedPolyline(doc)) {
      set({ actionError: "no_pieces_found", loading: false });
      return;
    }

    const analysis = analyzeDxf(doc, file.name, file.size);

    set({
      doc,
      analysis,
      fileName: file.name,
      fileSizeBytes: file.size,
      roles: { ...analysis.suggestedRoles },
      step: 2,
      loading: false,
    });
  },

  // Recomputes pieceCount/checks from the CURRENT role map — step 2's entire
  // purpose is correcting the mapping, and the count/checks shown must
  // reflect that correction instead of staying frozen at the initial guess.
  setRole: (layer, role) => get().setRoleForLayers([layer], role),

  // Same recompute, applied to every layer in a group at once — the layer
  // list groups same-pen layers that differ only by a page prefix (#238),
  // and correcting one member's role must correct the whole group's.
  setRoleForLayers: (layers, role) => {
    const nextRoles = { ...get().roles };
    for (const layer of layers) nextRoles[layer] = role;
    const doc = get().doc;
    const analysis = get().analysis;
    if (!doc || !analysis) {
      set({ roles: nextRoles });
      return;
    }
    const { pieceCount, checks } = computeVerification(doc, nextRoles);
    set({
      roles: nextRoles,
      analysis: { ...analysis, pieceCount, checks },
    });
  },

  setHoveredLayers: (layers) => set({ hoveredLayers: layers }),

  // Additive companion — requires a DXF already loaded (step 2), never
  // gates or replaces it. Failure leaves `analysis.rul` untouched rather
  // than tearing down the DXF-only state the user already has.
  pickRul: async (file) => {
    const { analysis } = get();
    if (!analysis) return;

    set({ rulActionError: null, loading: true });

    if (file.size > MAX_RUL_FILE_BYTES) {
      set({ rulActionError: "rul_file_too_large", loading: false });
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      set({ rulActionError: "rul_read_failed", loading: false });
      return;
    }

    const current = get().analysis;
    if (!current) {
      set({ loading: false });
      return;
    }
    const rul = analyzeRul(parseRul(text), file.name, current.fileName);
    set({ analysis: { ...current, rul }, loading: false });
  },

  clearRul: () => {
    const current = get().analysis;
    if (!current) return;
    const { rul: _rul, ...rest } = current;
    set({ analysis: rest, rulActionError: null });
  },

  reset: () =>
    set({
      step: 1,
      fileName: null,
      fileSizeBytes: 0,
      doc: null,
      analysis: null,
      roles: {},
      hoveredLayers: null,
      actionError: null,
      rulActionError: null,
      loading: false,
    }),

  clearActionError: () => set({ actionError: null }),
}));
