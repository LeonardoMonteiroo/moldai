import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  ptBR,
} from "@/components/test-utils";
import { NewPatternDialog } from "./NewPatternDialog";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function open(overrides: Partial<Parameters<typeof NewPatternDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    onStartFromPrompt: vi.fn(),
    creating: false,
    ...overrides,
  };
  renderWithIntl(<NewPatternDialog {...props} />);
  return props;
}

const t = ptBR.NewPatternDialog;

describe("NewPatternDialog", () => {
  beforeEach(() => push.mockReset());

  it("asks how to start, with the design's three options", () => {
    open();
    expect(screen.getByText(t.title)).toBeVisible();
    expect(screen.getByText(t.subtitle)).toBeVisible();
    for (const option of [
      t.promptOption.title,
      t.formOption.title,
      t.importOption.title,
    ]) {
      expect(screen.getByText(option)).toBeVisible();
    }
  });

  it("creates the pattern from the prompt option", async () => {
    const user = userEvent.setup();
    const props = open();
    await user.click(
      screen.getByRole("button", {
        name: new RegExp(t.promptOption.title),
      }),
    );
    expect(props.onStartFromPrompt).toHaveBeenCalledTimes(1);
  });

  // The whole point of the change: importing a .dxf is one of the ways to
  // start a pattern, reached from here, rather than a separate grid card.
  it("routes the import option to /import and closes", async () => {
    const user = userEvent.setup();
    const props = open();
    await user.click(
      screen.getByRole("button", {
        name: new RegExp(t.importOption.title),
      }),
    );
    expect(push).toHaveBeenCalledWith("/import");
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  // The design's form asks for a per-pattern size chart and several photos.
  // Neither exists: a pattern snapshots the account's active chart, and
  // generate takes exactly one image. Disabled + badged is the honest shape --
  // never hidden, and never a form whose richest fields quietly do nothing.
  it("offers the form option disabled and badged, not hidden or faked", () => {
    open();
    const form = screen.getByRole("button", {
      name: new RegExp(t.formOption.title),
    });
    expect(form).toBeDisabled();
    expect(form).toHaveAttribute("title", t.formOption.comingSoonTitle);
    expect(screen.getByText(t.comingSoonBadge)).toBeVisible();
  });

  it("blocks a second create while one is already in flight", () => {
    open({ creating: true });
    expect(
      screen.getByRole("button", { name: new RegExp(t.promptOption.title) }),
    ).toBeDisabled();
  });
});
