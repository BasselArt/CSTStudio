// حماية المسارات (الطبقة الثانية بعد فحص services — SPEC §11).

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // كل الصفحات عدا: الدخول، مسارات auth، sla-sweep (محمي بترويسة token)، وأصول Next
  matcher: ["/((?!login|api/auth|api/jobs|_next/static|_next/image|favicon.ico).*)"],
};
