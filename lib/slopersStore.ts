import { create } from "zustand";
import * as api from "./api-client";
import { errorCode } from "./api-client";
import type { SloperListItem } from "./types";

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
  init: () => Promise<void>;
  /** Blank when called with no id, drafted from the base when given one. */
  createPattern: (sloperId?: string) => Promise<string | null>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearActionError: () => void;
}

export const useSlopersStore = create<SlopersStore>((set) => ({
  ready: false,
  error: false,
  actionError: null,
  slopers: [],

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
}));
