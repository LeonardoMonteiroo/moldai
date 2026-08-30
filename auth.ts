import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeUser } from "@/lib/auth/authorize";
import { getUserByEmail } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/hash";
import { consume, reset } from "@/lib/rate-limit/consume";
import { clientIp } from "@/lib/rate-limit/ip";
import { secureCookiesForEnv } from "@/lib/auth/cookies";

// Auth.js surfaces a CredentialsSignin subclass's `code` to the caller, so
// /login can tell these apart instead of showing "senha inválida" for both.
class UnverifiedEmailError extends CredentialsSignin {
  code = "unverified_email";
}

class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

class NoPasswordError extends CredentialsSignin {
  code = "no_password";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Self-hosted (Docker/`next start`): Auth.js v5 only trusts the host
  // automatically in dev. In production, without this every auth request fails with UntrustedHost.
  trustHost: true,
  // #27: without this, @auth/core derives it from the request's own
  // protocol (node_modules/@auth/core/lib/init.js) -- so a reverse proxy
  // that terminates TLS but doesn't forward x-forwarded-proto: https would
  // silently issue the session cookie without Secure/the __Secure- prefix.
  useSecureCookies: secureCookiesForEnv(process.env.NODE_ENV),
  // #28: explicit rather than inherited -- @auth/core's own default is also
  // 30 days (node_modules/@auth/core/lib/init.js), so this changes nothing
  // today; it makes the session lifetime a decision instead of a value this
  // repo never chose. requireUser() (lib/auth/guard.ts, #62) is what keeps a
  // token from outliving the account it names -- this bounds how long a
  // token can outlive nothing going wrong at all.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds, request) => {
        // Auth.js hands `authorize` the original Request; Next 16 has no
        // request.ip, so the header is the only source.
        const ip = clientIp(request.headers);
        const result = await authorizeUser(
          { ...(creds ?? {}), ip },
          { getUserByEmail, verify: verifyPassword, consume, reset },
        );
        if (result.ok) return result.user;
        if (result.reason === "unverified") throw new UnverifiedEmailError();
        if (result.reason === "rate_limited") throw new RateLimitedError();
        if (result.reason === "no_password") throw new NoPasswordError();
        return null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = (user as { id: string }).id;
      return token;
    },
    session({ session, token }) {
      const uid = token.uid;
      if (typeof uid === "string" && session.user) session.user.id = uid;
      return session;
    },
  },
});
