import { create } from "zustand";
import * as api from "./api-client";
import type { MoldeListItem, RecentUsageEntry } from "./api-client";
import type { Credits, GarmentType } from "./types";

export type TypeFilter = GarmentType | "all";

interface DashboardStore {
  ready: boolean;
  error: boolean;
  moldes: MoldeListItem[];
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

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  ready: false,
  error: false,
  moldes: [],
  credits: null,
  recentUsage: [],
  search: "",
  typeFilter: "all",

  init: async () => {
    set({ ready: false, error: false });
    try {
      const [moldes, summary] = await Promise.all([
        api.listMoldes(),
        api.getAccountSummary(),
      ]);
      set({
        moldes,
        credits: summary.credits,
        recentUsage: summary.recentUsage,
        ready: true,
      });
    } catch {
      set({ error: true, ready: true });
    }
  },

  create: async () => {
    const { id } = await api.createMolde();
    return id;
  },

  rename: async (id, name) => {
    await api.renameMolde(id, name);
    set((s) => ({
      moldes: s.moldes.map((m) => (m.id === id ? { ...m, name } : m)),
    }));
  },

  remove: async (id) => {
    await api.deleteMolde(id);
    set((s) => ({ moldes: s.moldes.filter((m) => m.id !== id) }));
  },

  setSearch: (search) => set({ search }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
}));

// Pure — takes a slice matching the store's shape so it's usable both from
// a live store snapshot and directly in tests.
export function filteredMoldes(state: {
  moldes: MoldeListItem[];
  search: string;
  typeFilter: TypeFilter;
}): MoldeListItem[] {
  const q = state.search.trim().toLowerCase();
  return state.moldes.filter((m) => {
    const matchesSearch = !q || m.name.toLowerCase().includes(q);
    const matchesType =
      state.typeFilter === "all" || m.garmentType === state.typeFilter;
    return matchesSearch && matchesType;
  });
}
