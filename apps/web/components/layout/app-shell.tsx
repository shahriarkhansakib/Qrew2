"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { OrganizationSwitcher } from "@/components/layout/organization-switcher";
import { SidebarProvider, useSidebar } from "@/components/layout/sidebar-context";
import { SidebarNavGroup } from "@/components/layout/sidebar-nav-group";
import { SidebarNavLink } from "@/components/layout/sidebar-nav-link";
import { UserAccountMenu } from "@/components/layout/user-account-menu";
import { Button } from "@/components/ui/button";
import { QrewLogo } from "@/components/ui/logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AnyNavItem, NavGroup } from "@/lib/config/navigation";
import { cn } from "@/lib/utils";
import { usePermissionStore } from "@/store/use-permission-store";

interface AppShellProps {
  children: React.ReactNode;
  session: any;
  // Accept both flat NavItem and collapsible NavGroup entries.
  navItems: AnyNavItem[];
  settingsItem?: { name: string; href: string; icon: any };
  systemName?: string;
  theme?: "default" | "admin" | "destructive";
  showOrgSwitcher?: boolean;
}

export function AppShell(props: AppShellProps) {
  return (
    <SidebarProvider>
      <AppShellInner {...props} />
    </SidebarProvider>
  );
}

function AppShellInner({
  children,
  session,
  navItems,
  settingsItem,
  systemName = "QREW",
  theme = "default",
  showOrgSwitcher = true,
}: AppShellProps) {
  const { isCollapsed, isMounted, toggle } = useSidebar();
  const { loadPermissions, isLoaded } = usePermissionStore();

  useEffect(() => {
    // Ensure permissions are loaded when the shell mounts,
    // even if the org switcher is hidden (e.g., in the admin panel)
    if (!isLoaded && session?.session?.activeOrganizationId) {
      loadPermissions();
    }
  }, [isLoaded, session?.session?.activeOrganizationId, loadPermissions]);

  const styles = {
    default: { border: "border-border/50", bg: "bg-card/30", primaryText: "text-primary" },
    admin: { border: "border-border/50", bg: "bg-card/10", primaryText: "text-primary" },
    destructive: {
      border: "border-destructive/20",
      bg: "bg-destructive/5",
      primaryText: "text-destructive",
    },
  }[theme];

  const basePath =
    theme === "destructive" ? "/super-admin" : theme === "admin" ? "/admin" : "/dashboard";

  if (!isMounted) return <div className="h-screen w-full bg-background" />;

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          "flex flex-col md:flex-row h-screen w-full bg-background overflow-hidden",
          session?.session?.impersonatedBy && "pt-10",
        )}
      >
        {/* Desktop Sidebar: Animated Width */}
        <div
          className={cn(
            "hidden md:flex flex-col h-full z-20 shrink-0 transition-[width] duration-300 ease-in-out",
            isCollapsed ? "w-[64px]" : "w-[240px]",
            styles.border,
            styles.bg,
          )}
        >
          {/* Header Layout */}
          <div className={cn("flex flex-col gap-4 border-b p-3", styles.border)}>
            {isCollapsed ? (
              <div className="flex flex-col items-center gap-2 py-0.5">
                {/* Collapsed Brand Identity: Always visible Logo icon (Gemini / Claude style) */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/"
                      className={cn(
                        "flex items-center justify-center p-1 rounded-md hover:bg-muted/50 transition-colors",
                        styles.primaryText,
                      )}
                    >
                      <QrewLogo className="h-7 w-7 shrink-0" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <span className="font-semibold">{systemName}</span>
                  </TooltipContent>
                </Tooltip>

                {/* Toggle Button to Expand */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggle}
                      className="h-8 w-8 text-muted-foreground hover:bg-muted/50"
                    >
                      <PanelLeft className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Expand sidebar</TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <div className="flex items-center justify-between px-1">
                {/* Logo Container */}
                <div className="flex items-center overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out opacity-100">
                  <Link
                    href="/"
                    className={cn(
                      "flex items-center gap-2 font-bold outline-none rounded",
                      styles.primaryText,
                    )}
                  >
                    <QrewLogo className="h-7 w-7 shrink-0" />
                    <span className="tracking-tight font-extrabold text-xl truncate">
                      {systemName}
                    </span>
                  </Link>
                </div>

                {/* Toggle Button */}
                <div className="shrink-0 flex items-center justify-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggle}
                        className="h-8 w-8 text-muted-foreground hover:bg-muted/50"
                      >
                        <PanelLeftClose className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Collapse sidebar</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            )}

            {/* Inject the Organization Switcher — hidden in admin panels */}
            {showOrgSwitcher ? (
              <OrganizationSwitcher isCollapsed={isCollapsed} />
            ) : (
              !isCollapsed && (
                <div
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md",
                    theme === "destructive"
                      ? "bg-destructive/10 border border-destructive/20 text-destructive"
                      : "bg-accent/10 border border-amber-500/20 text-accent-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "h-2 w-2 rounded-full animate-pulse",
                      theme === "destructive" ? "bg-destructive" : "bg-accent",
                    )}
                  />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    {theme === "destructive" ? "Root Admin Mode" : "Admin Mode"}
                  </span>
                </div>
              )
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full w-full">
              <nav className="flex flex-col gap-1 p-2">
                {navItems.map((item) => {
                  // Render collapsible group for NavGroup type items.
                  if ((item as NavGroup).type === "group") {
                    const group = item as NavGroup;
                    return (
                      <SidebarNavGroup
                        key={group.name}
                        name={group.name}
                        icon={group.icon}
                        baseHref={group.baseHref}
                        children={group.children}
                        isCollapsed={isCollapsed}
                        activeVariant={theme === "destructive" ? "muted" : "primary"}
                      />
                    );
                  }
                  // Flat nav link for regular items.
                  return (
                    <SidebarNavLink
                      key={item.name}
                      href={(item as any).href}
                      name={item.name}
                      icon={item.icon}
                      isCollapsed={isCollapsed}
                      activeVariant={theme === "destructive" ? "muted" : "primary"}
                    />
                  );
                })}
              </nav>
            </ScrollArea>
          </div>

          <div className={cn("border-t shrink-0 flex flex-col gap-2 p-2", styles.border)}>
            {settingsItem && (
              <SidebarNavLink
                href={settingsItem.href}
                name={settingsItem.name}
                icon={settingsItem.icon}
                isCollapsed={isCollapsed}
                activeMatch={`${basePath}/settings`}
                activeVariant={theme === "destructive" ? "muted" : "primary"}
              />
            )}
            <UserAccountMenu
              session={session}
              isCollapsed={isCollapsed}
              basePath={basePath}
              primaryTextClass={styles.primaryText}
            />
          </div>
        </div>

        {/* Mobile Header & Main Content Area */}
        <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden relative">
          <header
            className={cn(
              "flex md:hidden h-14 shrink-0 items-center justify-between border-b px-4 z-20",
              styles.border,
              styles.bg,
            )}
          >
            <Link href="/" className={cn("flex items-center gap-2 font-bold", styles.primaryText)}>
              <QrewLogo className="h-7 w-7" />
              <span className="tracking-tight font-extrabold text-xl">{systemName}</span>
            </Link>
            <UserAccountMenu
              session={session}
              isCollapsed={isCollapsed}
              basePath={basePath}
              compact={true}
            />
          </header>

          <div className="flex-1 min-h-0 overflow-hidden bg-background">
            <ScrollArea className="h-full w-full">
              <main className="p-4 lg:p-6 pb-24 md:pb-6">{children}</main>
            </ScrollArea>
          </div>

          <nav
            className={cn(
              "md:hidden fixed bottom-0 left-0 right-0 border-t flex items-center justify-around px-2 py-2 pb-safe z-50 shadow-[0_-4px_10px_rgb(0,0,0,0.05)] dark:shadow-none bg-background/95 backdrop-blur-md supports-backdrop-filter:bg-background/80",
              styles.border,
            )}
          >
            {/* Mobile bottom nav: only render flat items, skip groups (no room for sub-menus) */}
            {navItems.map((item) => {
              if ((item as NavGroup).type === "group") return null;
              return (
                <SidebarNavLink
                  key={item.name}
                  href={(item as any).href}
                  name={item.name}
                  icon={item.icon}
                  isCollapsed={true}
                  showTooltip={false}
                  activeVariant={theme === "destructive" ? "muted" : "primary"}
                />
              );
            })}
            {settingsItem && (
              <SidebarNavLink
                href={settingsItem.href}
                name={settingsItem.name}
                icon={settingsItem.icon}
                isCollapsed={true}
                showTooltip={false}
                activeMatch={`${basePath}/settings`}
                activeVariant={theme === "destructive" ? "muted" : "primary"}
              />
            )}
          </nav>
        </div>
      </div>
    </TooltipProvider>
  );
}
