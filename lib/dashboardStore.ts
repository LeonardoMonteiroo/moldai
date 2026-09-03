import { create } from "zustand";
import * as api from "./api-client";
import { errorCode } from "./api-client";
import type {
  PatternListItem,
  RecentUsageEntry,
  AccountSummary,
} from "./api-client";
import type { Credits, GarmentSpec, GarmentType } from "./types";
import type { PreparedAttachment } from "./editor/attachment";

export type TypeFilter = GarmentType | "all";

/**
 * One submit of the new-pattern form. `message` and `name` arrive
 * pre-resolved from the component: the form composes its own pt-BR line from
 * catalog lookups, so this store stays translation-agnostic like every other
 * one. `formSpec` is the structured copy of the same choices, which is what
 * the route actually re-applies over the model's spec.
 */
export interface NewPatternFormInput {
  name: string;
  message: string;
  formSpec: GarmentSpec;
  /** Null when the chart list could not be loaded -- the account's active chart is then used. */
  sizeChartId: string | null;
  images: PreparedAttachment[];
}

/**
 * A discriminated result rather than `string | null`, because the caller has
 * to do two different things with the two outcomes: navigate to the id, or
 * render the failure's own per-code message. `ActionErrorNotice` shows one
 * fixed sentence, so the dialog needs the code itself, and a bare string
 * union would leave "p1" and "insufficient_credits" indistinguishable.
 */
export type CreateFromFormResult =
  { status: "ok"; id: string } | { status: "error"; code: string };

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
  /** True for the whole create-and-generate round trip the form submits. */
  creatingFromForm: boolean;
  /**
   * Set once `api.createPattern` succeeds inside `createFromForm`, so a
   * retry — after buying credits, or after any other failure — resumes the
   * SAME blank Pattern instead of orphaning a new one per attempt. The
   * `createPatternFromImport` precedent. Cleared only on success.
   */
  pendingPatternId: string | null;

  init: () => Promise<void>;
  /** Resolves to null when creation failed — the caller navigates to the id. */
  create: () => Promise<string | null>;
  createFromForm: (input: NewPatternFormInput) => Promise<CreateFromFormResult>;
  clearActionError: () => void;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setSearch: (q: string) => void;
  setTypeFilter: (t: TypeFilter) => void;
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  ready: false,
  error: false,
  actionError: null,
  patterns: [],
  credits: null,
  checklist: null,
  recentUsage: [],
  search: "",
  typeFilter: "all",
  creatingFromForm: false,
  pendingPatternId: null,

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

  // Structurally the same flow as lib/importStore.ts's
  // createPatternFromImport: create (or reuse) one blank Pattern, then
  // generate against it exactly once.
  //
  // ask and decline are successes here. Both leave the model's question or
  // refusal in the pattern's own chat, which is where the user answers it --
  // the editor is the surface the import flow does not have, which is why
  // that one auto-answers a clarify and this one does not.
  createFromForm: async (input) => {
    set({ creatingFromForm: true, actionError: null });
    try {
      const id =
        get().pendingPatternId ??
        (
          await api.createPattern({
            // A blank name is left off the body entirely rather than sent as
            // "", so the route resolves PatternData.newPatternName -- the
            // same default every other create path starts under.
            name: input.name.trim() || undefined,
          })
        ).id;
      set({ pendingPatternId: id });
      const result = await api.generate(id, input.message, {
        formSpec: input.formSpec,
        // Omitted, not sent as null: an absent id means "use the account's
        // active chart", which is what a failed chart fetch falls back to.
        sizeChartId: input.sizeChartId ?? undefined,
        images: input.images,
      });
      if (result.status === "insufficient_credits") {
        // pendingPatternId deliberately survives: buying credits and
        // submitting again resumes this same Pattern.
        set({ creatingFromForm: false, actionError: "insufficient_credits" });
        return { status: "error", code: "insufficient_credits" };
      }
      if (
        result.status !== "ok" &&
        result.status !== "conflict" &&
        result.status !== "clarify" &&
        result.status !== "declined"
      ) {
        set({ creatingFromForm: false, actionError: "create_failed" });
        return { status: "error", code: "create_failed" };
      }
      set({ creatingFromForm: false, pendingPatternId: null });
      return { status: "ok", id };
    } catch (err) {
      const code = errorCode(err);
      set({ creatingFromForm: false, actionError: code });
      return { status: "error", code };
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
