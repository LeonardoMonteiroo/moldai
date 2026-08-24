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
    REDIS_URL: z.string().url().optional(),
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
