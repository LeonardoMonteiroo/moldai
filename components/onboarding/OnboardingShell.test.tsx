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
      name: ptBR.Onboarding.step2.importOption.title,
    });
    expect(importOption).toBeDisabled();
    expect(importOption).toHaveAttribute(
      "title",
      ptBR.Onboarding.step2.importOption.comingSoonTitle,
    );

    const fillOption = screen.getByRole("button", {
      name: ptBR.Onboarding.step2.fillOption.title,
    });
    expect(fillOption).toBeDisabled();
    expect(fillOption).toHaveAttribute(
      "title",
      ptBR.Onboarding.step2.fillOption.comingSoonTitle,
    );

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

  it("Pular por agora stamps onboarding and navigates home without generating", async () => {
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
});
