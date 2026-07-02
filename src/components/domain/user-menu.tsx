"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({
  name,
  roleLabel,
  logoutAction,
}: {
  name: string;
  roleLabel: string;
  logoutAction: () => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
        <Avatar className="size-9">
          <AvatarFallback className="bg-navy/10 font-medium text-navy">
            {name.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="hidden text-start sm:block">
          <p className="text-sm font-medium leading-tight">{name}</p>
          <p className="text-xs text-muted-foreground">{roleLabel}</p>
        </div>
        <ChevronDown className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <form action={logoutAction} className="w-full">
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut className="size-4" />
              تسجيل الخروج
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
