import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeUser } from "@/lib/auth/authorize";
import { getUserByEmail } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/hash";
import { consume, reset } from "@/lib/rate-limit/consume";
import { clientIp } from "@/lib/rate-limit/ip";

// Auth.js surfaces a CredentialsSignin subclass's `code` to the caller, so
// /login can tell these apart instead of showing "senha inválida" for both.
class UnverifiedEmailError extends CredentialsSignin {
  code = "unverified_email";
}

class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Self-hosted (Docker/`next start`): Auth.js v5 only trusts the host
  // automatically in dev. In production, without this every auth request fails with UntrustedHost.
  trustHost: true,
  session: { strategy: "jwt" },
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
