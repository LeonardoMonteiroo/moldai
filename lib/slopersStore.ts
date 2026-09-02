import { create } from "zustand";
import * as api from "./api-client";
import { errorCode } from "./api-client";
import type { GarmentType, SloperListItem } from "./types";

export type SloperTypeFilter = GarmentType | "all";

interface SlopersStore {
  ready: boolean;
  /** Initial load failed — the content region shows an error instead of a list. */
  error: boolean;
  /**
   * Wire code of the last failed *mutation*, or null. Separate from `error`
   * for the same reason it is on the dashboard store: a failed load has
   * nothing to show, a failed rename leaves a usable screen needing a notice.
   */
  actionError: string | null;
  slopers: SloperListItem[];
  search: string;
  typeFilter: SloperTypeFilter;
  init: () => Promise<void>;
  /** Blank when called with no id, drafted from the base when given one. */
  createPattern: (sloperId?: string) => Promise<string | null>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearActionError: () => void;
  setSearch: (q: string) => void;
  setTypeFilter: (t: SloperTypeFilter) => void;
}

export const useSlopersStore = create<SlopersStore>((set) => ({
  ready: false,
  error: false,
  actionError: null,
  slopers: [],
  search: "",
  typeFilter: "all",

  init: async () => {
    set({ ready: false, error: false });
    try {
      set({ slopers: await api.listSlopers(), ready: true });
    } catch {
      set({ error: true, ready: true });
    }
  },

  // Resolves to the new pattern's id (or null) rather than rejecting, because
  // the caller navigates to it — the dashboardStore.create precedent.
  createPattern: async (sloperId) => {
    try {
      const { id } = await api.createPattern(sloperId);
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
      await api.renameSloper(id, name);
    } catch (err) {
      set({ actionError: errorCode(err) });
      return;
    }
    set((s) => ({
      slopers: s.slopers.map((x) => (x.id === id ? { ...x, name } : x)),
    }));
  },

  remove: async (id) => {
    try {
      await api.deleteSloper(id);
    } catch (err) {
      set({ actionError: errorCode(err) });
      return;
    }
    set((s) => ({ slopers: s.slopers.filter((x) => x.id !== id) }));
  },

  clearActionError: () => set({ actionError: null }),

  setSearch: (search) => set({ search }),
  setTypeFilter: (typeFilter) => set({ typeFilter }),
}));

// Pure — takes a slice matching the store's shape so it's usable both from a
// live store snapshot and directly in tests. Mirrors dashboardStore's
// filteredPatterns exactly.
export function filteredSlopers(state: {
  slopers: SloperListItem[];
  search: string;
  typeFilter: SloperTypeFilter;
}): SloperListItem[] {
  const q = state.search.trim().toLowerCase();
  return state.slopers.filter((s) => {
    const matchesSearch = !q || s.name.toLowerCase().includes(q);
    const matchesType =
      state.typeFilter === "all" || s.garmentType === state.typeFilter;
    return matchesSearch && matchesType;
  });
}
