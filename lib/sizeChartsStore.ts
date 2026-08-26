import { create } from "zustand";
import * as api from "./api-client";
import { errorCode } from "./api-client";
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
  /** A save PATCH is in flight — gates the Save button against a double click. */
  saving: boolean;

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

export const useSizeChartsStore = create<SizeChartsStore>((set, get) => ({
  ready: false,
  error: false,
  actionError: null,
  charts: [],
  selectedId: null,
  draft: null,
  editingRule: false,
  dirty: false,
  saving: false,

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
      // #34: saving is scoped to whichever chart's PATCH is in flight — a
      // save started before switching away belongs to the *previous* chart,
      // so it must not leave this one's Save button stuck disabled. The
      // draft-reference check in save() already keeps the old request from
      // overwriting whatever's here now; this just stops it from lying about
      // this chart's own save state too.
      saving: false,
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
    const { selectedId, draft, saving } = get();
    if (!selectedId || !draft || draft.isSystem || saving) return;
    // #34: the draft object sent, kept by reference. updateDraft always
    // creates a new object (`{...draft, ...patch}`), so if the store's draft
    // is still this exact object when the response lands, nothing changed
    // underneath the request and it's safe to replace it with the server's
    // version; if it's a *different* object, the user edited mid-flight and
    // that edit must survive the response instead of being overwritten.
    const sentDraft = draft;
    set({ saving: true });
    let updated: Awaited<ReturnType<typeof api.updateSizeChart>>;
    try {
      updated = await api.updateSizeChart(selectedId, sentDraft);
    } catch (err) {
      set({ actionError: errorCode(err), saving: false });
      return;
    }
    set((s) => ({
      charts: s.charts.map((c) =>
        c.id === selectedId ? { ...updated, isActive: c.isActive } : c,
      ),
      ...(s.draft === sentDraft
        ? { draft: draftFrom(updated), dirty: false }
        : {}),
      saving: false,
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
      saving: false, // #34: new chart, unrelated to whatever save may still be in flight
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
      saving: false, // #34: new chart, unrelated to whatever save may still be in flight
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
        saving: false, // #34: the chart being saved no longer exists
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
