import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorizeUser } from "@/lib/auth/authorize";
import { getUserByEmail } from "@/lib/db/users";
import { verifyPassword } from "@/lib/auth/hash";

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Self-hosted (Docker/`next start`): Auth.js v5 só confia no host automaticamente
  // em dev. Em produção, sem isto todo request de auth falha com UntrustedHost.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: (creds) =>
        authorizeUser(creds ?? {}, { getUserByEmail, verify: verifyPassword }),
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
