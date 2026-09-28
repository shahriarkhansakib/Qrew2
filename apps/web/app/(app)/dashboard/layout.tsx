"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useSession } from "@/lib/auth-client";
import { type AnyNavItem, NAV_CONFIG, type NavGroup, type NavItem } from "@/lib/config/navigation";
import { usePermissionStore } from "@/store/use-permission-store";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const _permissions = usePermissionStore((state) => state.permissions);
  const can = usePermissionStore((state) => state.can);

  const navItems = useMemo((): AnyNavItem[] => {
    return NAV_CONFIG.user.filter((item: AnyNavItem) => {
      // Check the item-level permission gate if present.
      const itemPermission = (item as NavItem).permission || (item as NavGroup).permission;
      if (itemPermission) return can(itemPermission);
      return true;
    });
  }, [can]);

  return (
    <AppShell session={session} navItems={navItems} theme="default">
      {children}
    </AppShell>
  );
}
