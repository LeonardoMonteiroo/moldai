import { create } from "zustand";
import * as api from "./api-client";
import type { PatternListItem, RecentUsageEntry } from "./api-client";
import type { Credits, GarmentType } from "./types";

export type TypeFilter = GarmentType | "all";

interface DashboardStore {
  ready: boolean;
  error: boolean;
  patterns: PatternListItem[];
  credits: Credits | null;
  recentUsage: RecentUsageEntry[];
  search: string;
  typeFilter: TypeFilter;

  init: () => Promise<void>;
  create: () => Promise<string>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setSearch: (q: string) => void;
  setTypeFilter: (t: TypeFilter) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  ready: false,
  error: false,
  patterns: [],
  credits: null,
  recentUsage: [],
  search: "",
  typeFilter: "all",

  init: async () => {
    set({ ready: false, error: false });
    try {
      const [patterns, summary] = await Promise.all([
        api.listPatterns(),
        api.getAccountSummary(),
      ]);
      set({
        patterns,
        credits: summary.credits,
        recentUsage: summary.recentUsage,
        ready: true,
      });
    } catch {
      set({ error: true, ready: true });
    }
  },

  create: async () => {
    const { id } = await api.createPattern();
    return id;
  },

  rename: async (id, name) => {
    await api.renamePattern(id, name);
    set((s) => ({
      patterns: s.patterns.map((p) => (p.id === id ? { ...p, name } : p)),
    }));
  },

  remove: async (id) => {
    await api.deletePattern(id);
    set((s) => ({ patterns: s.patterns.filter((p) => p.id !== id) }));
  },

  setSearch: (search) => set({ search }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
}));

// Pure — takes a slice matching the store's shape so it's usable both from
// a live store snapshot and directly in tests.
export function filteredPatterns(state: {
  patterns: PatternListItem[];
  search: string;
  typeFilter: TypeFilter;
}): PatternListItem[] {
  const q = state.search.trim().toLowerCase();
  return state.patterns.filter((p) => {
    const matchesSearch = !q || p.name.toLowerCase().includes(q);
    const matchesType =
      state.typeFilter === "all" || p.garmentType === state.typeFilter;
    return matchesSearch && matchesType;
  });
}
