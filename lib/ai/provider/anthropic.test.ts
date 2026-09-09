import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LlmCallOptions } from "./types";

vi.mock("@anthropic-ai/sdk", () => {
  const create = vi.fn();
  const Anthropic = vi.fn(() => ({ messages: { create } }));
  return { default: Anthropic };
});

import Anthropic from "@anthropic-ai/sdk";
import { anthropicProvider, ANTHROPIC_OPTIONS } from "./anthropic";

// shared handle for the mock (the factory reuses the same create fn)
const create = new (
  Anthropic as unknown as new () => {
    messages: { create: ReturnType<typeof vi.fn> };
  }
)().messages.create;

function toolResp(input: unknown, id = "toolu_test") {
  return {
    content: [{ type: "tool_use", id, name: "propose_garment", input }],
  };
}

const TOOL = {
  name: "propose_garment",
  description: "d",
  input_schema: { type: "object" as const },
};

function baseOpts(overrides: Partial<LlmCallOptions> = {}): LlmCallOptions {
  return {
    systemStatic: "# Role\nstatic section",
    systemDynamic: "# Current state\ndynamic section",
    tool: TOOL,
    toolChoice: "propose_garment",
    messages: [{ role: "user", content: "I want a t-shirt" }],
    maxTokens: 1024,
    ...overrides,
  };
}

describe("anthropicProvider.model", () => {
  it("returns the fixed model literal, matching buildRequestParams' own", async () => {
    create.mockReset();
    create.mockResolvedValue(toolResp({ decision: "decline" }));
    await anthropicProvider.propose(baseOpts());
    const sentModel = create.mock.calls[0][0].model;
    expect(anthropicProvider.model()).toBe(sentModel);
  });
});

describe("anthropicProvider.propose", () => {
  beforeEach(() => create.mockReset());

  it("returns the tool_use block's raw input", async () => {
    create.mockResolvedValue(toolResp({ decision: "decline" }));
    const result = await anthropicProvider.propose(baseOpts());
    expect(result.toolInput).toEqual({ decision: "decline" });
  });

  it("rejects a max_tokens-truncated response instead of resolving its partial payload", async () => {
    create.mockResolvedValueOnce({
      ...toolResp({ decision: "apply" }),
      stop_reason: "max_tokens",
    });
    // the repair attempt below also truncates, so extractToolUse throws
    // again and the rejection propagates.
    create.mockResolvedValueOnce({
      ...toolResp({ decision: "apply" }),
      stop_reason: "max_tokens",
    });
    await expect(anthropicProvider.propose(baseOpts())).rejects.toThrow(
      /max_tokens/,
    );
  });

  // #18: the image block is attached to the FINAL user turn, appended
  // before the text block.
  it("attaches one attachment's image block to the final user turn, ahead of its text", async () => {
    create.mockResolvedValue(toolResp({ decision: "decline" }));
    await anthropicProvider.propose(
      baseOpts({
        messages: [{ role: "user", content: "uma blusa com gola V" }],
        images: [{ mediaType: "image/jpeg", base64: "ZmFrZS1iYXNlNjQ=" }],
      }),
    );
    const call = create.mock.calls[0][0];
    const messages = call.messages as Array<{ role: string; content: unknown }>;
    const last = messages[messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toEqual([
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: "ZmFrZS1iYXNlNjQ=",
        },
      },
      { type: "text", text: "uma blusa com gola V" },
    ]);
  });

  it("sends a plain text turn (unchanged shape) when no image is attached", async () => {
    create.mockResolvedValue(toolResp({ decision: "decline" }));
    await anthropicProvider.propose(baseOpts());
    const call = create.mock.calls[0][0];
    const messages = call.messages as Array<{ role: string; content: unknown }>;
    expect(typeof messages[messages.length - 1].content).toBe("string");
  });

  it("returns the turns unchanged when the final turn is not a user turn", async () => {
    create.mockResolvedValue(toolResp({ decision: "decline" }));
    await anthropicProvider.propose(
      baseOpts({
        messages: [
          { role: "user", content: "uma blusa" },
          { role: "assistant", content: "Qual decote?" },
        ],
        images: [{ mediaType: "image/jpeg", base64: "frente" }],
      }),
    );
    const call = create.mock.calls[0][0];
    const messages = call.messages as Array<{ role: string; content: unknown }>;
    expect(messages[messages.length - 1].role).toBe("assistant");
    for (const m of messages) expect(typeof m.content).toBe("string");
  });

  it("sends N image blocks then exactly one text block, in the order received", async () => {
    create.mockResolvedValue(toolResp({ decision: "decline" }));
    const images = ["a", "b", "c", "d"].map((base64) => ({
      mediaType: "image/jpeg" as const,
      base64,
    }));
    await anthropicProvider.propose(
      baseOpts({
        messages: [{ role: "user", content: "uma blusa com gola V" }],
        images,
      }),
    );
    const call = create.mock.calls[0][0];
    const messages = call.messages as Array<{ role: string; content: unknown }>;
    expect(messages[messages.length - 1].content).toEqual([
      ...images.map((i) => ({
        type: "image",
        source: { type: "base64", media_type: i.mediaType, data: i.base64 },
      })),
      { type: "text", text: "uma blusa com gola V" },
    ]);
  });

  // The whole point of the split: the static section carries the cache
  // breakpoint, and the per-request dynamic section does not.
  it("caches only the static system block, not the per-request dynamic one", async () => {
    create.mockResolvedValue(toolResp({ decision: "decline" }));
    await anthropicProvider.propose(baseOpts());
    const call = create.mock.calls[0][0];
    expect(call.system).toHaveLength(2);
    expect(call.system[0].cache_control).toEqual({
      type: "ephemeral",
      ttl: "1h",
    });
    expect(call.system[0].text).toBe("# Role\nstatic section");
    expect(call.system[1].cache_control).toBeUndefined();
    expect(call.system[1].text).toBe("# Current state\ndynamic section");
  });

  it("forces tool_choice to the requested tool name", async () => {
    create.mockResolvedValue(toolResp({ decision: "decline" }));
    await anthropicProvider.propose(baseOpts());
    const call = create.mock.calls[0][0];
    expect(call.tool_choice).toEqual({
      type: "tool",
      name: "propose_garment",
    });
    expect(call.tools).toEqual([TOOL]);
  });

  // #61: the SDK's own defaults (10 min timeout, 2 retries) can outlive
  // TX_OPTS.timeout (30s).
  it("bounds the Anthropic client below the 30s transaction timeout", async () => {
    create.mockResolvedValue(toolResp({ decision: "decline" }));
    await anthropicProvider.propose(baseOpts());
    expect(Anthropic).toHaveBeenCalledWith(ANTHROPIC_OPTIONS);
    expect(ANTHROPIC_OPTIONS.timeout).toBeLessThan(30_000);
  });
});

