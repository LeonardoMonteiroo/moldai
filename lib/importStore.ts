import { create } from "zustand";
import { parseDxf, type DxfDocument } from "./import/dxf";
import {
  analyzeDxf,
  computeVerification,
  hasClosedPolyline,
} from "./import/analyze";
import { parseRul, analyzeRul } from "./import/rul";
import type { ImportAnalysis, LayerRole, PieceLabel } from "./import/types";
import * as api from "./api-client";
import { errorCode } from "./api-client";
import { detectPieces, type DetectedPiece } from "./import/pieces";
import { buildReconstructionContext } from "./import/reconstructMeta";
import { prepareImage } from "./editor/attachment";

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

/**
 * Wire-ish codes `createPatternFromImport()` can leave in `actionError` —
 * `"insufficient_credits"` and `"image_failed"` are deliberate, resolved to
 * their own message by VerificationPanel; anything else is whatever
 * `errorCode()` extracts from a thrown `ApiError` (or `"request_failed"`),
 * the same loose-string convention `dashboardStore`'s own `actionError`
 * already uses for the same reason — a real server/network failure can
 * name any wire code, not a fixed enum this module can exhaustively predict.
 */
export type ImportCreateErrorCode =
  "create_failed" | "insufficient_credits" | "image_failed" | string;

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
  /** One entry per closed polyline on a cut-role layer — recomputed alongside `roles` (#238 follow-up: creating a Pattern from an import). */
  pieces: DetectedPiece[];
  /** User-assigned garment-part label per DetectedPiece.key, keyed the same way. Optional — marking a piece never blocks anything. */
  pieceLabels: Record<string, { label: PieceLabel; customName?: string }>;
  /** The specific piece currently hovered/focused in PieceLabelPanel — spotlighted in LayerPreviewCanvas. Null when nothing is hovered. */
  hoveredPieceKey: string | null;
  /** True while createPatternFromImport is running its create+generate round trip. */
  creating: boolean;
  /** True while a picked file is being read/parsed — the screen's one live region. */
  loading: boolean;
  /** Code for the last failed pick or reconstruction attempt, or null — resolved through the catalog per-code. */
  actionError: ImportPickErrorCode | ImportCreateErrorCode | null;
  /** Set once `api.createPattern()` succeeds inside `createPatternFromImport`, so a retry (e.g. after buying credits) reuses the same blank Pattern instead of orphaning a new one on every attempt. Cleared on success or on `reset()`. */
  pendingPatternId: string | null;
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
  setPieceLabel: (key: string, label: PieceLabel, customName?: string) => void;
  setHoveredPieceKey: (key: string | null) => void;
  /**
   * Creates a blank Pattern and reconstructs it from this import: the
   * rendered layer-preview image plus measured piece data/labels, through
   * the ordinary generate/attachment pipeline (#238 follow-up). Takes the
   * raw preview `File` (not a `PreparedAttachment`) and runs it through
   * `prepareImage` itself, so an image-prep failure is reported the same
   * way every other failure here is, instead of the caller silently
   * no-op'ing. `message` and `autoDefaultMessage` are pre-resolved catalog
   * strings — this store stays translation-agnostic, matching every other
   * display-text boundary in the app. Returns the new pattern id on
   * success, or null (with `actionError` set) on any failure, the
   * `dashboardStore.create()` precedent. On `insufficient_credits`, the
   * created Pattern's id is kept (`pendingPatternId`) so calling this again
   * — e.g. after the user buys credits — resumes the SAME blank Pattern
   * instead of creating another one.
   */
  createPatternFromImport: (
    imageFile: File,
    message: string,
    autoDefaultMessage: string,
  ) => Promise<string | null>;
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
  pieces: [],
  pieceLabels: {},
  hoveredPieceKey: null,
  creating: false,
  loading: false,
  actionError: null,
  pendingPatternId: null,
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
      pieces: detectPieces(
        doc,
        analysis.suggestedRoles,
        analysis.unitScaleToCm,
      ),
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
      pieces: detectPieces(doc, nextRoles, analysis.unitScaleToCm),
    });
  },

  setHoveredLayers: (layers) => set({ hoveredLayers: layers }),

  setPieceLabel: (key, label, customName) =>
    set((s) => ({
      pieceLabels: {
        ...s.pieceLabels,
        [key]: customName !== undefined ? { label, customName } : { label },
      },
    })),

  setHoveredPieceKey: (key) => set({ hoveredPieceKey: key }),

  createPatternFromImport: async (imageFile, message, autoDefaultMessage) => {
    const { doc, analysis, pieces, pieceLabels, pendingPatternId } = get();
    if (!doc || !analysis) return null;
    set({ creating: true, actionError: null });

    const prepared = await prepareImage(imageFile);
    if ("error" in prepared) {
      set({ creating: false, actionError: "image_failed" });
      return null;
    }
    const image = { mediaType: prepared.mediaType, base64: prepared.base64 };
    const importContext = buildReconstructionContext(
      analysis.fileName,
      pieces,
      pieceLabels,
    );
    try {
      const id = pendingPatternId ?? (await api.createPattern()).id;
      set({ pendingPatternId: id });
      let result = await api.generate(
        id,
        message,
        undefined,
        image,
        importContext,
      );
      if (result.status === "clarify") {
        result = await api.generate(
          id,
          autoDefaultMessage,
          true,
          image,
          importContext,
        );
      }
      if (result.status === "insufficient_credits") {
        set({ creating: false, actionError: "insufficient_credits" });
        return null;
      }
      if (result.status !== "ok" && result.status !== "conflict") {
        set({ creating: false, actionError: "create_failed" });
        return null;
      }
      set({ creating: false, pendingPatternId: null });
      // #232: best-effort ping for the dashboard onboarding checklist --
      // swallowed on failure, must never affect the result of a real import.
      void api.recordChecklistEvent("imported").catch(() => {});
      return id;
    } catch (err) {
      set({ creating: false, actionError: errorCode(err) });
      return null;
    }
  },

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
      pieces: [],
      pieceLabels: {},
      hoveredPieceKey: null,
      creating: false,
      actionError: null,
      pendingPatternId: null,
      rulActionError: null,
      loading: false,
    }),

  clearActionError: () => set({ actionError: null }),
}));
