"use client";

// جرس الإشعارات: عدّاد غير المقروء + أحدث 10 + تعليم الكل كمقروء.
// تحديث بـ polling بسيط كل 60 ثانية (SPEC §18 — لا real-time).

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/lib/format";

interface BellItem {
  id: number;
  requestId: number | null;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsBell({
  initialCount,
  initialItems,
}: {
  initialCount: number;
  initialItems: BellItem[];
}) {
  const [count, setCount] = useState(initialCount);
  const [items, setItems] = useState(initialItems);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = (await res.json()) as { count: number; items: BellItem[] };
      setCount(data.count);
      setItems(data.items);
    } catch {
      /* الشبكة غير متاحة — يُعاد في الدورة القادمة */
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function markAllRead() {
    await fetch("/api/notifications", { method: "POST" });
    refresh();
  }

  function markRead(id: number) {
    const wasUnread = items.find((n) => n.id === id)?.readAt == null;
    if (!wasUnread) return;
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    );
    setCount((prev) => Math.max(0, prev - 1));
    void fetch(`/api/notifications/${id}`, { method: "POST" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="الإشعارات">
          <Bell className="size-5" />
          {count > 0 ? (
            <span className="absolute -top-1 -end-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>الإشعارات</span>
          {count > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs font-normal text-info hover:underline"
            >
              تعليم الكل كمقروء
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">لا إشعارات بعد</p>
        ) : (
          items.map((n) => (
            <DropdownMenuItem key={n.id} asChild className="cursor-pointer">
              <Link
                href={n.requestId ? `/requests/${n.requestId}` : "/requests"}
                onClick={() => markRead(n.id)}
                className="flex w-full flex-col items-start gap-0.5"
              >
                <span className={n.readAt ? "text-muted-foreground" : "font-medium"}>
                  {n.title}
                </span>
                {n.body ? (
                  <span className="line-clamp-1 text-xs text-muted-foreground">{n.body}</span>
                ) : null}
                <span className="text-[10px] text-muted-foreground">
                  {formatDateTime(n.createdAt)}
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
