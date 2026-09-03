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
// The form step fetches the account's charts on mount; this dialog's own
// behaviour does not depend on the result.
vi.mock("@/lib/api-client", () => ({ listSizeCharts: vi.fn() }));
const { listSizeCharts } = await import("@/lib/api-client");

function open(overrides: Partial<Parameters<typeof NewPatternDialog>[0]> = {}) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    onStartFromPrompt: vi.fn(),
    creating: false,
    onSubmitForm: vi.fn(),
    submittingForm: false,
    ...overrides,
  };
  renderWithIntl(<NewPatternDialog {...props} />);
  return props;
}

function formOption() {
  return screen.getByRole("button", {
    name: new RegExp(ptBR.NewPatternDialog.formOption.title),
  });
}

const t = ptBR.NewPatternDialog;
const tForm = ptBR.NewPatternForm;

describe("NewPatternDialog", () => {
  beforeEach(() => {
    push.mockReset();
    // mockReset, not just mockResolvedValue: the call history has to clear
    // too, or the "not fetched until the form opens" assertion sees the
    // earlier tests' calls.
    vi.mocked(listSizeCharts).mockReset();
    vi.mocked(listSizeCharts).mockResolvedValue([]);
  });

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

  // Was "disabled and badged": the two capabilities the option was withheld
  // for -- a per-molde size chart and more than one image per generation --
  // both exist now, so the honest shape is an enabled option with no
  // "em breve" promise attached to something already shipped.
  it("offers the form option enabled, with nothing left marked em breve", () => {
    open();
    const form = formOption();
    expect(form).toBeEnabled();
    expect(form).not.toHaveAttribute("title");
  });

  it("opens the form step in place, without navigating", async () => {
    const user = userEvent.setup();
    const props = open();

    await user.click(formOption());

    expect(screen.getByLabelText(tForm.field.name)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(props.onOpenChange).not.toHaveBeenCalled();
  });

  it("swaps the dialog's own title and description for the form step's", async () => {
    const user = userEvent.setup();
    open();
    expect(screen.getByText(t.subtitle)).toBeVisible();

    await user.click(formOption());

    expect(screen.getByText(tForm.subtitle)).toBeVisible();
    expect(screen.queryByText(t.subtitle)).not.toBeInTheDocument();
  });

  it("hides the chooser's options while the form step is open", async () => {
    const user = userEvent.setup();
    open();
    await user.click(formOption());
    expect(
      screen.queryByRole("button", { name: new RegExp(t.importOption.title) }),
    ).not.toBeInTheDocument();
  });

  // PFORM-02. The form owns its own state, so this only holds while it stays
  // mounted across the step switch -- which is the whole reason the step is a
  // visibility toggle rather than a conditional render.
  it("keeps what was already typed when Voltar returns to the chooser", async () => {
    const user = userEvent.setup();
    open();
    await user.click(formOption());
    await user.type(screen.getByLabelText(tForm.field.name), "Blusa gola alta");

    await user.click(screen.getByRole("button", { name: tForm.back }));
    expect(screen.getByText(t.subtitle)).toBeVisible();

    await user.click(formOption());
    expect(screen.getByLabelText(tForm.field.name)).toHaveValue(
      "Blusa gola alta",
    );
  });

  it("does not fetch the account's charts until the form step is opened", async () => {
    const user = userEvent.setup();
    open();
    expect(listSizeCharts).not.toHaveBeenCalled();

    await user.click(formOption());
    expect(listSizeCharts).toHaveBeenCalledTimes(1);
  });

  it("hands a filled form straight to its caller", async () => {
    const user = userEvent.setup();
    const props = open();
    await user.click(formOption());
    await user.click(screen.getByRole("button", { name: tForm.submit }));

    expect(props.onSubmitForm).toHaveBeenCalledTimes(1);
    expect(props.onSubmitForm).toHaveBeenCalledWith(
      expect.objectContaining({
        formSpec: expect.objectContaining({ type: "blouse" }),
      }),
    );
  });

  // A Pattern may already exist by then, and dismissing would orphan it with
  // no id retained for the retry.
  it("refuses to close while a form submit is in flight", async () => {
    const user = userEvent.setup();
    const props = open({ submittingForm: true });

    await user.keyboard("{Escape}");

    expect(props.onOpenChange).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: ptBR.Dialog.close }),
    ).not.toBeInTheDocument();
  });

  it("blocks a second create while one is already in flight", () => {
    open({ creating: true });
    expect(
      screen.getByRole("button", { name: new RegExp(t.promptOption.title) }),
    ).toBeDisabled();
    expect(formOption()).toBeDisabled();
  });
});
