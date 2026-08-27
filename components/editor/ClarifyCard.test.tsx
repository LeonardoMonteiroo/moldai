import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  userEvent,
} from "@/components/test-utils";
import type { ClarifyQuestion } from "@/lib/types";
import { useEditorStore } from "@/lib/store";
import { ClarifyCard } from "./ClarifyCard";

/**
 * #168: the clarifying-question card had no test. It is the one screen
 * element that BUILDS the next prompt rather than displaying a result, and
 * both of its outgoing paths carry `{ answering: true }` -- the flag the
 * server-side guard uses to stop the AI asking a second time. Drop it and
 * the user is asked the same question forever, each round costing a real
 * `COSTS.adjust` debit; the generation itself still looks fine.
 *
 * The phrase it assembles is the other half: it is sent as natural language
 * for the model to read, so "label: answer" pairs joined by commas is the
 * actual contract, not an implementation detail.
 */

const QUESTIONS: ClarifyQuestion[] = [
  {
    id: "sleeve",
    label: "Manga",
    options: ["curta", "longa"],
    allowOther: false,
  },
  {
    id: "neckline",
    label: "Decote",
    options: ["redondo", "V"],
    allowOther: true,
  },
];

const sendMessage = vi.fn(async () => {});

function renderCard(questions = QUESTIONS) {
  useEditorStore.setState({ sendMessage });
  return renderWithIntl(<ClarifyCard questions={questions} />);
}

function generateButton() {
  return screen.getByRole("button", { name: ptBR.ClarifyCard.generateButton });
}

describe("ClarifyCard", () => {
  beforeEach(() => sendMessage.mockReset());

  it("renders one labelled option group per question", () => {
    renderCard();

    for (const q of QUESTIONS) {
      // Radix ToggleGroup type="single" exposes a radiogroup, which is why
      // each option below is a radio rather than a checkbox.
      const group = screen.getByRole("radiogroup", { name: q.label });
      expect(group).toBeVisible();
      for (const option of q.options) {
        expect(screen.getByRole("radio", { name: option })).toBeInTheDocument();
      }
    }
  });

  it("offers the escape-hatch option only where the AI allowed one", () => {
    renderCard();
    // One "outro" chip, on the neckline question alone.
    expect(
      screen.getAllByRole("radio", { name: ptBR.ClarifyCard.otherOption }),
    ).toHaveLength(1);
  });

  // The gate: a half-answered card must not send, or the assembled phrase
  // carries a literal "null" into the prompt.
  it("keeps the generate button disabled until every question is answered", async () => {
    renderCard();
    const user = userEvent.setup();

    expect(generateButton()).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "curta" }));
    expect(generateButton()).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "redondo" }));
    expect(generateButton()).toBeEnabled();
  });

  it("sends the answers as label/answer pairs, flagged as an answer", async () => {
    renderCard();
    const user = userEvent.setup();

    await user.click(screen.getByRole("radio", { name: "curta" }));
    await user.click(screen.getByRole("radio", { name: "V" }));
    await user.click(generateButton());

    // The `answering` flag is what the server-side guard reads to stop the
    // AI from asking again -- without it this loop never terminates, and
    // every round costs a real credit.
    expect(sendMessage).toHaveBeenCalledWith("Manga: curta, Decote: V", {
      answering: true,
    });
  });

  describe("the free-text 'outro' answer", () => {
    it("reveals a text field only once 'outro' is picked", async () => {
      renderCard();
      const user = userEvent.setup();
      expect(
        screen.queryByPlaceholderText(ptBR.ClarifyCard.otherPlaceholder),
      ).toBeNull();

      await user.click(
        screen.getByRole("radio", { name: ptBR.ClarifyCard.otherOption }),
      );
      expect(
        screen.getByPlaceholderText(ptBR.ClarifyCard.otherPlaceholder),
      ).toBeVisible();
    });

    // "outro" with an empty box is not an answer: it would send the internal
    // "__other__" sentinel, or an empty one, into the prompt.
    it("does not count an empty or whitespace-only free-text box as answered", async () => {
      renderCard();
      const user = userEvent.setup();
      await user.click(screen.getByRole("radio", { name: "curta" }));
      await user.click(
        screen.getByRole("radio", { name: ptBR.ClarifyCard.otherOption }),
      );
      expect(generateButton()).toBeDisabled();

      await user.type(
        screen.getByPlaceholderText(ptBR.ClarifyCard.otherPlaceholder),
        "   ",
      );
      expect(generateButton()).toBeDisabled();
    });

    it("sends the trimmed free text, never the internal sentinel", async () => {
      renderCard();
      const user = userEvent.setup();
      await user.click(screen.getByRole("radio", { name: "curta" }));
      await user.click(
        screen.getByRole("radio", { name: ptBR.ClarifyCard.otherOption }),
      );
      await user.type(
        screen.getByPlaceholderText(ptBR.ClarifyCard.otherPlaceholder),
        "  canoa  ",
      );
      await user.click(generateButton());

      const [phrase] = sendMessage.mock.calls[0] as unknown as [string];
      expect(phrase).toBe("Manga: curta, Decote: canoa");
      expect(phrase).not.toContain("__other__");
    });
  });

  // The bail-out: it sends a real message (so the AI is asked exactly once
  // more, with the same answering guard), not a silent local default.
  it("sends the catalog's generate-anyway phrase, also flagged as an answer", async () => {
    renderCard();
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", {
        name: ptBR.ClarifyCard.generateAnywayButton,
      }),
    );

    expect(sendMessage).toHaveBeenCalledWith(
      ptBR.ClarifyCard.generateAnywayMessage,
      { answering: true },
    );
  });

  it("stays usable with no questions rather than rendering an empty card", async () => {
    renderCard([]);
    const user = userEvent.setup();

    // `every` on an empty list is true, so the button is enabled -- and the
    // bail-out below is what actually makes that harmless.
    await user.click(generateButton());
    expect(sendMessage).toHaveBeenCalledWith("", { answering: true });
  });
});
