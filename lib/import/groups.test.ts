import { describe, it, expect } from "vitest";
import { groupLayers } from "./groups";

describe("groupLayers", () => {
  it("groups layer names that differ only by a leading page prefix (P<n>_)", () => {
    const groups = groupLayers([
      "P1_R150G62B151_CONTINUOUS",
      "P2_R150G62B151_CONTINUOUS",
      "P1_R58G48B146_PDFDASH_50_50",
    ]);
    expect(groups).toEqual([
      {
        key: "R150G62B151_CONTINUOUS",
        layers: ["P1_R150G62B151_CONTINUOUS", "P2_R150G62B151_CONTINUOUS"],
      },
      {
        key: "R58G48B146_PDFDASH_50_50",
        layers: ["P1_R58G48B146_PDFDASH_50_50"],
      },
    ]);
  });

  it("never merges two layers that differ by anything other than the page prefix", () => {
    const groups = groupLayers([
      "P1_R150G62B151_CONTINUOUS",
      "P1_R150G62B151_PDFDASH_500_150",
    ]);
    expect(groups).toHaveLength(2);
  });

  it("leaves a layer with no page prefix (e.g. PAGE_FRAME) in its own group", () => {
    const groups = groupLayers(["PAGE_FRAME", "P1_R0G0B0_CONTINUOUS"]);
    expect(groups).toEqual([
      { key: "PAGE_FRAME", layers: ["PAGE_FRAME"] },
      { key: "R0G0B0_CONTINUOUS", layers: ["P1_R0G0B0_CONTINUOUS"] },
    ]);
  });

  it("preserves this app's own recognised layer names (CONTORNO, COSTURA, ...) as singleton groups", () => {
    const groups = groupLayers(["CONTORNO", "COSTURA", "GRAINLINE"]);
    expect(groups).toEqual([
      { key: "CONTORNO", layers: ["CONTORNO"] },
      { key: "COSTURA", layers: ["COSTURA"] },
      { key: "GRAINLINE", layers: ["GRAINLINE"] },
    ]);
  });

  it("preserves file order of first appearance", () => {
    const groups = groupLayers(["P2_FOO", "P1_BAR", "P1_FOO"]);
    expect(groups.map((g) => g.key)).toEqual(["FOO", "BAR"]);
  });

  it("returns an empty array for an empty input", () => {
    expect(groupLayers([])).toEqual([]);
  });
});
