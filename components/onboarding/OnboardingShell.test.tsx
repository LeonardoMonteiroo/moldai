import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  screen,
  userEvent,
  waitFor,
  ptBR,
  translatorFor,
} from "@/components/test-utils";
import { OnboardingShell } from "./OnboardingShell";
import { COSTS } from "@/lib/types";
import type { Credits } from "@/lib/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-client")>(
      "@/lib/api-client",
    );
  return {
    ...actual,
    listSizeCharts: vi.fn(),
    activateSizeChart: vi.fn(),
    createPattern: vi.fn(),
    generate: vi.fn(),
    completeOnboarding: vi.fn(),
  };
});

import * as api from "@/lib/api-client";

const CREDITS: Credits = {
  plan: "free",
  balance: 30,
  total: 30,
  renewsInDays: 30,
};

async function goToStep2(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("radio", { name: ptBR.Onboarding.step1.brand.title }),
  );
  await user.click(
    screen.getByRole("button", { name: ptBR.Onboarding.continueButton }),
  );
}

async function goToStep3(user: ReturnType<typeof userEvent.setup>) {
  await goToStep2(user);
  await user.click(
    screen.getAllByRole("button", {
      name: ptBR.Onboarding.continueButton,
    })[0],
  );
}

describe("OnboardingShell", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(api.listSizeCharts).mockReset();
    vi.mocked(api.activateSizeChart).mockReset();
    vi.mocked(api.createPattern).mockReset();
    vi.mocked(api.generate).mockReset();
    vi.mocked(api.completeOnboarding).mockReset();
    vi.mocked(api.completeOnboarding).mockResolvedValue({ status: "ok" });
  });

  // Onboarding.dc.html:30 uses a real linear progress bar under the step
  // label, not a dot stepper -- value tracks step/3 (33/67/100%).
  it("shows a progress bar tracking the current step, not a dot stepper", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "33");

    await goToStep2(user);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "67",
    );
  });

  // Onboarding.dc.html:161's selected work-style option uses a 2px border
  // ("border-2 border-olive"), not the app's earlier 1.5px.
  it("marks a selected work-style option with a 2px olive border", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);

    const option = screen.getByRole("radio", {
      name: ptBR.Onboarding.step1.brand.title,
    });
    expect(option).not.toHaveClass("border-2");
    await user.click(option);
    expect(option).toHaveClass("border-2", "border-olive");
  });

  it("shows step 1 of 3 first, and Continuar is disabled until a work style is chosen", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);

    expect(
      screen.getByText(ptBR.Onboarding.stepLabel.replace("{n}", "1")),
    ).toBeInTheDocument();

    const cta = screen.getByRole("button", {
      name: ptBR.Onboarding.continueButton,
    });
    expect(cta).toBeDisabled();

    await user.click(
      screen.getByRole("radio", {
        name: ptBR.Onboarding.step1.patternmaker.title,
      }),
    );
    expect(cta).toBeEnabled();
  });

  it("advances the step marker to 2 of 3 after choosing a work style and continuing", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);

    await goToStep2(user);

    expect(
      screen.getByText(ptBR.Onboarding.stepLabel.replace("{n}", "2")),
    ).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.SizeCharts.systemChartName.female),
    ).toBeInTheDocument();
  });

  it("renders step 2's spreadsheet-import and fill-in-now options disabled and badged, with a reason", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    await goToStep2(user);

    const importOption = screen.getByRole("button", {
      name: new RegExp(ptBR.Onboarding.step2.importOption.title),
    });
    expect(importOption).toBeDisabled();
    expect(importOption).toHaveAttribute(
      "title",
      ptBR.Onboarding.step2.importOption.comingSoonTitle,
    );
    expect(
      screen.getByText(ptBR.Onboarding.step2.importOption.subtitle),
    ).toBeInTheDocument();

    const fillOption = screen.getByRole("button", {
      name: new RegExp(ptBR.Onboarding.step2.fillOption.title),
    });
    expect(fillOption).toBeDisabled();
    expect(fillOption).toHaveAttribute(
      "title",
      ptBR.Onboarding.step2.fillOption.comingSoonTitle,
    );
    expect(
      screen.getByText(ptBR.Onboarding.step2.fillOption.subtitle),
    ).toBeInTheDocument();

    expect(
      screen.getAllByText(ptBR.Onboarding.step2.comingSoonBadge).length,
    ).toBe(2);
    expect(screen.getByText(ptBR.Onboarding.step2.note)).toBeInTheDocument();
  });

  it("step 3's CTA cost comes from COSTS.adjust, not a hardcoded literal", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    await goToStep3(user);

    const t = translatorFor("Onboarding");
    const expectedCta = t("step3.generateCta", { cost: COSTS.adjust });
    expect(
      screen.getByRole("button", { name: expectedCta }),
    ).toBeInTheDocument();
  });

  it("fills the textarea from a suggestion chip and enables the CTA", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    await goToStep3(user);

    const cta = screen.getByRole("button", {
      name: translatorFor("Onboarding")("step3.generateCta", {
        cost: COSTS.adjust,
      }),
    });
    expect(cta).toBeDisabled();

    await user.click(
      screen.getByRole("button", {
        name: ptBR.Onboarding.step3.suggestionBlouse,
      }),
    );
    expect(
      screen.getByPlaceholderText(ptBR.Onboarding.step3.placeholder),
    ).toHaveValue(ptBR.Onboarding.step3.suggestionBlouse);
    expect(cta).toBeEnabled();
  });

  it("shows the credits pill from the real wallet balance, not a literal 30", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={{ ...CREDITS, balance: 17 }} />);
    await goToStep3(user);

    expect(screen.getByText(/17/)).toBeInTheDocument();
  });

  it("navigates to the drafted pattern on a successful generation", async () => {
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate).mockResolvedValue({ status: "ok" } as never);

    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    await goToStep3(user);

    await user.click(
      screen.getByRole("button", {
        name: ptBR.Onboarding.step3.suggestionDress,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: translatorFor("Onboarding")("step3.generateCta", {
          cost: COSTS.adjust,
        }),
      }),
    );

    await waitFor(() => expect(push).toHaveBeenCalledWith("/pattern/p1"));
    expect(api.completeOnboarding).toHaveBeenCalledWith("brand");
  });

  // #215: a vague first message used to strand the user on a generic error --
  // there is no ClarifyCard here to show the AI's questions. It must instead
  // silently retry with answering:true (the same mechanism ClarifyCard's own
  // "gerar assim mesmo" button uses), which forces the AI to apply its best
  // guess instead of asking again.
  it("retries with answering:true and defaults when the AI asks a clarifying question", async () => {
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate)
      .mockResolvedValueOnce({ status: "clarify" } as never)
      .mockResolvedValueOnce({ status: "ok" } as never);

    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    await goToStep3(user);

    await user.click(
      screen.getByRole("button", {
        name: ptBR.Onboarding.step3.suggestionBlouse,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: translatorFor("Onboarding")("step3.generateCta", {
          cost: COSTS.adjust,
        }),
      }),
    );

    await waitFor(() => expect(push).toHaveBeenCalledWith("/pattern/p1"));
    expect(api.generate).toHaveBeenCalledTimes(2);
    expect(api.generate).toHaveBeenNthCalledWith(
      1,
      "p1",
      ptBR.Onboarding.step3.suggestionBlouse,
    );
    expect(api.generate).toHaveBeenNthCalledWith(
      2,
      "p1",
      ptBR.Onboarding.step3.autoDefaultMessage,
      { answering: true },
    );
  });

  it("leaves the user on step 3 with an error notice, not navigating, when generation fails", async () => {
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate).mockResolvedValue({ status: "declined" } as never);

    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    await goToStep3(user);

    await user.click(
      screen.getByRole("button", {
        name: ptBR.Onboarding.step3.suggestionTshirt,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: translatorFor("Onboarding")("step3.generateCta", {
          cost: COSTS.adjust,
        }),
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(ptBR.Onboarding.step3.generateError),
      ).toBeInTheDocument(),
    );
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByText(ptBR.Onboarding.step3.title)).toBeInTheDocument();
  });

  it("step 2: Pular por agora stamps onboarding and navigates home without generating", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    await goToStep2(user);

    await user.click(
      screen.getByRole("button", { name: ptBR.Onboarding.skipButton }),
    );

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(api.completeOnboarding).toHaveBeenCalledWith("brand");
    expect(api.generate).not.toHaveBeenCalled();
  });

  it("step 1: Pular por agora is available before any work style is chosen", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);

    await user.click(
      screen.getByRole("button", { name: ptBR.Onboarding.skipButton }),
    );

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(api.completeOnboarding).toHaveBeenCalledWith(undefined);
    expect(api.generate).not.toHaveBeenCalled();
  });

  it("step 3: Pular por agora stamps onboarding and navigates home without generating", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    await goToStep3(user);

    await user.click(
      screen.getByRole("button", { name: ptBR.Onboarding.skipButton }),
    );

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(api.completeOnboarding).toHaveBeenCalledWith("brand");
    expect(api.generate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// #168: the two paths the existing cases stepped past -- step 1's arrow-key
// selection and step 2's "use the default chart" action.
//
// The radiogroup's arrow keys are not a nicety: the options are custom
// buttons with role="radio", so nothing gives them the native
// arrow-to-move behaviour a real radio group has. Without it the group
// announces itself as a radiogroup and then does not behave like one, which
// is worse than an unlabelled control.
//
// The chart action is where a failure is easiest to hide: it activates a
// chart, then advances -- so an activate that failed while the wizard
// advanced anyway would silently leave the account drafting from a chart it
// never chose.
// ---------------------------------------------------------------------------

const SYSTEM_FEMALE = {
  id: "sc-f",
  isSystem: true,
  gender: "female",
} as unknown as Awaited<ReturnType<typeof api.listSizeCharts>>[number];

const CUSTOM = {
  id: "sc-custom",
  isSystem: false,
  gender: "male",
} as unknown as Awaited<ReturnType<typeof api.listSizeCharts>>[number];

function workStyleRadios() {
  return [
    ptBR.Onboarding.step1.patternmaker.title,
    ptBR.Onboarding.step1.brand.title,
    ptBR.Onboarding.step1.personal.title,
  ].map((name) => screen.getByRole("radio", { name }));
}

function selectedIndex() {
  return workStyleRadios().findIndex(
    (r) => r.getAttribute("aria-checked") === "true",
  );
}

describe("OnboardingShell step 1 keyboard selection", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(api.completeOnboarding).mockResolvedValue({ status: "ok" });
  });

  it("selects the first option from nothing on ArrowDown", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    expect(selectedIndex()).toBe(-1);

    workStyleRadios()[0].focus();
    await user.keyboard("{ArrowDown}");
    expect(selectedIndex()).toBe(0);
  });

  it("moves forward and back, and wraps at both ends like a real radiogroup", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    workStyleRadios()[0].focus();

    await user.keyboard("{ArrowDown}"); // -> 0
    await user.keyboard("{ArrowRight}"); // ArrowRight is the same move
    expect(selectedIndex()).toBe(1);

    await user.keyboard("{ArrowUp}");
    expect(selectedIndex()).toBe(0);

    // Wrapping backwards off the first option lands on the last.
    await user.keyboard("{ArrowLeft}");
    expect(selectedIndex()).toBe(workStyleRadios().length - 1);

    // ...and forwards off the last lands back on the first.
    await user.keyboard("{ArrowDown}");
    expect(selectedIndex()).toBe(0);
  });

  it("ignores keys that are not arrows", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    workStyleRadios()[0].focus();

    await user.keyboard("{Escape}");
    await user.keyboard("a");
    expect(selectedIndex()).toBe(-1);
  });
});

