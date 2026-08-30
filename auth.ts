import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { authorizeUser } from "@/lib/auth/authorize";
import { getUserByEmail, stampEmailVerifiedIfMissing } from "@/lib/db/users";
import { prisma } from "@/lib/db/prisma";
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
  // #235: only used for Google account-linking (Account rows) -- session
  // storage stays JWT (below), so Session/VerificationToken are never
  // actually written. See docs/decisions.md's Authentication section.
  adapter: PrismaAdapter(prisma),
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
    Google({
      // #235: Google verifies email ownership itself -- exactly the trust
      // this repo already places in its own mailed verification link -- so
      // a Google sign-in auto-links to an existing Credentials row sharing
      // that email instead of throwing OAuthAccountNotLinked. The signIn
      // callback below adds one more check on top: it refuses the sign-in
      // outright if Google's own profile claims the email is NOT verified,
      // so this flag is never trusted blindly on its own.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async signIn({ account, user, profile }) {
      if (account?.provider !== "google") return true;
      // #235: the raw Google profile (not the adapter-mapped `user`) is
      // what carries email_verified -- a defensive second check on top of
      // allowDangerousEmailAccountLinking, never trusting that flag alone.
      const emailVerified =
        (profile as { email_verified?: boolean } | undefined)
          ?.email_verified === true;
      if (!emailVerified) return false;
      // Retroactive verification: an existing Credentials row that never
      // clicked its own mail link gets emailVerified stamped now, from
      // strictly stronger evidence. No-ops for an already-verified row and
      // for a brand-new user (the adapter already stamped it on creation).
      if (user.id) await stampEmailVerifiedIfMissing(user.id);
      return true;
    },
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
