import { create } from "zustand";
import * as api from "./api-client";
import type {
  SizeChartData,
  SizeChartListEntry,
  SizeChartRecord,
} from "./types";

interface SizeChartsStore {
  ready: boolean;
  error: boolean;
  charts: SizeChartListEntry[];
  selectedId: string | null;
  draft: SizeChartData | null;
  editingRule: boolean;
  dirty: boolean;

  init: () => Promise<void>;
  select: (id: string) => void;
  updateDraft: (patch: Partial<SizeChartData>) => void;
  setEditingRule: (v: boolean) => void;
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

  save: async () => {
    const { selectedId, draft } = get();
    if (!selectedId || !draft || draft.isSystem) return;
    const updated = await api.updateSizeChart(selectedId, draft);
    set((s) => ({
      charts: s.charts.map((c) =>
        c.id === selectedId ? { ...updated, isActive: c.isActive } : c,
      ),
      draft: draftFrom(updated),
      dirty: false,
    }));
  },

  create: async () => {
    const created = await api.createSizeChart();
    set((s) => ({
      charts: [...s.charts, { ...created, isActive: false }],
      selectedId: created.id,
      draft: draftFrom(created),
      editingRule: false,
      dirty: false,
    }));
  },

  duplicate: async (id) => {
    const created = await api.duplicateSizeChart(id);
    set((s) => ({
      charts: [...s.charts, { ...created, isActive: false }],
      selectedId: created.id,
      draft: draftFrom(created),
      editingRule: false,
      dirty: false,
    }));
  },

  remove: async (id) => {
    await api.deleteSizeChart(id);
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
    await api.activateSizeChart(id);
    set((s) => ({
      charts: s.charts.map((c) => ({ ...c, isActive: c.id === id })),
    }));
  },
}));
