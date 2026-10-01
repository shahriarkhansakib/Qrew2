"use client";

import { useQuery } from "@tanstack/react-query";
import { Lock, MoreVertical, Pencil, Plus, Shield, Trash2, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Can } from "@/components/features/auth/can";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";

export default function RolesPage() {
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["org-roles"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/roles`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch roles");
      return res.json();
    },
  });

  const roles = data?.roles || [];

  const handleDelete = async (roleId: string, roleName: string) => {
    if (!confirm(`Delete role "${roleName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${apiUrl}/api/workspaces/roles/${roleId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete role");
      }
      toast.success(`Role "${roleName}" deleted.`);
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-4 border-b pb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Roles & Permissions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define custom access levels for your office members.
          </p>
        </div>
        <Can I="role:manage">
          <Button size="sm" onClick={() => router.push("/org-admin/roles/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Create Role
          </Button>
        </Can>
      </div>

      {/* Content */}
      <div className="pt-2">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48 mt-1" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : roles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <Shield className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No roles defined yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Create your first custom role to start assigning granular permissions to office
              members.
            </p>
            <Can I="role:manage">
              <Button className="mt-6" onClick={() => router.push("/org-admin/roles/new")}>
                <Plus className="mr-2 h-4 w-4" />
                Create First Role
              </Button>
            </Can>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map(
              (role: {
                id: string;
                name: string;
                description?: string;
                isSystem: boolean;
                permissionCount: number;
                memberCount: number;
              }) => (
                <Card
                  key={role.id}
                  className="group relative transition-colors hover:ring-foreground/20"
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle>{role.name}</CardTitle>
                        {role.isSystem && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground bg-accent/10 px-1.5 py-0.5 rounded">
                            <Lock className="h-3 w-3" />
                            System
                          </span>
                        )}
                      </div>
                      {!role.isSystem && (
                        <Can I="role:manage">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => router.push(`/org-admin/roles/${role.id}`)}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit Role
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(role.id, role.name)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Role
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </Can>
                      )}
                    </div>
                    <CardDescription className="line-clamp-2">
                      {role.description || "No description provided."}
                    </CardDescription>
                  </CardHeader>
                  <CardFooter className="gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5" />
                      {role.permissionCount} permission{role.permissionCount !== 1 ? "s" : ""}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {role.memberCount} member{role.memberCount !== 1 ? "s" : ""}
                    </span>
                  </CardFooter>
                </Card>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
