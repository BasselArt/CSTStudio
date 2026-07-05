// التخطيط العام (SPEC §12): قائمة جانبية يمنى + شريط علوي (بحث، جرس، بطاقة مستخدم).

import { Search } from "lucide-react";
import { Suspense } from "react";
import { AppSidebar } from "@/components/domain/app-sidebar";
import { NotificationsBell } from "@/components/domain/notifications-bell";
import { UserMenu } from "@/components/domain/user-menu";
import { Input } from "@/components/ui/input";
import { ROLE_META } from "@/core/constants";
import { requireActor, signOut } from "@/lib/auth";
import { listForUser, unreadCount } from "@/services/notifications";
import { getSettings } from "@/services/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const [count, items, settingsRow] = await Promise.all([
    unreadCount(actor.id),
    listForUser(actor.id, 10),
    getSettings(),
  ]);

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-screen">
      <Suspense>
        <AppSidebar
          role={actor.role}
          orgName={settingsRow.orgName}
          orgSubtitle={settingsRow.orgSubtitle}
          hasLogo={!!settingsRow.logoPath}
        />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center gap-4 border-b bg-card px-6 py-3">
          <form action="/requests" className="max-w-md flex-1">
            <div className="relative">
              <Search className="absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                name="q"
                placeholder="ابحث في الطلبات، المصممين، الجهات…"
                className="ps-9 bg-page"
                aria-label="بحث عام"
              />
            </div>
          </form>
          <div className="ms-auto flex items-center gap-2">
            <NotificationsBell initialCount={count} initialItems={items} />
            <UserMenu
              name={actor.name}
              roleLabel={ROLE_META[actor.role].label}
              logoutAction={logout}
            />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
