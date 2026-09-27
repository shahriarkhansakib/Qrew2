"use client";

import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissionStore } from "@/store/use-permission-store";

const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";

interface RoleBuilderProps {
  roleId?: string; // undefined = create mode, string = edit mode
}

// Helper to group permissions by logical action type
function getPermissionType(key: string): "read" | "write" | "danger" | "other" {
  const action = key.split(":")[1];
  if (!action) return "other";

  if (action.startsWith("view")) return "read";
  if (
    ["create", "edit", "request", "approve", "record", "manage", "invite"].some((a) =>
      action.startsWith(a),
    )
  )
    return "write";
  if (["delete", "archive", "restore", "revoke"].some((a) => action.startsWith(a))) return "danger";

  return "other";
}

export function RoleBuilder({ roleId }: RoleBuilderProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = usePermissionStore();
  const isEditMode = !!roleId;

  // Fetch existing role data (edit mode only)
  const { data: existingRole, isLoading: isLoadingRole } = useQuery({
    queryKey: ["org-role", roleId],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/roles/${roleId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch role");
      const data = await res.json();
      return data.role;
    },
    enabled: isEditMode,
  });

  // Fetch the global permission registry
  const { data: registry, isLoading: isLoadingRegistry } = useQuery({
    queryKey: ["permission-registry"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/roles/registry`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch registry");
      const data = await res.json();
      return data.permissions;
    },
  });

  // Group permissions by category
  const groupedPermissions = useMemo(() => {
    if (!registry) return {};
    return registry.reduce((acc: Record<string, any[]>, perm: any) => {
      if (!acc[perm.category]) acc[perm.category] = [];
      acc[perm.category].push(perm);
      return acc;
    }, {});
  }, [registry]);

  const form = useForm({
    defaultValues: {
      name: existingRole?.name || "",
      description: existingRole?.description || "",
      permissionKeys: existingRole?.permissionKeys || ([] as string[]),
    },
    onSubmit: async ({ value }) => {
      try {
        const url = isEditMode
          ? `${apiUrl}/api/workspaces/roles/${roleId}`
          : `${apiUrl}/api/workspaces/roles`;

        const res = await fetch(url, {
          method: isEditMode ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(value),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to save role");
        }

        toast.success(isEditMode ? "Role updated!" : "Role created!");
        queryClient.invalidateQueries({ queryKey: ["org-roles"] });
        router.push("/org-admin/roles");
      } catch (error: any) {
        toast.error(error.message);
      }
    },
  });

  // Re-initialize form when existing role data loads
  const [hasInitialized, setHasInitialized] = useState(false);
  if (isEditMode && existingRole && !hasInitialized) {
    form.setFieldValue("name", existingRole.name);
    form.setFieldValue("description", existingRole.description || "");
    form.setFieldValue("permissionKeys", existingRole.permissionKeys || []);
    setHasInitialized(true);
  }

  const isDataLoading = isLoadingRegistry || (isEditMode && isLoadingRole);

  return (
    <div className="flex flex-col gap-6">
      {/* Header with Back Button */}
      <div className="flex sm:flex-row flex-col justify-between items-start sm:items-center gap-4 border-b pb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/org-admin/roles")}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {isEditMode ? "Edit Role" : "Create New Role"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isEditMode
                ? "Modify role details and adjust permission boundaries."
                : "Define a new role with specific permission boundaries."}
            </p>
          </div>
        </div>
      </div>

      {isDataLoading ? (
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-6"
        >
          {/* Role Details Card */}
          <Card>
            <CardHeader>
              <CardTitle>Role Details</CardTitle>
              <CardDescription>Set the name and purpose of this role.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form.Field
                name="name"
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && field.state.value.length < 2;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Role Name</FieldLabel>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="e.g. Shift Manager, Finance Lead"
                      />
                      {isInvalid && (
                        <p className="text-sm text-destructive">
                          Role name must be at least 2 characters.
                        </p>
                      )}
                    </Field>
                  );
                }}
              />

              <form.Field
                name="description"
                children={(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Description (Optional)</FieldLabel>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Brief description of what this role can do"
                    />
                  </Field>
                )}
              />
            </CardContent>
          </Card>

          {/* Permission Matrix Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Permission Matrix
              </CardTitle>
              <CardDescription>
                Select the capabilities this role grants. Permissions you don't have yourself are
                marked as restricted.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form.Field
                name="permissionKeys"
                mode="array"
                children={(field) => {
                  const selectedCount = field.state.value.length;

                  return (
                    <div className="space-y-10">
                      {/* Selection Counter */}
                      <div className="flex items-center justify-between px-1 min-h-[28px] border-b pb-4">
                        <span className="text-sm font-medium text-muted-foreground">
                          {selectedCount} permission{selectedCount !== 1 ? "s" : ""} selected
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className={`h-8 transition-opacity ${selectedCount > 0 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                          onClick={() => field.handleChange([])}
                        >
                          Clear All Selected
                        </Button>
                      </div>

                      {/* Category Sections */}
                      {Object.entries(groupedPermissions).map(
                        ([category, perms]: [string, any]) => {
                          const categoryPermsInSelection = perms.filter((p: any) =>
                            field.state.value.includes(p.key),
                          ).length;

                          const readPerms = perms.filter(
                            (p: any) => getPermissionType(p.key) === "read",
                          );
                          const writePerms = perms.filter(
                            (p: any) => getPermissionType(p.key) === "write",
                          );
                          const dangerPerms = perms.filter(
                            (p: any) => getPermissionType(p.key) === "danger",
                          );
                          const otherPerms = perms.filter(
                            (p: any) => getPermissionType(p.key) === "other",
                          );

                          const renderGroup = (groupPerms: any[]) => {
                            if (groupPerms.length === 0) return null;
                            return (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4 last:mb-0">
                                {groupPerms.map((perm: any) => {
                                  const hasAccess = can(perm.key);
                                  const isChecked = field.state.value.includes(perm.key);
                                  const permType = getPermissionType(perm.key);

                                  return (
                                    <label
                                      key={perm.key}
                                      className={`relative flex flex-col items-start gap-3 p-6 rounded-2xl border transition-all cursor-pointer select-none ${
                                        !hasAccess
                                          ? "opacity-50 cursor-not-allowed bg-muted/50"
                                          : isChecked
                                            ? "bg-primary/5 border-primary/30 shadow-sm"
                                            : "bg-card hover:shadow-md hover:border-primary/20"
                                      }`}
                                    >
                                      <div className="absolute top-5 right-5">
                                        <Checkbox
                                          id={`perm-${perm.key}`}
                                          checked={isChecked}
                                          disabled={!hasAccess}
                                          onCheckedChange={(checked) => {
                                            if (checked) {
                                              field.pushValue(perm.key);
                                            } else {
                                              const index = field.state.value.indexOf(perm.key);
                                              if (index > -1) field.removeValue(index);
                                            }
                                          }}
                                          className="h-5 w-5"
                                        />
                                      </div>
                                      <div className="flex flex-col gap-2 w-full pr-8">
                                        <div className="flex items-center gap-2">
                                          <Badge
                                            variant={
                                              permType === "danger" ? "destructive" : "secondary"
                                            }
                                            className={`font-mono font-extrabold text-[14px] px-3 py-1 shadow-sm ${
                                              isChecked && permType !== "danger"
                                                ? "bg-primary/20 text-primary"
                                                : ""
                                            }`}
                                          >
                                            {perm.key}
                                          </Badge>
                                          {!hasAccess && (
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
                                              Restricted
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-[14.5px] text-muted-foreground leading-relaxed mt-1">
                                          {perm.description || "No description provided."}
                                        </p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            );
                          };

                          return (
                            <div key={category} className="space-y-6 pt-2">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-h-[24px]">
                                <div className="flex items-center gap-3">
                                  <h4 className="text-xl font-bold tracking-tight">{category}</h4>
                                  <Badge
                                    variant="outline"
                                    className="bg-muted/50 text-muted-foreground"
                                  >
                                    {categoryPermsInSelection}/{perms.length}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3">
                                  {categoryPermsInSelection === perms.length ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8"
                                      onClick={() => {
                                        const keysToRemove = perms.map((p: any) => p.key);
                                        const newValue = field.state.value.filter(
                                          (k: string) => !keysToRemove.includes(k),
                                        );
                                        field.handleChange(newValue);
                                      }}
                                    >
                                      Clear Category
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="h-8"
                                      onClick={() => {
                                        const current = new Set(field.state.value);
                                        perms.forEach((p: any) => {
                                          if (can(p.key)) current.add(p.key);
                                        });
                                        field.handleChange(Array.from(current));
                                      }}
                                    >
                                      Select All in Category
                                    </Button>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-col gap-3 border rounded-xl p-6 bg-muted/10">
                                {renderGroup(readPerms)}
                                {renderGroup(writePerms)}
                                {renderGroup(dangerPerms)}
                                {renderGroup(otherPerms)}
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  );
                }}
              />
            </CardContent>
          </Card>

          {/* Action Bar */}
          <form.Subscribe
            selector={(state) => [state.isSubmitting]}
            children={([isSubmitting]) => (
              <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => router.push("/org-admin/roles")}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {isEditMode ? "Saving..." : "Creating..."}
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      {isEditMode ? "Save Changes" : "Create Role"}
                    </>
                  )}
                </Button>
              </div>
            )}
          />
        </form>
      )}
    </div>
  );
}
