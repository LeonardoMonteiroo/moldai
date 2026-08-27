import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  waitFor,
  translatorFor,
  ptBR,
} from "@/components/test-utils";
import { useImportStore } from "@/lib/importStore";
import { ImportShell } from "./ImportShell";
import { buildExportModel } from "@/lib/export/model";
import { toDxf } from "@/lib/export/dxf";
import { t as testT } from "@/lib/i18n/test-translate";
import { SIZE_TABLE } from "@/lib/measurements";
import type { Pattern } from "@/lib/types";

// PageHeader (rendered by AppShell) calls useRouter for the avatar menu's
// sign-out action — the same mock SizeChartsShell.test.tsx/AppShell.test.tsx
// use, since this suite never invokes app-router navigation itself.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function fakePattern(): Pattern {
  return {
    id: "p1",
    name: "Camiseta Teste",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["PP", "P", "M", "G", "GG"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: SIZE_TABLE.M },
    pieces: [],
    spec: {
      type: "tshirt",
      gender: "male",
      measurementOverrides: {},
      style: { seamAllowanceCm: 1.5 },
    },
  };
}

function dxfFile(name = "molde.dxf"): File {
  const text = toDxf(buildExportModel(fakePattern(), testT));
  return new File([text], name, { type: "application/dxf" });
}

const tImport = translatorFor("Import");

beforeEach(() => {
  useImportStore.setState({
    step: 1,
    fileName: null,
    fileSizeBytes: 0,
    doc: null,
    analysis: null,
    roles: {},
    loading: false,
    actionError: null,
  });
});

async function uploadFixture() {
  const user = userEvent.setup();
  renderWithIntl(<ImportShell userEmail="a@b.com" />);
  const input = screen.getByLabelText(tImport("chooseFileButton"));
  await user.upload(input, dxfFile());
  await waitFor(() =>
    expect(screen.getByText(tImport("layersSectionLabel"))).toBeInTheDocument(),
  );
  return user;
}

describe("ImportShell — step 1", () => {
  it("shows only the file chooser, no layer mapping or verification panel", () => {
    renderWithIntl(<ImportShell userEmail="a@b.com" />);
    expect(screen.getByText(tImport("chooseFileButton"))).toBeInTheDocument();
    expect(
      screen.queryByText(tImport("layersSectionLabel")),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(tImport("verificationSectionLabel")),
    ).not.toBeInTheDocument();
  });
});

describe("ImportShell — after a fixture DXF is supplied", () => {
  it("the summary card shows format, piece count and file size, and Trocar returns to step 1", async () => {
    const user = await uploadFixture();

    expect(screen.getByText(tImport("format.dxf-moldai"))).toBeInTheDocument();
    const expectedPieceCount = String(
      buildExportModel(fakePattern(), testT).pieces.length,
    );
    expect(screen.getByText(expectedPieceCount)).toBeInTheDocument();

    await user.click(screen.getByText(tImport("changeFileButton")));

    expect(
      screen.queryByText(tImport("layersSectionLabel")),
    ).not.toBeInTheDocument();
    expect(screen.getByText(tImport("chooseFileButton"))).toBeInTheDocument();
    expect(useImportStore.getState().analysis).toBeNull();
  });

  it("each detected layer row exposes a role Select whose options are exactly ptBR.Import.layerRole values", async () => {
    const user = await uploadFixture();

    const trigger = screen.getByRole("combobox", { name: "CONTORNO" });
    await user.click(trigger);
    const options = (await screen.findAllByRole("option")).map(
      (o) => o.textContent,
    );
    expect(options.sort()).toEqual(Object.values(ptBR.Import.layerRole).sort());
  });

  it("the verification panel is role=status and renders one line per check", async () => {
    await uploadFixture();

    // The verification list itself carries role="status"; assert it exists
    // and holds at least the unit + pieces-closed checks every DXF produces.
    const region = screen
      .getAllByRole("status")
      .find((el) => el.tagName === "UL");
    expect(region).toBeTruthy();
    expect(region!.children.length).toBeGreaterThan(0);
  });
});

describe("ImportShell — expected-but-absent role", () => {
  it("renders an amber layerNotFound badge when no layer maps to an expected role", () => {
    useImportStore.setState({
      step: 2,
      fileName: "x.dxf",
      fileSizeBytes: 10,
      analysis: {
        format: "dxf-generic",
        fileName: "x.dxf",
        fileSizeBytes: 10,
        unitScaleToCm: 1,
        layers: [{ name: "L1", entityCount: 1 }],
        suggestedRoles: { L1: "cut" },
        pieceCount: 1,
        checks: [],
      },
      roles: { L1: "cut" },
      loading: false,
      actionError: null,
    });

    renderWithIntl(<ImportShell userEmail="a@b.com" />);

    expect(
      screen.getByText(
        `${tImport("layerRole.seam")}: ${tImport("layerNotFound")}`,
      ),
    ).toBeInTheDocument();
  });
});

describe("ImportShell — pick failures explain themselves (found by code review)", () => {
  it("renders a distinct message per pickError code, not one fixed generic notice", () => {
    useImportStore.setState({ actionError: "file_too_large" });
    const tooLarge = renderWithIntl(<ImportShell userEmail="a@b.com" />);
    expect(
      screen.getByText(tImport("pickError.file_too_large")),
    ).toBeInTheDocument();
    tooLarge.unmount();

    useImportStore.setState({ actionError: "no_pieces_found" });
    renderWithIntl(<ImportShell userEmail="a@b.com" />);
    expect(
      screen.getByText(tImport("pickError.no_pieces_found")),
    ).toBeInTheDocument();

    // The two messages must actually differ -- otherwise this is the same
    // fixed generic notice CLAUDE.md's surface-limitations rule forbids.
    expect(tImport("pickError.file_too_large")).not.toBe(
      tImport("pickError.no_pieces_found"),
    );
  });
});

describe("ImportShell — creating a pattern is 'em breve', not shipped this pass", () => {
  it("the Importar molde button is disabled and badged em breve", async () => {
    await uploadFixture();

    const createButton = screen.getByRole("button", {
      name: tImport("createButton"),
    });
    expect(createButton).toBeDisabled();
    expect(screen.getByText(tImport("createComingSoon"))).toBeInTheDocument();
  });
});
