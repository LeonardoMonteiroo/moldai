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

  // #257: labels resolve through the SAME PatternData/SizeChartTable
  // catalog keys the generate route (specField/styleField) and the
  // size-chart table (measurement) already resolve these exact field names
  // through -- never a hand-written label map of its own.
  describe("changed fields", () => {
    const t = translatorFor("ChatBubble");
    const tData = translatorFor("PatternData");
    const tMeasurement = translatorFor("SizeChartTable");

    it("lists a changed style field, resolved through the styleField catalog", () => {
      renderWithIntl(
        <ChatBubble message={message({ changedFields: ["style.collar"] })} />,
      );
      expect(
        screen.getByText(
          t("changedFieldsLabel", {
            fields: tData("styleField.collar"),
          }),
        ),
      ).toBeInTheDocument();
    });

    it("lists a changed top-level field, resolved through the specField catalog", () => {
      renderWithIntl(
        <ChatBubble message={message({ changedFields: ["type"] })} />,
      );
      expect(
        screen.getByText(
          t("changedFieldsLabel", { fields: tData("specField.type") }),
        ),
      ).toBeInTheDocument();
    });

    it("lists a changed measurement override, resolved through the measurement catalog", () => {
      renderWithIntl(
        <ChatBubble
          message={message({
            changedFields: ["measurementOverrides.bust"],
          })}
        />,
      );
      expect(
        screen.getByText(
          t("changedFieldsLabel", {
            fields: tMeasurement("measurement.bust"),
          }),
        ),
      ).toBeInTheDocument();
    });

    it("joins several changed fields in order", () => {
      renderWithIntl(
        <ChatBubble
          message={message({
            changedFields: ["style.skirtLengthCm", "style.collar"],
          })}
        />,
      );
      expect(
        screen.getByText(
          t("changedFieldsLabel", {
            fields: [
              tData("styleField.skirtLengthCm"),
              tData("styleField.collar"),
            ].join(", "),
          }),
        ),
      ).toBeInTheDocument();
    });

    it("renders nothing when changedFields is absent", () => {
      renderWithIntl(<ChatBubble message={message()} />);
      expect(
        screen.queryByText(
          t("changedFieldsLabel", { fields: tData("specField.type") }),
        ),
      ).not.toBeInTheDocument();
    });

    it("renders nothing when changedFields is an empty array", () => {
      renderWithIntl(<ChatBubble message={message({ changedFields: [] })} />);
      // Derived from the catalog's own template rather than a pasted pt-BR
      // literal: the static text preceding the "{fields}" placeholder.
      const prefix = ptBR.ChatBubble.changedFieldsLabel.split("{fields}")[0];
      expect(
        screen.queryByText((content) => content.includes(prefix)),
      ).not.toBeInTheDocument();
    });
  });
});
