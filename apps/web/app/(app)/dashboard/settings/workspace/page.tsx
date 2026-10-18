"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/features/auth/can";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { apiUrl } from "@/lib/constants";

export default function WorkspaceSettingsPage() {
  const queryClient = useQueryClient();
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  const { data: orgSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ["org-settings"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch settings");
      const data = await res.json();
      return data.metadata || {};
    },
  });

  const { data: customFields, isLoading: fieldsLoading } = useQuery({
    queryKey: ["custom-fields", "project"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/custom-fields?entityType=project`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch custom fields");
      return res.json();
    },
  });

  useEffect(() => {
    if (orgSettings?.clientFileViewColumns) {
      setSelectedColumns(orgSettings.clientFileViewColumns);
    } else {
      setSelectedColumns([
        "sys-project-name",
        "sys-project-status",
        "arrival_date",
        "total_expenses",
      ]);
    }
  }, [orgSettings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (newMetadata: any) => {
      const res = await fetch(`${apiUrl}/api/workspaces/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: newMetadata }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Settings updated successfully");
      queryClient.invalidateQueries({ queryKey: ["org-settings"] });
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  const handleSave = () => {
    updateSettingsMutation.mutate({
      clientFileViewColumns: selectedColumns,
    });
  };

  const toggleColumn = (col: string) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  };

  const systemFields = [
    { key: "sys-project-name", label: "File Name" },
    { key: "sys-project-status", label: "Status" },
    { key: "total_expenses", label: "Total Expenses" },
  ];

  if (settingsLoading || fieldsLoading) return <div>Loading...</div>;

  const AccessDenied = (
    <div className="flex flex-col items-center justify-center h-[50vh] text-center space-y-4">
      <h1 className="text-2xl font-bold">Access Denied</h1>
      <p className="text-muted-foreground">
        You do not have permission to manage workspace settings.
      </p>
    </div>
  );

  return (
    <Can I="workspace:manage_settings" fallback={AccessDenied}>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Workspace Settings</h1>
          <p className="text-muted-foreground">
            Configure organization-wide defaults and settings.
          </p>
        </div>

        <div className="space-y-4 border p-4 rounded-md bg-card">
          <div>
            <h3 className="text-lg font-medium">Client Details: File View Columns</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Select which columns should be visible when viewing a client's files across the
              organization.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">System Fields</h4>
            {systemFields.map((field) => (
              <div key={field.key} className="flex items-center space-x-2">
                <Checkbox
                  id={`col-${field.key}`}
                  checked={selectedColumns.includes(field.key)}
                  onCheckedChange={() => toggleColumn(field.key)}
                />
                <Label htmlFor={`col-${field.key}`}>{field.label}</Label>
              </div>
            ))}
          </div>

          {customFields && customFields.length > 0 && (
            <div className="space-y-2 pt-4 border-t mt-4">
              <h4 className="text-sm font-semibold text-muted-foreground">Custom Fields</h4>
              {customFields.map((field: any) => (
                <div key={field.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`col-${field.fieldKey}`}
                    checked={selectedColumns.includes(field.fieldKey)}
                    onCheckedChange={() => toggleColumn(field.fieldKey)}
                  />
                  <Label htmlFor={`col-${field.fieldKey}`}>{field.fieldName}</Label>
                </div>
              ))}
            </div>
          )}

          <div className="pt-4 border-t mt-4 flex justify-end">
            <Button onClick={handleSave} disabled={updateSettingsMutation.isPending}>
              {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </div>
      </div>
    </Can>
  );
}
