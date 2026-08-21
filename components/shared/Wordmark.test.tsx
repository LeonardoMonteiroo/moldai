import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Wordmark } from "./Wordmark";

describe("Wordmark", () => {
  it("renders the MoldAI lockup with AI in the accent span", () => {
    // getByText would not match: RTL compares each element's *direct* text
    // children, and the lockup deliberately splits "Mold" from "AI".
    const { container } = render(<Wordmark />);
    expect(container.textContent).toBe("MoldAI");
    expect(container.querySelector(".text-olive")?.textContent).toBe("AI");
  });
});
