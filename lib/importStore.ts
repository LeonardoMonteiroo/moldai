import { create } from "zustand";
import { parseDxf, type DxfDocument } from "./import/dxf";
import {
  analyzeDxf,
  computeVerification,
  hasClosedPolyline,
} from "./import/analyze";
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

/** Wire-ish codes `pick()` can leave in `actionError`, resolved per-code by FileSummaryCard. */
export type ImportPickErrorCode =
  "file_too_large" | "read_failed" | "no_pieces_found";

interface ImportStore {
  step: 1 | 2;
  fileName: string | null;
  fileSizeBytes: number;
  /** Kept alongside `analysis` so `setRole` can recompute pieceCount/checks live. */
  doc: DxfDocument | null;
  analysis: ImportAnalysis | null;
  roles: Record<string, LayerRole>;
  /** True while a picked file is being read/parsed — the screen's one live region. */
  loading: boolean;
  /** Code for the last failed pick, or null — resolved through the catalog per-code. */
  actionError: ImportPickErrorCode | null;
  pick: (file: File) => Promise<void>;
  setRole: (layer: string, role: LayerRole) => void;
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
  loading: false,
  actionError: null,

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
  setRole: (layer, role) => {
    const nextRoles = { ...get().roles, [layer]: role };
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

  reset: () =>
    set({
      step: 1,
      fileName: null,
      fileSizeBytes: 0,
      doc: null,
      analysis: null,
      roles: {},
      actionError: null,
      loading: false,
    }),

  clearActionError: () => set({ actionError: null }),
}));
