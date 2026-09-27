import { create } from "zustand";

interface PermissionState {
  permissions: string[];
  isLoaded: boolean;

  // Actions
  loadPermissions: () => Promise<void>;
  clearPermissions: () => void;

  // Evaluators
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
  canAll: (permissions: string[]) => boolean;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  permissions: [],
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
        set({ permissions: data.permissions || [], isLoaded: true });
      } else {
        set({ permissions: [], isLoaded: true });
      }
    } catch (error) {
      console.error("Failed to fetch permissions", error);
      set({ permissions: [], isLoaded: true });
    }
  },

  clearPermissions: () => set({ permissions: [], isLoaded: false }),

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
}));
