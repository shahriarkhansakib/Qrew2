import type { AppPermission } from "@starter/db/permissions-registry";
import { create } from "zustand";

interface PermissionState {
  permissions: string[];
  role: string | null;
  roleIds: string[];
  isOwner: boolean;
  isLoaded: boolean;

  // Actions
  loadPermissions: () => Promise<void>;
  clearPermissions: () => void;

  // Evaluators
  can: (permission: AppPermission | string) => boolean;
  canAny: (permissions: (AppPermission | string)[]) => boolean;
  canAll: (permissions: (AppPermission | string)[]) => boolean;
  hasRole: (allowedRoleIds?: string[]) => boolean;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  permissions: [],
  role: null,
  roleIds: [],
  isOwner: false,
  isLoaded: false,

  loadPermissions: async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL as string;
      const res = await fetch(`${apiUrl}/api/workspaces/permissions/me`, {
        // Essential: send the session cookie so Hono knows who is asking
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        set({
          permissions: data.permissions || [],
          role: data.role || null,
          roleIds: data.roleIds || [],
          isOwner: !!data.isOwner,
          isLoaded: true,
        });
      } else {
        set({ permissions: [], role: null, roleIds: [], isOwner: false, isLoaded: true });
      }
    } catch (error) {
      console.error("Failed to fetch permissions", error);
      set({ permissions: [], role: null, roleIds: [], isOwner: false, isLoaded: true });
    }
  },

  clearPermissions: () =>
    set({ permissions: [], role: null, roleIds: [], isOwner: false, isLoaded: false }),

  can: (permission: string) => {
    const { permissions } = get();
    // Super admins have the wildcard
    if (permissions.includes("*")) return true;
    return permissions.includes(permission);
  },

  canAny: (checkPermissions: string[]) => {
    const { permissions } = get();
    if (permissions.includes("*")) return true;
    return checkPermissions.some((p) => permissions.includes(p));
  },

  canAll: (checkPermissions: string[]) => {
    const { permissions } = get();
    if (permissions.includes("*")) return true;
    return checkPermissions.every((p) => permissions.includes(p));
  },

  hasRole: (allowedRoleIds?: string[]) => {
    const { isOwner, role, roleIds, permissions } = get();
    if (isOwner || permissions.includes("*")) return true;
    if (!allowedRoleIds || allowedRoleIds.length === 0) return true;
    if (role && allowedRoleIds.includes(role)) return true;
    if (roleIds?.some((id) => allowedRoleIds.includes(id))) return true;
    return false;
  },
}));
