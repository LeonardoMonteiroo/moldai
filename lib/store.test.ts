import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "./store";

describe("editor store — ferramenta e medições", () => {
  beforeEach(() => {
    useEditorStore.setState({ measurements: [], activeTool: "cursor" });
  });

  it("default de ferramenta é cursor", () => {
    expect(useEditorStore.getState().activeTool).toBe("cursor");
  });

  it("addMeasurement acrescenta", () => {
    useEditorStore.getState().addMeasurement({ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    expect(useEditorStore.getState().measurements).toHaveLength(1);
  });

  it("removeMeasurement remove pelo id", () => {
    const s = useEditorStore.getState();
    s.addMeasurement({ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    s.addMeasurement({ id: "m2", a: { x: 0, y: 0 }, b: { x: 8, y: 0 } });
    useEditorStore.getState().removeMeasurement("m1");
    expect(useEditorStore.getState().measurements.map((m) => m.id)).toEqual(["m2"]);
  });

  it("clearMeasurements esvazia", () => {
    useEditorStore.getState().addMeasurement({ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    useEditorStore.getState().clearMeasurements();
    expect(useEditorStore.getState().measurements).toEqual([]);
  });
});
