// المصادقة الكاملة (Node): Credentials + bcryptjs، جلسة JWT في httpOnly cookie (SPEC §2).

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compareSync } from "bcryptjs";
import { redirect } from "next/navigation";
import { authConfig } from "./auth.config";
import { loginSchema } from "@/services/schemas";
import { getUser, getUserByEmail } from "@/services/users";
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

/**
 * المنفّذ الحالي للاستخدام في الصفحات وserver actions — يعيد التوجيه لغير المسجل.
 * يتحقق من وجود المستخدم في القاعدة (لا يكتفي بالـ JWT): جلسة يتيمة بعد
 * إعادة البذور أو حذف/تعطيل المستخدم كانت تُفشل الكتابات بـ
 * «FOREIGN KEY constraint failed» — الآن تعود لصفحة الدخول، وصفحة الدخول
 * لا تعيد توجيه الجلسات اليتيمة فيُستبدل الـ cookie عند الدخول الجديد.
 * القيم تُقرأ من القاعدة لا من الـ token — تغيير الدور/الجهة يسري فورًا.
 */
export async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = await getUser(Number(session.user.id));
  if (!user || !user.isActive) redirect("/login");
  return {
    id: user.id,
    role: user.role,
    departmentId: user.departmentId,
    name: user.name,
  };
}
