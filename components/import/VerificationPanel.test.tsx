import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  waitFor,
  translatorFor,
} from "@/components/test-utils";
import { useImportStore } from "@/lib/importStore";
import { VerificationPanel } from "./VerificationPanel";
import { parseDxf } from "@/lib/import/dxf";
import { COSTS } from "@/lib/types";

vi.mock("./renderPreviewImage", () => ({
  renderPreviewImage: vi.fn(
    async () => new File([], "import-preview.png", { type: "image/png" }),
  ),
}));

// prepareImage's real decode path needs a browser image decoder jsdom does
// not provide (the same scope limit lib/editor/attachment.test.ts's own
// suite documents) -- mocked here so this test exercises the click handler's
// own logic rather than an unrelated decode failure.
vi.mock("@/lib/editor/attachment", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/editor/attachment")
  >("@/lib/editor/attachment");
  return {
    ...actual,
    prepareImage: vi.fn(async () => ({
      mediaType: "image/jpeg" as const,
      base64: "abc",
    })),
  };
});

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const tImport = translatorFor("Import");

function docFrom(codes: (string | number)[]) {
  return parseDxf(
    [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      ...codes.map(String),
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n"),
  );
}

const doc = docFrom([
  "0",
  "LWPOLYLINE",
  "8",
  "CUTLAYER",
  "70",
  "1",
  "10",
  "0",
  "20",
  "0",
  "10",
  "5",
  "20",
  "0",
  "10",
  "5",
  "20",
  "5",
]);

beforeEach(() => {
  push.mockReset();
  useImportStore.setState({
    doc,
    analysis: {
      format: "dxf-generic",
      fileName: "oskar.dxf",
      fileSizeBytes: 100,
      unitScaleToCm: 1,
      layers: [],
      suggestedRoles: {},
      pieceCount: 1,
      checks: [],
    },
    pieces: [{ key: "0", widthCm: 5, heightCm: 5 }],
    pieceLabels: {},
    creating: false,
    actionError: null,
  });
});

describe("VerificationPanel — real Importar molde", () => {
  it("shows the button enabled with its cost, once pieceCount > 0", () => {
    renderWithIntl(<VerificationPanel />);
    const button = screen.getByRole("button", {
      name: tImport("createButton", { cost: COSTS.adjust }),
    });
    expect(button).toBeEnabled();
  });

  it("is disabled when pieceCount is 0", () => {
    useImportStore.setState({
      analysis: { ...useImportStore.getState().analysis!, pieceCount: 0 },
    });
    renderWithIntl(<VerificationPanel />);
    expect(
      screen.getByRole("button", {
        name: tImport("createButton", { cost: COSTS.adjust }),
      }),
    ).toBeDisabled();
  });

  it("navigates to the new pattern on success", async () => {
    useImportStore.setState({
      createPatternFromImport: vi.fn(async () => "p1"),
    });
    const user = userEvent.setup();
    renderWithIntl(<VerificationPanel />);
    await user.click(
      screen.getByRole("button", {
        name: tImport("createButton", { cost: COSTS.adjust }),
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pattern/p1"));
  });

  it("shows an error notice and does not navigate on failure", async () => {
    useImportStore.setState({
      createPatternFromImport: vi.fn(async () => {
        useImportStore.setState({ actionError: "create_failed" });
        return null;
      }),
    });
    const user = userEvent.setup();
    renderWithIntl(<VerificationPanel />);
    await user.click(
      screen.getByRole("button", {
        name: tImport("createButton", { cost: COSTS.adjust }),
      }),
    );
    await waitFor(() =>
      expect(screen.getByText(tImport("createError"))).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
