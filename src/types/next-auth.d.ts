import type { DefaultSession } from "next-auth";
import type { Role } from "@/core/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      departmentId: number | null;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    role: Role;
    departmentId: number | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    role: Role;
    departmentId: number | null;
  }
}
