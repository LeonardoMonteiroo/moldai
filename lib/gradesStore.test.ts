import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GradeListEntry } from "./types";

vi.mock("./api-client", () => ({
  listGrades: vi.fn(),
  createGrade: vi.fn(),
  updateGrade: vi.fn(),
  deleteGrade: vi.fn(),
  duplicateGrade: vi.fn(),
  activateGrade: vi.fn(),
}));

import * as api from "./api-client";
import { useGradesStore } from "./gradesStore";

function entry(overrides: Partial<GradeListEntry> = {}): GradeListEntry {
  return {
    id: "g1",
    updatedAt: "2026-08-19T00:00:00.000Z",
    name: "Feminino adulto",
    gender: "female",
    bodyType: "straight",
    isSystem: true,
    sizes: ["PP", "P", "M", "G", "GG"],
    baseSizeIndex: 2,
    baseMeasurements: {
      bust: 92,
      waist: 74,
      hip: 100,
      hipHeight: 20.6,
      backLength: 41,
      shoulder: 18.5,
      skirtLength: 60,
      shortSleeveLength: 18,
      longSleeveLength: 58,
    },
    progressionRule: {},
    overrides: {},
    isActive: false,
    ...overrides,
  };
}

function resetStore() {
  useGradesStore.setState({
    ready: false,
    error: false,
    grades: [],
    selectedId: null,
    draft: null,
    editingRule: false,
    dirty: false,
  });
}

describe("gradesStore.init", () => {
  beforeEach(() => {
    vi.mocked(api.listGrades).mockReset();
    resetStore();
  });

  it("selects the active grade and loads its draft", async () => {
    vi.mocked(api.listGrades).mockResolvedValue([
      entry({ id: "g1", isActive: false }),
      entry({ id: "g2", isActive: true, name: "Masculino" }),
    ]);
    await useGradesStore.getState().init();
    const s = useGradesStore.getState();
    expect(s.ready).toBe(true);
    expect(s.selectedId).toBe("g2");
    expect(s.draft?.name).toBe("Masculino");
  });

  it("sets error and ready on failure", async () => {
    vi.mocked(api.listGrades).mockRejectedValue(new Error("boom"));
    await useGradesStore.getState().init();
    const s = useGradesStore.getState();
    expect(s.error).toBe(true);
    expect(s.ready).toBe(true);
  });
});

describe("gradesStore.updateDraft / save", () => {
  beforeEach(() => {
    vi.mocked(api.updateGrade).mockReset();
    resetStore();
    useGradesStore.setState({
      grades: [entry({ id: "g1", isSystem: false })],
      selectedId: "g1",
      draft: { ...entry({ id: "g1", isSystem: false }) },
    });
  });

  it("updateDraft merges the patch and marks dirty", () => {
    useGradesStore.getState().updateDraft({ name: "Renomeada" });
    const s = useGradesStore.getState();
    expect(s.draft?.name).toBe("Renomeada");
    expect(s.dirty).toBe(true);
  });

  it("save calls the API and clears dirty", async () => {
    vi.mocked(api.updateGrade).mockResolvedValue(
      entry({ id: "g1", isSystem: false, name: "Renomeada" }),
    );
    useGradesStore.getState().updateDraft({ name: "Renomeada" });
    await useGradesStore.getState().save();
    expect(api.updateGrade).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ name: "Renomeada" }),
    );
    expect(useGradesStore.getState().dirty).toBe(false);
  });

  it("save is a no-op for a system grade", async () => {
    useGradesStore.setState({
      draft: { ...entry({ id: "g1", isSystem: true }) },
    });
    await useGradesStore.getState().save();
    expect(api.updateGrade).not.toHaveBeenCalled();
  });
});

describe("gradesStore.create / duplicate / remove / activate", () => {
  beforeEach(() => {
    vi.mocked(api.createGrade).mockReset();
    vi.mocked(api.duplicateGrade).mockReset();
    vi.mocked(api.deleteGrade).mockReset();
    vi.mocked(api.activateGrade).mockReset();
    resetStore();
    useGradesStore.setState({
      grades: [entry({ id: "g1" })],
      selectedId: "g1",
      draft: entry({ id: "g1" }),
    });
  });

  it("create appends the new grade and selects it", async () => {
    vi.mocked(api.createGrade).mockResolvedValue(
      entry({ id: "g2", name: "Nova grade" }),
    );
    await useGradesStore.getState().create();
    const s = useGradesStore.getState();
    expect(s.grades.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(s.selectedId).toBe("g2");
  });

  it("duplicate appends a copy and selects it", async () => {
    vi.mocked(api.duplicateGrade).mockResolvedValue(
      entry({ id: "g3", name: "Feminino adulto (cópia)" }),
    );
    await useGradesStore.getState().duplicate("g1");
    expect(api.duplicateGrade).toHaveBeenCalledWith("g1");
    expect(useGradesStore.getState().selectedId).toBe("g3");
  });

  it("remove drops the grade and reselects another when the selected one is removed", async () => {
    useGradesStore.setState({
      grades: [entry({ id: "g1" }), entry({ id: "g2" })],
      selectedId: "g1",
    });
    vi.mocked(api.deleteGrade).mockResolvedValue(undefined);
    await useGradesStore.getState().remove("g1");
    const s = useGradesStore.getState();
    expect(s.grades.map((g) => g.id)).toEqual(["g2"]);
    expect(s.selectedId).toBe("g2");
  });

  it("activate flips isActive across the list", async () => {
    useGradesStore.setState({
      grades: [
        entry({ id: "g1", isActive: true }),
        entry({ id: "g2", isActive: false }),
      ],
    });
    vi.mocked(api.activateGrade).mockResolvedValue(undefined);
    await useGradesStore.getState().activate("g2");
    const s = useGradesStore.getState();
    expect(s.grades.find((g) => g.id === "g1")?.isActive).toBe(false);
    expect(s.grades.find((g) => g.id === "g2")?.isActive).toBe(true);
  });
});
