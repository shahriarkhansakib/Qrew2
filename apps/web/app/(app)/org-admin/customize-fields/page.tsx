"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Edit2, GitBranch, Loader2, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AddCustomFieldModal } from "@/components/features/custom-fields/add-custom-field-modal";
import { CustomFieldsDataTable } from "@/components/features/custom-fields/custom-fields-data-table";
import { AddExpenseCategoryModal } from "@/components/features/expense-categories/add-expense-category-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiUrl } from "@/lib/constants";

const SYSTEM_FIELDS = [
  // Client System Fields
  {
    id: "sys-client-name",
    entityType: "client" as const,
    fieldName: "Name",
    fieldKey: "name",
    fieldType: "text",
    isRequired: true,
    options: null,
    isSeeded: true,
    isSystem: true,
    isPrivatable: false,
  },
  {
    id: "sys-client-email",
    entityType: "client" as const,
    fieldName: "Email",
    fieldKey: "email",
    fieldType: "text",
    isRequired: false,
    options: null,
    isSeeded: true,
    isSystem: true,
    isPrivatable: true,
  },
  // Project System Fields
  {
    id: "sys-project-name",
    entityType: "project" as const,
    fieldName: "Name",
    fieldKey: "name",
    fieldType: "text",
    isRequired: true,
    options: null,
    isSeeded: true,
    isSystem: true,
    isPrivatable: false,
  },
  {
    id: "sys-project-client",
    entityType: "project" as const,
    fieldName: "Client",
    fieldKey: "clientId",
    fieldType: "single_select",
    isRequired: true,
    options: null,
    isSeeded: true,
    isSystem: true,
    isPrivatable: false,
  },
  {
    id: "sys-project-status",
    entityType: "project" as const,
    fieldName: "Status",
    fieldKey: "status",
    fieldType: "single_select",
    isRequired: true,
    options: ["planning", "active", "completed", "on_hold"],
    isSeeded: true,
    isSystem: true,
    isPrivatable: false,
  },
  // Staff System Fields
  {
    id: "sys-staff-name",
    entityType: "staff" as const,
    fieldName: "Name",
    fieldKey: "name",
    fieldType: "text",
    isRequired: true,
    options: null,
    isSeeded: true,
    isSystem: true,
    isPrivatable: false,
  },
  {
    id: "sys-staff-email",
    entityType: "staff" as const,
    fieldName: "Email",
    fieldKey: "email",
    fieldType: "text",
    isRequired: true,
    options: null,
    isSeeded: true,
    isSystem: true,
    isPrivatable: true,
  },
  {
    id: "sys-staff-role",
    entityType: "staff" as const,
    fieldName: "System Role",
    fieldKey: "role",
    fieldType: "single_select",
    isRequired: true,
    options: ["user", "admin", "super_admin"],
    isSeeded: true,
    isSystem: true,
    isPrivatable: false,
  },
];

