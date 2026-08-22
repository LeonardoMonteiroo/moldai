import { create } from "zustand";
import * as api from "./api-client";
import { ApiError } from "./api-client";
import type {
  SizeChartData,
  SizeChartListEntry,
  SizeChartRecord,
} from "./types";

interface SizeChartsStore {
  ready: boolean;
  /** Initial load failed. */
  error: boolean;
  /**
   * Wire code of the last failed mutation, or null. Only init() used to catch,
   * so a failed save left `dirty` true with nothing on screen, and a failed
   * activate or delete silently did nothing at all.
   */
  actionError: string | null;
  charts: SizeChartListEntry[];
  selectedId: string | null;
  draft: SizeChartData | null;
  editingRule: boolean;
  dirty: boolean;

  init: () => Promise<void>;
  select: (id: string) => void;
  updateDraft: (patch: Partial<SizeChartData>) => void;
  setEditingRule: (v: boolean) => void;
  clearActionError: () => void;
  save: () => Promise<void>;
  create: () => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  activate: (id: string) => Promise<void>;
}

function draftFrom(c: SizeChartRecord): SizeChartData {
  const { id: _id, updatedAt: _updatedAt, ...data } = c;
  return data;
}

/** ApiError carries the wire code; anything else (offline, parse) is generic. */
function errorCode(err: unknown): string {
  return err instanceof ApiError ? err.code : "request_failed";
}

export const useSizeChartsStore = create<SizeChartsStore>((set, get) => ({
  ready: false,
  error: false,
  actionError: null,
  charts: [],
  selectedId: null,
  draft: null,
  editingRule: false,
  dirty: false,

  init: async () => {
    set({ ready: false, error: false });
    try {
      const charts = await api.listSizeCharts();
      const active = charts.find((c) => c.isActive) ?? charts[0];
      set({
        charts,
        selectedId: active?.id ?? null,
        draft: active ? draftFrom(active) : null,
        editingRule: false,
        dirty: false,
        ready: true,
      });
    } catch {
      set({ error: true, ready: true });
    }
  },

  select: (id) => {
    const c = get().charts.find((x) => x.id === id);
    if (!c) return;
    set({
      selectedId: id,
      draft: draftFrom(c),
      editingRule: false,
      dirty: false,
    });
  },

  updateDraft: (patch) => {
    const draft = get().draft;
    if (!draft) return;
    set({ draft: { ...draft, ...patch }, dirty: true });
  },

  setEditingRule: (editingRule) => set({ editingRule }),

  clearActionError: () => set({ actionError: null }),

  // dirty stays true on failure: the edit was not persisted, so the screen
  // must not look saved.
  save: async () => {
    const { selectedId, draft } = get();
    if (!selectedId || !draft || draft.isSystem) return;
    let updated: Awaited<ReturnType<typeof api.updateSizeChart>>;
    try {
      updated = await api.updateSizeChart(selectedId, draft);
    } catch (err) {
      set({ actionError: errorCode(err) });
      return;
    }
    set((s) => ({
      charts: s.charts.map((c) =>
        c.id === selectedId ? { ...updated, isActive: c.isActive } : c,
      ),
      draft: draftFrom(updated),
      dirty: false,
    }));
  },

  create: async () => {
    let created: Awaited<ReturnType<typeof api.createSizeChart>>;
    try {
      created = await api.createSizeChart();
    } catch (err) {
      set({ actionError: errorCode(err) });
      return;
    }
    set((s) => ({
      charts: [...s.charts, { ...created, isActive: false }],
      selectedId: created.id,
      draft: draftFrom(created),
      editingRule: false,
      dirty: false,
    }));
  },

  duplicate: async (id) => {
    let created: Awaited<ReturnType<typeof api.duplicateSizeChart>>;
    try {
      created = await api.duplicateSizeChart(id);
    } catch (err) {
      set({ actionError: errorCode(err) });
      return;
    }
    set((s) => ({
      charts: [...s.charts, { ...created, isActive: false }],
      selectedId: created.id,
      draft: draftFrom(created),
      editingRule: false,
      dirty: false,
    }));
  },

  remove: async (id) => {
    try {
      await api.deleteSizeChart(id);
    } catch (err) {
      set({ actionError: errorCode(err) });
      return;
    }
    set((s) => {
      const charts = s.charts.filter((c) => c.id !== id);
      if (s.selectedId !== id) return { charts };
      const next = charts[0];
      return {
        charts,
        selectedId: next?.id ?? null,
        draft: next ? draftFrom(next) : null,
        editingRule: false,
        dirty: false,
      };
    });
  },

  activate: async (id) => {
    try {
      await api.activateSizeChart(id);
    } catch (err) {
      set({ actionError: errorCode(err) });
      return;
    }
    set((s) => ({
      charts: s.charts.map((c) => ({ ...c, isActive: c.id === id })),
    }));
  },
}));
