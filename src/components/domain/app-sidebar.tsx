"use client";

// القائمة الجانبية اليمنى الكحلية (SPEC §12) — بزر طي، والهوية من الإعدادات.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChevronRight,
  ClipboardList,
  LayoutGrid,
  Settings,
  SlidersHorizontal,
  UserCog,
  Users,
} from "lucide-react";
import type { Role } from "@/core/types";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  match: (pathname: string) => boolean;
  roles?: Role[];
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "لوحة المتابعة",
    icon: LayoutGrid,
    match: (p) => p === "/",
  },
  {
    href: "/requests",
    label: "الطلبات",
    icon: ClipboardList,
    match: (p) => p === "/requests" || p.startsWith("/requests/"),
  },
  {
    href: "/team",
    label: "المصممون",
    icon: Users,
    match: (p) => p === "/team",
    roles: ["studio_manager", "executive"],
  },
  {
    href: "/settings/sla",
    label: "إعدادات SLA",
    icon: SlidersHorizontal,
    match: (p) => p === "/settings/sla",
    roles: ["studio_manager"],
  },
  {
    href: "/users",
    label: "المستخدمون",
    icon: UserCog,
    match: (p) => p === "/users",
    roles: ["studio_manager"],
  },
  {
    href: "/settings",
    label: "الإعدادات",
    icon: Settings,
    match: (p) => p === "/settings",
    roles: ["studio_manager"],
  },
];

export function AppSidebar({
  role,
  orgName,
  orgSubtitle,
  hasLogo,
}: {
  role: Role;
  orgName: string;
  orgSubtitle: string;
  hasLogo: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width]",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className={cn("flex items-center gap-3 p-4", collapsed && "justify-center px-0")}>
        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-sidebar-primary text-sm font-bold">
          {hasLogo ? (
            // شعار من الإعدادات — img عادي يكفي (خارج تحسين next/image عمدًا)
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/api/branding/logo" alt={orgName} className="size-full object-contain p-1" />
          ) : (
            "CST"
          )}
        </span>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate font-bold">{orgName}</p>
            {orgSubtitle ? (
              <p className="truncate text-xs text-sidebar-foreground/70">{orgSubtitle}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role)).map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
                active
                  ? "bg-sidebar-primary font-medium"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className="size-5 shrink-0" />
              {!collapsed ? <span>{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className={cn(
          "m-3 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/80",
          "hover:bg-sidebar-accent hover:text-sidebar-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
          collapsed && "justify-center px-0",
        )}
      >
        <span className="grid size-6 place-items-center rounded-full border border-sidebar-border">
          {/* سهم اتجاهي — ينعكس في RTL */}
          <ChevronRight className={cn("size-4 rtl:rotate-180", collapsed && "rotate-180 rtl:rotate-0")} />
        </span>
        {!collapsed ? <span>طي القائمة</span> : null}
      </button>
    </aside>
  );
}