function ExpenseCategoryRow({
  cat,
  isShown,
  onToggleShow,
}: {
  cat: any;
  isShown: boolean;
  onToggleShow: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [description, setDescription] = useState(cat.description || "");
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiUrl}/api/expense-categories/${cat.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update category");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Category updated successfully.");
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiUrl}/api/expense-categories/${cat.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete category");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Category deleted successfully.");
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${cat.name}"?`)) {
      deleteMutation.mutate();
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        {isEditing ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 w-full text-sm"
          />
        ) : (
          <div className="flex items-center gap-2 text-[15px]">
            <span>{cat.name}</span>
            <span className="font-mono text-xs text-muted-foreground uppercase">
              (CAT_{cat.tokenKey})
            </span>
          </div>
        )}
      </TableCell>
      <TableCell className="text-[15px]">
        {isEditing ? (
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-8 w-full text-sm"
          />
        ) : (
          cat.description || "-"
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center">
          <Checkbox
            checked={isShown}
            onCheckedChange={onToggleShow}
            aria-label="Toggle visibility"
            className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
          />
        </div>
      </TableCell>
      <TableCell className="text-right">
        {isEditing ? (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-green-600"
              disabled={updateMutation.isPending}
              onClick={() => updateMutation.mutate()}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => {
                setIsEditing(false);
                setName(cat.name);
                setDescription(cat.description || "");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 text-muted-foreground hover:text-foreground"
              onClick={() => setIsEditing(true)}
            >
              <Edit2 className="h-5 w-5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 text-muted-foreground hover:text-red-600"
              disabled={deleteMutation.isPending}
              onClick={handleDelete}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Trash2 className="h-5 w-5" />
              )}
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function CustomizeFieldsPage() {
  const [isAddFieldModalOpen, setIsAddFieldModalOpen] = useState(false);
  const [activeEntityType, setActiveEntityType] = useState<"client" | "project" | "staff">(
    "client",
  );
  const [isAddExpenseCategoryOpen, setIsAddExpenseCategoryOpen] = useState(false);

  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: customFields, isLoading: loadingFields } = useQuery({
    queryKey: ["custom-fields"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/custom-fields`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch custom fields");
      return res.json();
    },
  });

  const { data: orgSettings, isLoading: loadingSettings } = useQuery({
    queryKey: ["org-settings"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch organization settings");
      const data = await res.json();
      return data.metadata || {};
    },
  });

  // Detailed fields (system level fields saved in orgSettings)
  const [sysDetailedFields, setSysDetailedFields] = useState<string[]>([]);
  // Sensitive fields (system level fields saved in orgSettings)
  const [sysSensitiveFields, setSysSensitiveFields] = useState<string[]>([]);
  const [sysPrivateFields, setSysPrivateFields] = useState<string[]>([]);
  const [categoryColumns, setCategoryColumns] = useState<string[]>([]);

  useEffect(() => {
    if (orgSettings) {
      setSysDetailedFields(orgSettings.sysDetailedFields || []);
      setSysSensitiveFields(orgSettings.sysSensitiveFields || []);
      setSysPrivateFields(orgSettings.sysPrivateFields || []);
      setCategoryColumns(orgSettings.categoryColumns || []);
    }
  }, [orgSettings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`${apiUrl}/api/workspaces/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ metadata: payload }),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-settings"] });
    },
  });

  const updateCustomFieldMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await fetch(`${apiUrl}/api/workspaces/custom-fields/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update custom field");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-fields"] });
    },
  });

  const { data: expenseCategories, isLoading: loadingCategories } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/expense-categories`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch expense categories");
      return res.json();
    },
  });

  // Handle initialization of categoryColumns when categories are loaded for the first time
  useEffect(() => {
    if (expenseCategories && orgSettings && !orgSettings.categoryColumns) {
      setCategoryColumns(expenseCategories.map((c: any) => c.id));
    }
  }, [expenseCategories, orgSettings]);

  const allFields = [...SYSTEM_FIELDS, ...(customFields || [])];
  const clientFields = allFields.filter((f) => f.entityType === "client");
  const projectFields = allFields.filter((f) => f.entityType === "project");
  const staffFields = allFields.filter((f) => f.entityType === "staff");

  const openAddFieldModal = (type: "client" | "project" | "staff") => {
    setActiveEntityType(type);
    setIsAddFieldModalOpen(true);
  };

  const handleToggleDetailed = (id: string, isSystem: boolean) => {
    if (isSystem) {
      const updated = sysDetailedFields.includes(id)
        ? sysDetailedFields.filter((f) => f !== id)
        : [...sysDetailedFields, id];
      setSysDetailedFields(updated);
      updateSettingsMutation.mutate({
        sysDetailedFields: updated,
        sysSensitiveFields,
        sysPrivateFields,
        categoryColumns,
      });
    } else {
      const field = customFields?.find((f: any) => f.id === id);
      if (field) {
        updateCustomFieldMutation.mutate({ id, payload: { isDetailed: !field.isDetailed } });
      }
    }
  };

  const handleToggleSensitive = (id: string, isSystem: boolean) => {
    if (isSystem) {
      const updated = sysSensitiveFields.includes(id)
        ? sysSensitiveFields.filter((f) => f !== id)
        : [...sysSensitiveFields, id];
      setSysSensitiveFields(updated);
      updateSettingsMutation.mutate({
        sysDetailedFields,
        sysSensitiveFields: updated,
        sysPrivateFields,
        categoryColumns,
      });
    } else {
      const field = customFields?.find((f: any) => f.id === id);
      if (field) {
        updateCustomFieldMutation.mutate({ id, payload: { isSensitive: !field.isSensitive } });
      }
    }
  };

  const handleTogglePrivate = (id: string, isSystem: boolean) => {
    if (isSystem) {
      const updated = sysPrivateFields.includes(id)
        ? sysPrivateFields.filter((f) => f !== id)
        : [...sysPrivateFields, id];
      setSysPrivateFields(updated);
      updateSettingsMutation.mutate({
        sysDetailedFields,
        sysSensitiveFields,
        sysPrivateFields: updated,
        categoryColumns,
      });
    } else {
      const field = customFields?.find((f: any) => f.id === id);
      if (field) {
        updateCustomFieldMutation.mutate({ id, payload: { isPrivate: !field.isPrivate } });
      }
    }
  };

  const handleToggleCategory = (fieldId: string) => {
    const updated = categoryColumns.includes(fieldId)
      ? categoryColumns.filter((id) => id !== fieldId)
      : [...categoryColumns, fieldId];
    setCategoryColumns(updated);
    updateSettingsMutation.mutate({
      sysDetailedFields,
      sysSensitiveFields,
      categoryColumns: updated,
    });
  };

  return (
    <div className="flex flex-col gap-10 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Customize Fields</h1>
        <p className="text-[15px] text-muted-foreground mt-2">
          Configure custom schemas and manage customizable categories across your workspace.
        </p>
      </div>

      {/* CLIENT SCHEMA SECTION */}
      <section className="space-y-5">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-xl font-bold">Client Schema</h2>
            <p className="text-[14.5px] text-muted-foreground mt-1">
              Fields that appear on Client records.
            </p>
          </div>
          <Button onClick={() => openAddFieldModal("client")} className="shadow-sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Client Field
          </Button>
        </div>
        <CustomFieldsDataTable
          fields={clientFields}
          isLoading={loadingFields}
          detailedFields={sysDetailedFields}
          sensitiveFields={sysSensitiveFields}
          privateFields={sysPrivateFields}
          onToggleDetailed={handleToggleDetailed}
          onToggleSensitive={handleToggleSensitive}
          onTogglePrivate={handleTogglePrivate}
        />
      </section>

      {/* PROJECT SCHEMA SECTION */}
      <section className="space-y-5">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-xl font-bold">Project / File Schema</h2>
            <p className="text-[14.5px] text-muted-foreground mt-1">
              Fields that appear on Project and File records.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => router.push("/org-admin/workflows")}
              className="shadow-sm"
            >
              <GitBranch className="mr-2 h-4 w-4" />
              Configure Workflows
            </Button>
            <Button onClick={() => openAddFieldModal("project")} className="shadow-sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Project Field
            </Button>
          </div>
        </div>
        <CustomFieldsDataTable
          fields={projectFields}
          isLoading={loadingFields}
          detailedFields={sysDetailedFields}
          sensitiveFields={sysSensitiveFields}
          privateFields={sysPrivateFields}
          onToggleDetailed={handleToggleDetailed}
          onToggleSensitive={handleToggleSensitive}
          onTogglePrivate={handleTogglePrivate}
        />
      </section>

      {/* STAFF SCHEMA SECTION */}
      <section className="space-y-5">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-xl font-bold">Staff Schema</h2>
            <p className="text-[14.5px] text-muted-foreground mt-1">
              Fields that appear on Staff and Employee profiles.
            </p>
          </div>
          <Button onClick={() => openAddFieldModal("staff")} className="shadow-sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Staff Field
          </Button>
        </div>
        <CustomFieldsDataTable
          fields={staffFields}
          isLoading={loadingFields}
          detailedFields={sysDetailedFields}
          sensitiveFields={sysSensitiveFields}
          privateFields={sysPrivateFields}
          onToggleDetailed={handleToggleDetailed}
          onToggleSensitive={handleToggleSensitive}
          onTogglePrivate={handleTogglePrivate}
        />
      </section>

      {/* EXPENSE CATEGORIES SECTION */}
      <section className="space-y-5 mt-10">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-xl font-bold">Expense Categories</h2>
            <p className="text-[14.5px] text-muted-foreground mt-1">
              Categories for logging financial expenses.
            </p>
          </div>
          <Button onClick={() => setIsAddExpenseCategoryOpen(true)} className="shadow-sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        </div>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[15px]">Category Name</TableHead>
                <TableHead className="text-[15px]">Description</TableHead>
                <TableHead className="text-[15px]">Shown</TableHead>
                <TableHead className="text-[15px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingCategories ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    Loading categories...
                  </TableCell>
                </TableRow>
              ) : expenseCategories?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No expense categories found.
                  </TableCell>
                </TableRow>
              ) : (
                expenseCategories?.map((cat: any) => (
                  <ExpenseCategoryRow
                    key={cat.id}
                    cat={cat}
                    isShown={categoryColumns.includes(cat.id)}
                    onToggleShow={() => handleToggleCategory(cat.id)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <AddCustomFieldModal
        isOpen={isAddFieldModalOpen}
        onClose={() => setIsAddFieldModalOpen(false)}
        defaultEntity={activeEntityType}
      />
      <AddExpenseCategoryModal
        isOpen={isAddExpenseCategoryOpen}
        onClose={() => setIsAddExpenseCategoryOpen(false)}
      />
    </div>
  );
}
