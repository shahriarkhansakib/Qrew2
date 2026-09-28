"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Edit, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { Can } from "@/components/features/auth/can";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiUrl } from "@/lib/constants";

interface ClientDetailsModalProps {
  client: any;
  mode?: "full" | "readonly";
  onClose: () => void;
  onEdit?: (client: any) => void;
}

export function ClientDetailsModal({
  client,
  mode = "readonly",
  onClose,
  onEdit,
}: ClientDetailsModalProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500/10 text-green-500";
      case "lead":
        return "bg-blue-500/10 text-blue-500";
      case "archived":
        return "bg-gray-500/10 text-gray-500";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  const { data: orgSettings } = useQuery({
    queryKey: ["org-settings"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch settings");
      const data = await res.json();
      return data.metadata || {};
    },
    enabled: !!client && mode === "full",
  });

  const { data: projects, isLoading: loadingProjects } = useQuery({
    queryKey: ["projects", "client", client?.id],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch projects");
      const allProjects = await res.json();
      return allProjects.filter((p: any) => p.clientId === client.id);
    },
    enabled: !!client && mode === "full",
  });

  const columns = useMemo(() => {
    if (orgSettings?.clientFileViewColumns) return orgSettings.clientFileViewColumns;
    return ["sys-project-name", "sys-project-status", "arrival_date", "total_expenses"];
  }, [orgSettings]);

  const { data: customFields } = useQuery({
    queryKey: ["custom-fields", "project"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/custom-fields?entityType=project`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch custom fields");
      return res.json();
    },
    enabled: !!client && mode === "full",
  });

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num || 0);
  };

  const renderCell = (project: any, colId: string) => {
    if (colId === "sys-project-name") return project.name;
    if (colId === "sys-project-status")
      return (
        <Badge variant="secondary" className="capitalize">
          {project.status}
        </Badge>
      );
    if (colId === "total_expenses") return formatCurrency(project.totalExpenses);

    // Custom field
    const fieldDef = customFields?.find((f: any) => f.id === colId || f.fieldKey === colId);
    const val = project.customFields?.[fieldDef?.fieldKey || colId];
    if (!val) return "-";
    if (fieldDef?.fieldType === "date") {
      try {
        return format(new Date(val), "MMM d, yyyy");
      } catch (_e) {}
    }
    return val;
  };

  const renderColumnHeader = (colId: string) => {
    if (colId === "sys-project-name") return "File Name";
    if (colId === "sys-project-status") return "Status";
    if (colId === "total_expenses") return "Expenses";

    const fieldDef = customFields?.find((f: any) => f.id === colId || f.fieldKey === colId);
    return fieldDef?.fieldName || colId.replace(/_/g, " ");
  };

  if (!client) return null;

  return (
    <Dialog open={!!client} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between border-b pb-4">
          <div>
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              {client.name}
              <Badge
                variant="outline"
                className={`capitalize border-0 ${getStatusColor(client.status)}`}
              >
                {client.status}
              </Badge>
            </DialogTitle>
          </div>
          {mode === "full" && (
            <div className="flex items-center gap-3 pr-8">
              <Can I="client:edit">
                <Button variant="outline" size="sm" onClick={() => onEdit?.(client)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Client
                </Button>
              </Can>
            </div>
          )}
        </DialogHeader>

        <div className="py-4 space-y-6">
          <div className="grid grid-cols-2 gap-4 text-sm bg-muted/30 p-4 rounded-md">
            <div>
              <span className="text-muted-foreground block mb-1">Created At</span>
              <span className="font-medium">
                {format(new Date(client.createdAt), "MMM d, yyyy")}
              </span>
            </div>
            {Object.keys(client.customFields || {}).map((key) => (
              <div key={key}>
                <span className="text-muted-foreground block mb-1 capitalize">
                  {key.replace(/_/g, " ")}
                </span>
                <span className="font-medium">{client.customFields[key] || "-"}</span>
              </div>
            ))}
          </div>

          {mode === "full" && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Client Files</h3>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      {columns.map((col: string) => (
                        <TableHead key={col} className="capitalize">
                          {renderColumnHeader(col)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingProjects ? (
                      <TableRow>
                        <TableCell colSpan={columns.length} className="h-24 text-center">
                          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : projects?.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={columns.length}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No files found for this client.
                        </TableCell>
                      </TableRow>
                    ) : (
                      projects?.map((project: any) => (
                        <TableRow key={project.id}>
                          {columns.map((col: string) => (
                            <TableCell key={col}>{renderCell(project, col)}</TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
