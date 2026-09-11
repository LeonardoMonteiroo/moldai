import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { LlmCallOptions } from "./types";
import { LlmProposeError } from "./types";
import { openaiCompatProvider } from "./openaiCompat";

const ORIGINAL_ENV = {
  LLM_BASE_URL: process.env.LLM_BASE_URL,
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_MODEL: process.env.LLM_MODEL,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function chatResp(
  toolCalls: { name: string; arguments: string }[] | undefined,
  overrides: Partial<{ finish_reason: string; content: string | null }> = {},
) {
  return {
    choices: [
      {
        finish_reason: overrides.finish_reason ?? "tool_calls",
        message: {
          role: "assistant",
          content: overrides.content ?? null,
          tool_calls: toolCalls?.map((call, i) => ({
            id: `call_${i}`,
            type: "function" as const,
            function: call,
          })),
        },
      },
    ],
  };
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
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

// #276: lib/ai/index.ts's Langfuse trace reads this to label the model that
// actually answered the call.
describe("openaiCompatProvider.model", () => {
  // Restored by the file-level afterEach above -- no second copy needed.
  it("reflects LLM_MODEL when set", () => {
    process.env.LLM_MODEL = "qwen-test";
    expect(openaiCompatProvider.model()).toBe("qwen-test");
  });

  it("defaults to 'local-model' when unset", () => {
    delete process.env.LLM_MODEL;
    expect(openaiCompatProvider.model()).toBe("local-model");
  });
});

describe("openaiCompatProvider.propose", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns the tool call's parsed arguments", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        chatResp([
          {
            name: "propose_garment",
            arguments: JSON.stringify({ decision: "decline" }),
          },
        ]),
      ),
    );
    const result = await openaiCompatProvider.propose(baseOpts());
    expect(result.toolInput).toEqual({ decision: "decline" });
  });

  // #276: token usage/repair status feed the Langfuse trace
  // (lib/observability/langfuse.ts) via lib/ai/index.ts.
  it("returns token usage and repaired=false for a clean first attempt", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        ...chatResp([
          {
            name: "propose_garment",
            arguments: JSON.stringify({ decision: "decline" }),
          },
        ]),
        usage: { prompt_tokens: 400, completion_tokens: 60 },
      }),
    );
    const result = await openaiCompatProvider.propose(baseOpts());
    expect(result.usage).toEqual({ inputTokens: 400, outputTokens: 60 });
    expect(result.repaired).toBe(false);
  });

  it("tolerates a mock response with no usage field", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        chatResp([
          {
            name: "propose_garment",
            arguments: JSON.stringify({ decision: "decline" }),
          },
        ]),
      ),
    );
    const result = await openaiCompatProvider.propose(baseOpts());
    expect(result.usage).toBeUndefined();
  });

  it("posts to LLM_BASE_URL's /chat/completions with a bearer auth header", async () => {
    process.env.LLM_BASE_URL = "http://gpu-box:8000/v1";
    process.env.LLM_API_KEY = "secret-key";
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        chatResp([{ name: "propose_garment", arguments: JSON.stringify({}) }]),
      ),
    );
    await openaiCompatProvider.propose(baseOpts());
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://gpu-box:8000/v1/chat/completions");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret-key");
  });

  it("defaults base URL, api key, and model when unset", async () => {
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        chatResp([{ name: "propose_garment", arguments: JSON.stringify({}) }]),
      ),
    );
    await openaiCompatProvider.propose(baseOpts());
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("http://localhost:8000/v1/chat/completions");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer not-needed");
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("local-model");
    expect(openaiCompatProvider.model()).toBe("local-model");
  });

  it("model() reflects LLM_MODEL when set", () => {
    process.env.LLM_MODEL = "qwen-test";
    expect(openaiCompatProvider.model()).toBe("qwen-test");
  });

  it("forces tool_choice to the requested function name", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        chatResp([{ name: "propose_garment", arguments: JSON.stringify({}) }]),
      ),
    );
    await openaiCompatProvider.propose(baseOpts());
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.tool_choice).toEqual({
      type: "function",
      function: { name: "propose_garment" },
    });
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: TOOL.name,
          description: TOOL.description,
          parameters: TOOL.input_schema,
        },
      },
    ]);
  });

  it("joins the static and dynamic system sections into one system message", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        chatResp([{ name: "propose_garment", arguments: JSON.stringify({}) }]),
      ),
    );
    await openaiCompatProvider.propose(baseOpts());
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.messages[0]).toEqual({
      role: "system",
      content: "# Role\nstatic section\n\n# Current state\ndynamic section",
    });
  });

  it("attaches an image_url content part ahead of the text on the final user turn", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        chatResp([{ name: "propose_garment", arguments: JSON.stringify({}) }]),
      ),
    );
    await openaiCompatProvider.propose(
      baseOpts({
        messages: [{ role: "user", content: "uma blusa com gola V" }],
        images: [{ mediaType: "image/jpeg", base64: "ZmFrZQ==" }],
      }),
    );
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init?.body as string);
    const last = body.messages[body.messages.length - 1];
    expect(last.role).toBe("user");
    expect(last.content).toEqual([
      {
        type: "image_url",
        image_url: { url: "data:image/jpeg;base64,ZmFrZQ==" },
      },
      { type: "text", text: "uma blusa com gola V" },
    ]);
  });

  it("leaves messages unchanged when the final turn is not a user turn", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        chatResp([{ name: "propose_garment", arguments: JSON.stringify({}) }]),
      ),
    );
    await openaiCompatProvider.propose(
      baseOpts({
        messages: [
          { role: "user", content: "uma blusa" },
          { role: "assistant", content: "Qual decote?" },
        ],
        images: [{ mediaType: "image/jpeg", base64: "frente" }],
      }),
    );
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(init?.body as string);
    const last = body.messages[body.messages.length - 1];
    expect(last).toEqual({ role: "assistant", content: "Qual decote?" });
  });

  it("throws when the endpoint responds with a non-ok status", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: "boom" }, false, 500),
    );
    await expect(openaiCompatProvider.propose(baseOpts())).rejects.toThrow(
      /local LLM endpoint returned 500/,
    );
  });

  it("rejects a response truncated at max_tokens and repairs with a larger budget", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          ...chatResp(
            [
              {
                name: "propose_garment",
                arguments: JSON.stringify({ decision: "apply" }),
              },
            ],
            { finish_reason: "length" },
          ),
          usage: { prompt_tokens: 200, completion_tokens: 30 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...chatResp([
            {
              name: "propose_garment",
              arguments: JSON.stringify({ decision: "decline" }),
            },
          ]),
          usage: { prompt_tokens: 250, completion_tokens: 5 },
        }),
      );

    const result = await openaiCompatProvider.propose(baseOpts());
    expect(result.toolInput).toEqual({ decision: "decline" });
    expect(fetch).toHaveBeenCalledTimes(2);
    // #276: both the truncated first attempt and the repair are real calls
    // -- their usage is summed, not just the repair's own.
    expect(result.repaired).toBe(true);
    expect(result.usage).toEqual({ inputTokens: 450, outputTokens: 35 });

    const [, repairInit] = vi.mocked(fetch).mock.calls[1];
    const repairBody = JSON.parse(repairInit?.body as string);
    expect(repairBody.max_tokens).toBeGreaterThan(baseOpts().maxTokens);
  });

  it("gives up after one repair attempt", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        chatResp(
          [
            {
              name: "propose_garment",
              arguments: JSON.stringify({ decision: "apply" }),
            },
          ],
          { finish_reason: "length" },
        ),
      ),
    );
    await expect(openaiCompatProvider.propose(baseOpts())).rejects.toThrow(
      /truncated/,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // #276: both attempts are real calls -- when the repair ALSO fails,
  // propose() still throws (one repair attempt, never a second), but their
  // combined usage must not be silently lost. lib/ai/index.ts reads it off
  // this thrown error to keep the Langfuse trace honest on this path.
  it("carries both attempts' summed usage on the thrown error when the repair also fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          ...chatResp(
            [
              {
                name: "propose_garment",
                arguments: JSON.stringify({ decision: "apply" }),
              },
            ],
            { finish_reason: "length" },
          ),
          usage: { prompt_tokens: 200, completion_tokens: 30 },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ...chatResp(
            [
              {
                name: "propose_garment",
                arguments: JSON.stringify({ decision: "apply" }),
              },
            ],
            { finish_reason: "length" },
          ),
          usage: { prompt_tokens: 250, completion_tokens: 40 },
        }),
      );

    const err = await openaiCompatProvider
      .propose(baseOpts())
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LlmProposeError);
    const proposeErr = err as LlmProposeError;
    expect(proposeErr.message).toMatch(/truncated/);
    expect(proposeErr.repaired).toBe(true);
    expect(proposeErr.usage).toEqual({ inputTokens: 450, outputTokens: 70 });
  });

  // #276: the repair call's own network/transport failure (never even
  // reaching a repair response) still leaves the first attempt's usage
  // known.
  it("carries only the first attempt's usage on the thrown error when the repair call itself fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          ...chatResp(
            [
              {
                name: "propose_garment",
                arguments: JSON.stringify({ decision: "apply" }),
              },
            ],
            { finish_reason: "length" },
          ),
          usage: { prompt_tokens: 200, completion_tokens: 30 },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, false, 500));

    const err = await openaiCompatProvider
      .propose(baseOpts())
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(LlmProposeError);
    const proposeErr = err as LlmProposeError;
    expect(proposeErr.message).toMatch(/local LLM endpoint returned 500/);
    expect(proposeErr.repaired).toBe(true);
    expect(proposeErr.usage).toEqual({ inputTokens: 200, outputTokens: 30 });
  });

  it("repairs a call with no tool_calls using a plain tool-role feedback message", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(chatResp(undefined)))
      .mockResolvedValueOnce(
        jsonResponse(
          chatResp([
            {
              name: "propose_garment",
              arguments: JSON.stringify({ decision: "decline" }),
            },
          ]),
        ),
      );

    const result = await openaiCompatProvider.propose(baseOpts());
    expect(result.toolInput).toEqual({ decision: "decline" });

    const [, repairInit] = vi.mocked(fetch).mock.calls[1];
    const repairBody = JSON.parse(repairInit?.body as string);
    const messages = repairBody.messages as Array<{
      role: string;
      content: unknown;
    }>;
    const last = messages[messages.length - 1];
    expect(last).toEqual({
      role: "user",
      content: expect.stringContaining("Invalid tool call"),
    });
  });

  it("repairs a call with invalid JSON arguments, replaying the failed assistant turn with a tool-role message", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(
          chatResp([{ name: "propose_garment", arguments: "{not json" }]),
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          chatResp([
            {
              name: "propose_garment",
              arguments: JSON.stringify({ decision: "decline" }),
            },
          ]),
        ),
      );

    const result = await openaiCompatProvider.propose(baseOpts());
    expect(result.toolInput).toEqual({ decision: "decline" });

    const [, repairInit] = vi.mocked(fetch).mock.calls[1];
    const repairBody = JSON.parse(repairInit?.body as string);
    const messages = repairBody.messages as Array<{
      role: string;
      content?: unknown;
      tool_call_id?: string;
    }>;
    const toolMessage = messages[messages.length - 1];
    expect(toolMessage.role).toBe("tool");
    expect(toolMessage.tool_call_id).toBe("call_0");
    const assistantTurn = messages[messages.length - 2];
    expect(assistantTurn.role).toBe("assistant");
  });

  it("keeps the requested max_tokens on the repair call for a non-truncation failure", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(chatResp(undefined)))
      .mockResolvedValueOnce(
        jsonResponse(
          chatResp([
            {
              name: "propose_garment",
              arguments: JSON.stringify({ decision: "decline" }),
            },
          ]),
        ),
      );

    await openaiCompatProvider.propose(baseOpts());

    const [, primaryInit] = vi.mocked(fetch).mock.calls[0];
    const [, repairInit] = vi.mocked(fetch).mock.calls[1];
    const primaryBody = JSON.parse(primaryInit?.body as string);
    const repairBody = JSON.parse(repairInit?.body as string);
    expect(repairBody.max_tokens).toBe(primaryBody.max_tokens);
  });
});
