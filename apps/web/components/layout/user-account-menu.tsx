"use client";

import { LogOut, Settings, Zap } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Can } from "@/components/features/auth/can";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface UserAccountMenuProps {
  session: any;
  isCollapsed: boolean;
  basePath: string;
  compact?: boolean;
  primaryTextClass?: string;
}

export function UserAccountMenu({
  session,
  isCollapsed,
  basePath,
  compact = false,
  primaryTextClass,
}: UserAccountMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isInAdminPanel = pathname.startsWith("/org-admin");

  const handleSignOut = async () => {
    await signOut({ fetchOptions: { onSuccess: () => router.push("/sign-in") } });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center h-12 rounded-lg transition-colors duration-200 outline-none focus-visible:bg-muted/70 overflow-hidden",
            compact ? "w-12 justify-center px-0" : "w-full px-3 hover:bg-muted/50",
          )}
        >
          <Avatar className="h-8 w-8 ring-2 ring-border/50 shrink-0">
            <AvatarImage
              src={session?.user?.image || undefined}
              alt={session?.user?.name || "User"}
              className="object-cover"
            />
            <AvatarFallback className="bg-muted text-xs font-medium text-foreground">
              {session?.user?.name?.charAt(0)?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>

          {!compact && (
            <div
              className={cn(
                "flex flex-col text-left overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out",
                isCollapsed
                  ? "max-w-0 opacity-0 ml-0 pointer-events-none"
                  : "max-w-[160px] opacity-100 ml-3",
              )}
            >
              <span className={cn("block text-sm font-medium truncate", primaryTextClass)}>
                {session?.user?.name || "Loading..."}
              </span>
            </div>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={compact ? "end" : isCollapsed ? "center" : "start"}
        side={compact ? "bottom" : isCollapsed ? "right" : "top"}
        className="w-56 mt-2 md:mt-0 md:mb-2"
      >
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => router.push("/dashboard/settings/profile")}
          className="cursor-pointer"
        >
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>

        {!isInAdminPanel && (
          <Can I="workspace:manage_settings">
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push("/org-admin")}
              className="cursor-pointer text-accent-foreground focus:text-accent-foreground"
            >
              <Zap className="mr-2 h-4 w-4" />
              Admin Panel
            </DropdownMenuItem>
          </Can>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
