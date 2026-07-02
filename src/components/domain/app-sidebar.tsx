"use client";

// القائمة الجانبية اليمنى الكحلية (SPEC §12) — بزر طي.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  ChevronRight,
  ClipboardList,
  LayoutGrid,
  PlusCircle,
  Settings,
  Users,
} from "lucide-react";
import type { Role } from "@/core/types";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  match: (pathname: string, tab: string | null) => boolean;
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
    match: (p) => p === "/requests" || (p.startsWith("/requests/") && p !== "/requests/new"),
  },
  {
    href: "/requests/new",
    label: "طلب جديد",
    icon: PlusCircle,
    match: (p) => p === "/requests/new",
    roles: ["requester", "studio_manager"],
  },
  {
    href: "/team?tab=designers",
    label: "المصممون",
    icon: Users,
    match: (p, tab) => p === "/team" && tab !== "sla",
    roles: ["studio_manager", "executive"],
  },
  {
    href: "/team?tab=sla",
    label: "إعدادات SLA",
    icon: Settings,
    match: (p, tab) => p === "/team" && tab === "sla",
    roles: ["studio_manager"],
  },
];

export function AppSidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const tab = searchParams.get("tab");

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width]",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className="flex items-center gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sidebar-primary text-sm font-bold">
          CST
        </span>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate font-bold">استوديو التصميم</p>
            <p className="truncate text-xs text-sidebar-foreground/70">
              هيئة الاتصالات والفضاء والتقنية
            </p>
          </div>
        ) : null}
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role)).map((item) => {
          const active = item.match(pathname, tab);
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
