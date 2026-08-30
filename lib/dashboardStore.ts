import { create } from "zustand";
import * as api from "./api-client";
import { errorCode } from "./api-client";
import type {
  PatternListItem,
  RecentUsageEntry,
  AccountSummary,
} from "./api-client";
import type { Credits, GarmentType } from "./types";

export type TypeFilter = GarmentType | "all";

interface DashboardStore {
  ready: boolean;
  /** Initial load failed — the content region shows an error instead of a list. */
  error: boolean;
  /**
   * Wire code of the last failed *mutation*, or null. Separate from `error`
   * on purpose: a failed load has nothing to show, while a failed rename or
   * delete leaves a perfectly good list that just needs a notice over it.
   * Before this, only init() caught, so those became unhandled rejections and
   * the click looked like it had simply done nothing.
   */
  actionError: string | null;
  patterns: PatternListItem[];
  credits: Credits | null;
  checklist: AccountSummary["checklist"] | null;
  recentUsage: RecentUsageEntry[];
  search: string;
  typeFilter: TypeFilter;

  init: () => Promise<void>;
  /** Resolves to null when creation failed — the caller navigates to the id. */
  create: () => Promise<string | null>;
  clearActionError: () => void;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setSearch: (q: string) => void;
  setTypeFilter: (t: TypeFilter) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  ready: false,
  error: false,
  actionError: null,
  patterns: [],
  credits: null,
  checklist: null,
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
        checklist: summary.checklist,
        recentUsage: summary.recentUsage,
        ready: true,
      });
    } catch {
      set({ error: true, ready: true });
    }
  },

  create: async () => {
    try {
      const { id } = await api.createPattern();
      return id;
    } catch (err) {
      set({ actionError: errorCode(err) });
      return null;
    }
  },

  // The list is updated only after the server confirms, so a failure leaves
  // the row exactly as it was rather than showing a rename that did not happen.
  rename: async (id, name) => {
    try {
      await api.renamePattern(id, name);
    } catch (err) {
      set({ actionError: errorCode(err) });
      return;
    }
    set((s) => ({
      patterns: s.patterns.map((p) => (p.id === id ? { ...p, name } : p)),
    }));
  },

  remove: async (id) => {
    try {
      await api.deletePattern(id);
    } catch (err) {
      set({ actionError: errorCode(err) });
      return;
    }
    set((s) => ({ patterns: s.patterns.filter((p) => p.id !== id) }));
  },

  clearActionError: () => set({ actionError: null }),

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
