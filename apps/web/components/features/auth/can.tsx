"use client";

import { ReactNode } from "react";
import { usePermissionStore } from "@/store/use-permission-store";

interface CanProps {
  I: string | string[]; // Single permission key or array of keys (e.g., 'staff:provision' or ['invoice:manage_optional_rows', 'finance:manage_invoices'])
  children: ReactNode;
  fallback?: ReactNode; // Optional UI to show if they DON'T have permission
  not?: boolean; // If true, renders children when they DON'T have permission
}

export function Can({ I, children, fallback = null, not = false }: CanProps) {
  const { can, canAny, isLoaded } = usePermissionStore();

  // Prevent UI flashing: Render nothing while permissions are loading over the network
  if (!isLoaded) return null;

  const hasAccess = Array.isArray(I) ? canAny(I) : can(I);
  const hasPermission = not ? !hasAccess : hasAccess;

  if (hasPermission) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