describe("OnboardingShell step 2 default chart", () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(api.listSizeCharts).mockReset();
    vi.mocked(api.activateSizeChart).mockReset();
    vi.mocked(api.completeOnboarding).mockResolvedValue({ status: "ok" });
  });

  async function chooseDefaultChart() {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    await goToStep2(user);
    await user.click(
      screen.getByRole("button", {
        name: new RegExp(ptBR.SizeCharts.systemChartName.female),
      }),
    );
    return user;
  }

  it("activates the seeded female system chart and advances to step 3", async () => {
    vi.mocked(api.listSizeCharts).mockResolvedValue([CUSTOM, SYSTEM_FEMALE]);
    await chooseDefaultChart();

    // Picked by isSystem + gender, not by list position -- a custom chart
    // sitting first must not be activated on the user's behalf.
    await waitFor(() =>
      expect(api.activateSizeChart).toHaveBeenCalledWith(SYSTEM_FEMALE.id),
    );
    expect(await screen.findByText(ptBR.Onboarding.step3.title)).toBeVisible();
  });

  it("falls back to the first chart when no seeded female one is listed", async () => {
    vi.mocked(api.listSizeCharts).mockResolvedValue([CUSTOM]);
    await chooseDefaultChart();

    await waitFor(() =>
      expect(api.activateSizeChart).toHaveBeenCalledWith(CUSTOM.id),
    );
  });

  it("advances without activating anything when the account has no charts", async () => {
    vi.mocked(api.listSizeCharts).mockResolvedValue([]);
    await chooseDefaultChart();

    expect(await screen.findByText(ptBR.Onboarding.step3.title)).toBeVisible();
    expect(api.activateSizeChart).not.toHaveBeenCalled();
  });

  // The failure that must not be silent: advancing anyway would leave the
  // account drafting from a chart it never chose.
  it("stays on step 2 with an alert when activation fails", async () => {
    vi.mocked(api.listSizeCharts).mockResolvedValue([SYSTEM_FEMALE]);
    vi.mocked(api.activateSizeChart).mockRejectedValue(
      new Error("network down"),
    );
    await chooseDefaultChart();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        ptBR.Onboarding.step2.chartError,
      ),
    );
    expect(screen.queryByText(ptBR.Onboarding.step3.title)).toBeNull();
    // And the option is usable again for a retry, not left disabled.
    expect(
      screen.getByRole("button", {
        name: new RegExp(ptBR.SizeCharts.systemChartName.female),
      }),
    ).toBeEnabled();
  });

  it("reports a failure to even list the charts the same way", async () => {
    vi.mocked(api.listSizeCharts).mockRejectedValue(new Error("network down"));
    await chooseDefaultChart();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        ptBR.Onboarding.step2.chartError,
      ),
    );
    expect(api.activateSizeChart).not.toHaveBeenCalled();
  });

  // Step 2 is skippable in both directions -- "Continuar" moves on without
  // activating anything, which is what the step's own note promises.
  it("lets the user continue past step 2 without choosing a chart", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    await goToStep2(user);
    expect(screen.getByText(ptBR.Onboarding.step2.note)).toBeVisible();

    await user.click(
      screen.getAllByRole("button", {
        name: ptBR.Onboarding.continueButton,
      })[0],
    );
    expect(screen.getByText(ptBR.Onboarding.step3.title)).toBeVisible();
    expect(api.listSizeCharts).not.toHaveBeenCalled();
  });

  it("goes back to step 1 keeping the chosen work style", async () => {
    const user = userEvent.setup();
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    await goToStep2(user);

    await user.click(
      screen.getByRole("button", { name: ptBR.Onboarding.backButton }),
    );
    expect(
      screen.getByRole("radio", { name: ptBR.Onboarding.step1.brand.title }),
    ).toHaveAttribute("aria-checked", "true");
  });
});

describe("OnboardingShell step heading scale", () => {
  // Onboarding.dc.html sets each step's h1 to `font-display text-title` --
  // 21px Bricolage. It was rendering at `text-body` (16px Archivo), which on
  // the app's first-run screen left the step title barely distinguishable
  // from the 13.5px option titles right under it.
  it("renders the step heading on the display face at the title step", () => {
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveClass("font-display", "text-title");
    expect(heading).not.toHaveClass("text-body");
  });

  it("keeps the option titles a step below the heading", () => {
    renderWithIntl(<OnboardingShell credits={CREDITS} />);
    const option = screen.getByText(ptBR.Onboarding.step1.patternmaker.title);
    expect(option).toHaveClass("text-control");
  });
});
