import { create } from "zustand";
import * as api from "./api-client";
import type { GradeData, GradeListEntry, GradeRecord } from "./types";

interface GradesStore {
  ready: boolean;
  error: boolean;
  grades: GradeListEntry[];
  selectedId: string | null;
  draft: GradeData | null;
  editingRule: boolean;
  dirty: boolean;

  init: () => Promise<void>;
  select: (id: string) => void;
  updateDraft: (patch: Partial<GradeData>) => void;
  setEditingRule: (v: boolean) => void;
  save: () => Promise<void>;
  create: () => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  activate: (id: string) => Promise<void>;
}

function draftFrom(g: GradeRecord): GradeData {
  const { id: _id, updatedAt: _updatedAt, ...data } = g;
  return data;
}

export const useGradesStore = create<GradesStore>((set, get) => ({
  ready: false,
  error: false,
  grades: [],
  selectedId: null,
  draft: null,
  editingRule: false,
  dirty: false,

  init: async () => {
    set({ ready: false, error: false });
    try {
      const grades = await api.listGrades();
      const active = grades.find((g) => g.isActive) ?? grades[0];
      set({
        grades,
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
    const g = get().grades.find((x) => x.id === id);
    if (!g) return;
    set({
      selectedId: id,
      draft: draftFrom(g),
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
    const updated = await api.updateGrade(selectedId, draft);
    set((s) => ({
      grades: s.grades.map((g) =>
        g.id === selectedId ? { ...updated, isActive: g.isActive } : g,
      ),
      draft: draftFrom(updated),
      dirty: false,
    }));
  },

  create: async () => {
    const created = await api.createGrade();
    set((s) => ({
      grades: [...s.grades, { ...created, isActive: false }],
      selectedId: created.id,
      draft: draftFrom(created),
      editingRule: false,
      dirty: false,
    }));
  },

  duplicate: async (id) => {
    const created = await api.duplicateGrade(id);
    set((s) => ({
      grades: [...s.grades, { ...created, isActive: false }],
      selectedId: created.id,
      draft: draftFrom(created),
      editingRule: false,
      dirty: false,
    }));
  },

  remove: async (id) => {
    await api.deleteGrade(id);
    set((s) => {
      const grades = s.grades.filter((g) => g.id !== id);
      if (s.selectedId !== id) return { grades };
      const next = grades[0];
      return {
        grades,
        selectedId: next?.id ?? null,
        draft: next ? draftFrom(next) : null,
        editingRule: false,
        dirty: false,
      };
    });
  },

  activate: async (id) => {
    await api.activateGrade(id);
    set((s) => ({
      grades: s.grades.map((g) => ({ ...g, isActive: g.id === id })),
    }));
  },
}));
