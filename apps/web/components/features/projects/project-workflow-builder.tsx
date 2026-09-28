"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiUrl } from "@/lib/constants";

export function ProjectWorkflowBuilder() {
  const queryClient = useQueryClient();

  const { data: statuses, isLoading: loadingStatuses } = useQuery({
    queryKey: ["project-statuses"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch statuses");
      return res.json();
    },
  });

  const { data: customFields, isLoading: loadingFields } = useQuery({
    queryKey: ["custom-fields", "project"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/custom-fields?entityType=project`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch custom fields");
      return res.json();
    },
  });

  const createStatusMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create status");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Stage added");
      queryClient.invalidateQueries({ queryKey: ["project-statuses"] });
      setNewStatusName("");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, name, order }: { id: string; name?: string; order?: number }) => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, order }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update status");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Stage updated");
      queryClient.invalidateQueries({ queryKey: ["project-statuses"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteStatusMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete status");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Stage deleted");
      queryClient.invalidateQueries({ queryKey: ["project-statuses"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const createFieldMutation = useMutation({
    mutationFn: async (field: any) => {
      const res = await fetch(`${apiUrl}/api/workspaces/custom-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...field, entityType: "project" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create field");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Field added");
      queryClient.invalidateQueries({ queryKey: ["custom-fields", "project"] });
      setAddingFieldToStatus(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${apiUrl}/api/workspaces/custom-fields/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete field");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Field deleted");
      queryClient.invalidateQueries({ queryKey: ["custom-fields", "project"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const [newStatusName, setNewStatusName] = useState("");
  const [addingFieldToStatus, setAddingFieldToStatus] = useState<string | null>(null);

  // Field Form State
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newFieldRequired, setNewFieldRequired] = useState(false);

  if (loadingStatuses || loadingFields) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
      </div>
    );
  }

  const handleCreateField = (statusId: string) => {
    createFieldMutation.mutate({
      fieldName: newFieldName,
      fieldKey: newFieldKey || newFieldName.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      fieldType: newFieldType,
      isRequired: newFieldRequired,
      projectStatusId: statusId,
    });
  };

  const moveStatus = (index: number, direction: "up" | "down") => {
    if (!statuses) return;
    const newStatuses = [...statuses];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newStatuses.length) return;

    // Swap order values
    const current = newStatuses[index];
    const target = newStatuses[targetIndex];

    // Simple approach: just update the one moving, but we need to update both in DB or just shift order
    // Let's do parallel updates
    const currentOrder = current.order;
    current.order = target.order;
    target.order = currentOrder;

    Promise.all([
      updateStatusMutation.mutateAsync({ id: current.id, order: current.order }),
      updateStatusMutation.mutateAsync({ id: target.id, order: target.order }),
    ]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Input
          placeholder="New Stage Name (e.g. In Progress)"
          value={newStatusName}
          onChange={(e) => setNewStatusName(e.target.value)}
          className="max-w-xs"
        />
        <Button
          onClick={() => createStatusMutation.mutate(newStatusName)}
          disabled={!newStatusName.trim() || createStatusMutation.isPending}
        >
          <Plus className="w-4 h-4 mr-2" /> Add Stage
        </Button>
      </div>

      <div className="space-y-4">
        {statuses?.map((status: any, index: number) => {
          const statusFields =
            customFields?.filter((f: any) => f.projectStatusId === status.id) || [];

          return (
            <Card key={status.id} className={status.isSystem ? "border-primary/50" : ""}>
              <CardHeader className="py-3 flex flex-row items-center justify-between bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4"
                      disabled={index === 0}
                      onClick={() => moveStatus(index, "up")}
                    >
                      ▲
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4"
                      disabled={index === statuses.length - 1}
                      onClick={() => moveStatus(index, "down")}
                    >
                      ▼
                    </Button>
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {status.name}
                      {status.isDefault && <Badge variant="secondary">Initial Stage</Badge>}
                      {status.isSystem && <Badge variant="outline">System</Badge>}
                    </CardTitle>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!status.isSystem && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this stage?")) {
                          deleteStatusMutation.mutate(status.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {statusFields.length > 0 ? (
                  <div className="space-y-2">
                    {statusFields.map((field: any) => (
                      <div
                        key={field.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-2 rounded-md border bg-background text-sm gap-2"
                      >
                        <div className="flex items-center gap-4">
                          <span className="font-medium">{field.fieldName}</span>
                          <span className="text-muted-foreground font-mono text-xs">
                            {field.fieldKey}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {field.fieldType}
                          </Badge>
                          {field.isRequired && (
                            <Badge
                              variant="default"
                              className="text-xs bg-red-500/10 text-red-500 hover:bg-red-500/20 shadow-none border-0"
                            >
                              Required
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            if (confirm("Delete field?")) deleteFieldMutation.mutate(field.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No fields configured for this stage.
                  </div>
                )}

                {addingFieldToStatus === status.id ? (
                  <div className="border p-4 rounded-md space-y-4 bg-muted/10">
                    <h4 className="font-medium text-sm">Add New Field</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Field Name</Label>
                        <Input
                          placeholder="e.g. Approved Amount"
                          value={newFieldName}
                          onChange={(e) => setNewFieldName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Field Type</Label>
                        <Select value={newFieldType} onValueChange={setNewFieldType}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text (Short)</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                            <SelectItem value="boolean">Checkbox (Yes/No)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Field Key (Optional)</Label>
                        <Input
                          placeholder="approved_amount"
                          value={newFieldKey}
                          onChange={(e) => setNewFieldKey(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Used for API/formulas. Auto-generated if left blank.
                        </p>
                      </div>
                      <div className="space-y-2 flex flex-col justify-center">
                        <Label>Required?</Label>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={newFieldRequired}
                            onCheckedChange={setNewFieldRequired}
                          />
                          <span className="text-sm text-muted-foreground">
                            {newFieldRequired ? "Yes" : "No"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="ghost" onClick={() => setAddingFieldToStatus(null)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => handleCreateField(status.id)}
                        disabled={!newFieldName.trim() || createFieldMutation.isPending}
                      >
                        {createFieldMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-2" />
                        )}
                        Save Field
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-dashed"
                    onClick={() => {
                      setNewFieldName("");
                      setNewFieldKey("");
                      setNewFieldType("text");
                      setNewFieldRequired(false);
                      setAddingFieldToStatus(status.id);
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" /> Add Field to {status.name}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
