"use client";
import { useMemo } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useSession } from "@/lib/auth-client";
import { type AnyNavItem, NAV_CONFIG, type NavGroup, type NavItem } from "@/lib/config/navigation";
import { usePermissionStore } from "@/store/use-permission-store";

export default function OrgAdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const can = usePermissionStore((state) => state.can);
  const canAny = usePermissionStore((state) => state.canAny);

  const navItems = useMemo((): AnyNavItem[] => {
    return NAV_CONFIG.tenantAdmin.filter((item: AnyNavItem) => {
      const itemPermission = (item as NavItem).permission || (item as NavGroup).permission;
      if (itemPermission) {
        if (Array.isArray(itemPermission)) return canAny(itemPermission);
        return can(itemPermission);
      }
      return true;
    });
  }, [can, canAny]);

  return (
    <AppShell
      session={session}
      navItems={navItems}
      settingsItem={NAV_CONFIG.tenantAdminExit}
      theme="admin"
      showOrgSwitcher={false}
    >
      {children}
    </AppShell>
  );
}
