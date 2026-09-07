import { describe, it, expect } from "vitest";
import {
  renderWithIntl,
  ptBR,
  screen,
  translatorFor,
} from "@/components/test-utils";
import type { ChatMessage } from "@/lib/types";
import { ChatBubble } from "./ChatBubble";

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    author: "ai",
    text: "1. Pences. 2. Ombro. 3. Cava/manga. 4. Lateral. 5. Barra.",
    createdAt: 1,
    ...overrides,
  };
}

describe("ChatBubble", () => {
  // #138: the disclaimer is catalog chrome (Decisions: "the surrounding
  // chrome and the disclaimer come from the catalog"), so it must resolve
  // against the real pt-BR value, never a substring/regex a missing key's
  // literal-key-path fallback could also satisfy.
  it("shows the AI-generated-guidance disclaimer when the message answers an assembly-order question", () => {
    renderWithIntl(<ChatBubble message={message({ assembly: true })} />);
    expect(
      screen.getByText(ptBR.ChatBubble.assemblyDisclaimer),
    ).toBeInTheDocument();
  });

  it("does not show the disclaimer on an ordinary AI reply", () => {
    renderWithIntl(<ChatBubble message={message()} />);
    expect(
      screen.queryByText(ptBR.ChatBubble.assemblyDisclaimer),
    ).not.toBeInTheDocument();
  });

  it("does not show the disclaimer on a conflict-toned reply either", () => {
    renderWithIntl(<ChatBubble message={message({ tone: "conflict" })} />);
    expect(
      screen.queryByText(ptBR.ChatBubble.assemblyDisclaimer),
    ).not.toBeInTheDocument();
  });

  it("still shows chips and text alongside the disclaimer", () => {
    renderWithIntl(
      <ChatBubble
        message={message({
          assembly: true,
          chips: [{ label: "−1 crédito", tone: "credit" }],
        })}
      />,
    );
    expect(screen.getByText("−1 crédito")).toBeInTheDocument();
    expect(
      screen.getByText(ptBR.ChatBubble.assemblyDisclaimer),
    ).toBeInTheDocument();
  });

  // PFORM-68. The chip's label is an ICU plural now, so it is resolved
  // through translatorFor rather than read off the catalog object: the raw
  // value is "{count, plural, ...}", which no rendered text ever equals.
  describe("attachment chip", () => {
    const t = translatorFor("ChatBubble");

    function userMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
      return message({
        author: "user",
        text: "como nessas fotos",
        ...overrides,
      });
    }

    it("says how many images a turn carried when it carried several", () => {
      renderWithIntl(
        <ChatBubble message={userMessage({ hasImage: true, imageCount: 3 })} />,
      );
      expect(
        screen.getByText(t("imagesAttached", { count: 3 })),
      ).toBeInTheDocument();
    });

    it("uses the singular form for a single image", () => {
      renderWithIntl(
        <ChatBubble message={userMessage({ hasImage: true, imageCount: 1 })} />,
      );
      expect(
        screen.getByText(t("imagesAttached", { count: 1 })),
      ).toBeInTheDocument();
    });

    // A message persisted before a turn could carry more than one attachment
    // has hasImage and no count. It must read as exactly one rather than
    // rendering a bare "#" or vanishing.
    it("reads a message with no imageCount as exactly one image", () => {
      renderWithIntl(<ChatBubble message={userMessage({ hasImage: true })} />);
      expect(
        screen.getByText(t("imagesAttached", { count: 1 })),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(t("imagesAttached", { count: 2 })),
      ).not.toBeInTheDocument();
    });

    it("shows no chip on a turn that carried no image", () => {
      renderWithIntl(<ChatBubble message={userMessage()} />);
      expect(
        screen.queryByText(t("imagesAttached", { count: 1 })),
      ).not.toBeInTheDocument();
    });
  });

  // #258: the model's own part-by-part read of the attached image, rendered
  // right under the chip that already says how many images the turn
  // carried -- something the user can see and correct, not a silent misread.
  describe("garmentReading", () => {
    function userMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
      return message({
        author: "user",
        text: "como nessa foto",
        hasImage: true,
        imageCount: 1,
        ...overrides,
      });
    }

    it("renders the reading under the attachment chip", () => {
      renderWithIntl(
        <ChatBubble
          message={userMessage({
            garmentReading: "Gola V, manga curta, barra reta.",
          })}
        />,
      );
      expect(
        screen.getByText("Gola V, manga curta, barra reta."),
      ).toBeInTheDocument();
      expect(
        screen.getByText(ptBR.ChatBubble.garmentReadingLabel),
      ).toBeInTheDocument();
    });

    it("shows nothing when the turn has no reading", () => {
      renderWithIntl(<ChatBubble message={userMessage()} />);
      expect(
        screen.queryByText(ptBR.ChatBubble.garmentReadingLabel),
      ).not.toBeInTheDocument();
    });
  });
});