// #261: one repair attempt on an unusable tool payload, mirroring
// Design2GarmentCode's own validation-feedback retry -- feed the specific
// defect back and re-issue once, never twice.
describe("anthropicProvider.propose: repair retry (#261)", () => {
  beforeEach(() => create.mockReset());

  it("repairs a truncated response once and returns the corrected payload", async () => {
    create
      .mockResolvedValueOnce({
        ...toolResp({ decision: "apply" }, "toolu_bad"),
        stop_reason: "max_tokens",
      })
      .mockResolvedValueOnce(toolResp({ decision: "decline" }));

    const result = await anthropicProvider.propose(baseOpts());

    expect(result.toolInput).toEqual({ decision: "decline" });
    expect(create).toHaveBeenCalledTimes(2);

    const repairCall = create.mock.calls[1][0];
    const repairMessages = repairCall.messages as Array<{
      role: string;
      content: unknown;
    }>;
    const last = repairMessages[repairMessages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toEqual([
      expect.objectContaining({
        type: "tool_result",
        tool_use_id: "toolu_bad",
        is_error: true,
        content: expect.stringContaining("max_tokens"),
      }),
    ]);
    const assistantTurn = repairMessages[repairMessages.length - 2];
    expect(assistantTurn.role).toBe("assistant");
  });

  it("gives up after one repair attempt rather than retrying indefinitely", async () => {
    create.mockResolvedValue({
      ...toolResp({ decision: "apply" }),
      stop_reason: "max_tokens",
    });
    await expect(anthropicProvider.propose(baseOpts())).rejects.toThrow(
      /max_tokens/,
    );
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("caps the repair call's own timeout so both attempts stay under the 30s transaction budget", async () => {
    create
      .mockResolvedValueOnce({
        ...toolResp({ decision: "apply" }),
        stop_reason: "max_tokens",
      })
      .mockResolvedValueOnce(toolResp({ decision: "decline" }));

    await anthropicProvider.propose(baseOpts());

    const repairOptions = create.mock.calls[1][1] as { timeout: number };
    expect(repairOptions.timeout).toBeGreaterThan(0);
    expect(ANTHROPIC_OPTIONS.timeout + repairOptions.timeout).toBeLessThan(
      30_000,
    );
  });

  // #261 AC: "the truncation case retries with a larger max_tokens".
  it("raises max_tokens on the repair call specifically for a max_tokens truncation", async () => {
    create
      .mockResolvedValueOnce({
        ...toolResp({ decision: "apply" }),
        stop_reason: "max_tokens",
      })
      .mockResolvedValueOnce(toolResp({ decision: "decline" }));

    await anthropicProvider.propose(baseOpts());

    const primaryParams = create.mock.calls[0][0];
    const repairParams = create.mock.calls[1][0];
    expect(repairParams.max_tokens).toBeGreaterThan(primaryParams.max_tokens);
  });

  it("keeps the requested max_tokens on the repair call for a non-truncation failure (no tool_use block)", async () => {
    create
      .mockResolvedValueOnce({ content: [] })
      .mockResolvedValueOnce(toolResp({ decision: "decline" }));

    await anthropicProvider.propose(baseOpts());

    const primaryParams = create.mock.calls[0][0];
    const repairParams = create.mock.calls[1][0];
    expect(repairParams.max_tokens).toBe(primaryParams.max_tokens);
  });

  it("uses a plain text feedback turn (not tool_result) when the failed attempt had no tool_use block", async () => {
    create
      .mockResolvedValueOnce({ content: [] })
      .mockResolvedValueOnce(toolResp({ decision: "decline" }));

    await anthropicProvider.propose(baseOpts());

    const repairCall = create.mock.calls[1][0];
    const repairMessages = repairCall.messages as Array<{
      role: string;
      content: unknown;
    }>;
    const last = repairMessages[repairMessages.length - 1];
    expect(typeof last.content).toBe("string");
    expect(last.content).toContain("did not return a tool_use block");
  });
});
