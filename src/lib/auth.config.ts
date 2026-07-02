// إعدادات Auth.js الآمنة للـ Edge (يستوردها middleware) — بلا db وبلا bcrypt.

import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/core/types";

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.departmentId = user.departmentId;
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = String(token.uid);
      session.user.role = token.role as Role;
      session.user.departmentId = token.departmentId as number | null;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
