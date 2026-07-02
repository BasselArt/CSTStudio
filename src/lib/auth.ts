// المصادقة الكاملة (Node): Credentials + bcryptjs، جلسة JWT في httpOnly cookie (SPEC §2).

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcryptjs";
import { redirect } from "next/navigation";
import { authConfig } from "./auth.config";
import { loginSchema } from "@/services/schemas";
import { getUserByEmail } from "@/services/users";
import type { Actor } from "@/services/requests";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const user = await getUserByEmail(parsed.data.email);
        if (!user || !user.isActive) return null;
        if (!compareSync(parsed.data.password, user.passwordHash)) return null;
        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          departmentId: user.departmentId,
        };
      },
    }),
  ],
});

/** المنفّذ الحالي للاستخدام في الصفحات وserver actions — يعيد التوجيه لغير المسجل */
export async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return {
    id: Number(session.user.id),
    role: session.user.role,
    departmentId: session.user.departmentId,
    name: session.user.name ?? "",
  };
}
