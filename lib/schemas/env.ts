import { z } from "zod";

// #57: DATABASE_URL/AUTH_SECRET/ANTHROPIC_API_KEY are required in every
// environment -- a bare `npm run dev` needs a real DB connection and a real
// Anthropic key just as much as production does. APP_URL/SMTP_HOST stay
// optional here and are required only in production (superRefine below),
// mirroring the existing NODE_ENV-gated checks in lib/mail/send.ts -- this
// schema now runs those same checks before the server accepts its first
// request, instead of on the first mail send.
const serverEnvSchema = z
  .object({
    NODE_ENV: z.string().optional(),
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(32),
    ANTHROPIC_API_KEY: z.string().min(1),
    // #269 provider facade: all four optional, all default-free in CI (the
    // "build" job injects only a dummy ANTHROPIC_API_KEY,
    // .github/workflows/ci.yml) -- Anthropic stays the one provider every
    // environment can run with zero extra config. Unset or unrecognized ->
    // lib/ai/provider/registry.ts's getProvider() falls back to "anthropic"
    // rather than throwing; these are read here only so a typo'd value
    // fails loudly at boot instead of silently talking to the wrong host.
    LLM_PROVIDER: z.enum(["anthropic", "local"]).optional(),
    LLM_BASE_URL: z.string().url().optional(),
    LLM_MODEL: z.string().min(1).optional(),
    LLM_API_KEY: z.string().min(1).optional(),
    REDIS_URL: z.string().url().optional(),
    // #275: optional, no superRefine entry -- unset stays legal in every
    // environment including production, same as REDIS_URL/LLM_BASE_URL
    // above. This is the repo's first NEXT_PUBLIC_* var: it has to carry
    // that prefix because instrumentation-client.ts (the browser SDK) needs
    // it, which is also why the value is baked in at Docker BUILD time (see
    // the Dockerfile's ARG NEXT_PUBLIC_SENTRY_DSN) rather than only read at
    // runtime like every other var here. One var serves both the server and
    // browser SDKs on purpose -- see lib/observability/sentry.ts.
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    APP_URL: z.string().url().optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (!env.APP_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_URL"],
        message:
          "APP_URL is required in production -- without it, verification/reset links mail as http://localhost:3000",
      });
    }
    if (!env.SMTP_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message:
          "SMTP_HOST is required in production -- without it, sendMail throws MailUnavailableError on every send",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class ServerEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerEnvError";
  }
}

// Pure -- takes the env record as a parameter instead of reading
// process.env itself, so instrumentation.ts's register() (the one real
// caller) and a test can run the identical validation without either one
// mutating or depending on the live process.env.
export function parseServerEnv(
  env: Record<string, string | undefined>,
): ServerEnv {
  const result = serverEnvSchema.safeParse(env);
  if (result.success) return result.data;
  const lines = result.error.issues.map(
    (issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );
  throw new ServerEnvError(`Invalid server environment:\n${lines.join("\n")}`);
}
