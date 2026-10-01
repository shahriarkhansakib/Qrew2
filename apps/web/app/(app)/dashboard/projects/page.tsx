"use client";

import { useQuery } from "@tanstack/react-query";
import { Folder, FolderTree, List, Plus, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/features/auth/can";
import { ClientDetailsModal } from "@/components/features/clients/client-details-modal";
import { AddProjectModal } from "@/components/features/projects/add-project-modal";
import { ExplorerView } from "@/components/features/projects/explorer-view";
import { FolderView } from "@/components/features/projects/folder-view";
import { ListView } from "@/components/features/projects/list-view";
import { ProjectDetailsModal } from "@/components/features/projects/project-details-modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiUrl } from "@/lib/constants";

export default function ProjectsPage() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<any>(null);
  const [projectToView, setProjectToView] = useState<any>(null);
  const [clientToView, setClientToView] = useState<any>(null);
  const [viewMode, setViewMode] = useState<"list" | "tree" | "folder">("list");
  const [sortBy, setSortBy] = useState<string>("createdAt_desc");
  const [groupByKey, setGroupByKey] = useState<string>("createdAt");
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");

  const [hiddenCols, setHiddenCols] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem("projects-hidden-cols");
    if (saved) {
      try {
        setHiddenCols(JSON.parse(saved));
      } catch (_e) {}
    }
  }, []);

  const toggleColumn = (key: string, checked: boolean) => {
    const next = { ...hiddenCols };
    if (checked) {
      delete next[key];
    } else {
      next[key] = true;
    }
    setHiddenCols(next);
    localStorage.setItem("projects-hidden-cols", JSON.stringify(next));
  };

  const { data: orgSettings } = useQuery({
    queryKey: ["orgSettings"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/settings`, { credentials: "include" });
      if (!res.ok) return { metadata: {} };
      return res.json();
    },
  });

  const { data: rawCustomFields, isLoading: customFieldsLoading } = useQuery({
    queryKey: ["custom-fields", "project"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/custom-fields?entityType=project`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch custom fields");
      return res.json();
    },
  });

  const customFields = useMemo(() => {
    if (!rawCustomFields) return [];
    const allowedColumns = orgSettings?.metadata?.clientFileViewColumns;
    if (Array.isArray(allowedColumns) && allowedColumns.length > 0) {
      return rawCustomFields.filter((cf: any) => allowedColumns.includes(cf.id));
    }
    return rawCustomFields;
  }, [rawCustomFields, orgSettings]);

  const dateFields = useMemo(() => {
    return customFields?.filter((cf: any) => cf.fieldType === "date") || [];
  }, [customFields]);

  const {
    data: projects,
    isLoading: projectsLoading,
    refetch,
  } = useQuery({
    queryKey: ["projects", activeTab],
    queryFn: async () => {
      const res = await fetch(
        `${apiUrl}/api/workspaces/projects?status=${activeTab === "archived" ? "archived" : "active"}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to fetch files");
      return res.json();
    },
  });

  const { data: allStatuses } = useQuery({
    queryKey: ["projectStatuses"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/statuses`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.statuses || [];
    },
  });

  const workflowsEnabled = !!orgSettings?.metadata?.sysWorkflowsEnabled;

  const sortedProjects = useMemo(() => {
    if (!projects) return [];
    const copy = [...projects];

    return copy.sort((a, b) => {
      const [field, direction] = sortBy.split("_");
      const isAsc = direction === "asc";

      let valA: any = a[field];
      let valB: any = b[field];

      if (field === "createdAt" || field === "archivedAt") {
        valA = a[field] ? new Date(a[field]).getTime() : 0;
        valB = b[field] ? new Date(b[field]).getTime() : 0;
      } else if (field === "name") {
        valA = a.name?.toLowerCase() || "";
        valB = b.name?.toLowerCase() || "";
      } else {
        valA = a.customFields?.[field] || "";
        valB = b.customFields?.[field] || "";
      }

      if (valA < valB) return isAsc ? -1 : 1;
      if (valA > valB) return isAsc ? 1 : -1;
      return 0;
    });
  }, [projects, sortBy]);

  const handleDelete = async (project: any) => {
    if (
      !confirm(
        `Are you sure you want to permanently delete "${project.name}"? This action cannot be undone.`,
      )
    )
      return;
    try {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/${project.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("File deleted permanently");
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete file");
    }
  };

  const handleArchiveToggle = async (project: any) => {
    const isArchived = !!project.archivedAt;
    const endpoint = isArchived ? "unarchive" : "archive";
    try {
      const res = await fetch(`${apiUrl}/api/workspaces/projects/${project.id}/${endpoint}`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success(isArchived ? "File unarchived" : "File archived");
      refetch();
    } catch (err: any) {
      toast.error(err.message || `Failed to ${endpoint} file`);
    }
  };

  const handleEdit = (project: any) => {
    setProjectToEdit(project);
    setIsAddModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Files Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage, sort, and organize your files.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              setProjectToEdit(null);
              setIsAddModalOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add File
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-[200px] grid-cols-2 mb-4">
          <TabsTrigger value="active">Active</TabsTrigger>
          <Can I="file:view_archived">
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </Can>
        </TabsList>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/30 p-2 rounded-lg border mb-4">
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(val) => val && setViewMode(val as any)}
          >
            <ToggleGroupItem value="list" aria-label="Toggle list view">
              <List className="h-4 w-4 mr-2" /> List
            </ToggleGroupItem>
            <ToggleGroupItem value="tree" aria-label="Toggle tree view">
              <FolderTree className="h-4 w-4 mr-2" /> Tree
            </ToggleGroupItem>
            <ToggleGroupItem value="folder" aria-label="Toggle folder view">
              <Folder className="h-4 w-4 mr-2" /> Folder
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {viewMode === "tree" || viewMode === "folder" ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground whitespace-nowrap">Group by:</span>
                <Select value={groupByKey} onValueChange={setGroupByKey}>
                  <SelectTrigger className="w-[180px] bg-background">
                    <SelectValue placeholder="Group by..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="createdAt">Created Date</SelectItem>
                    {dateFields.map((df: any) => (
                      <SelectItem key={df.id} value={df.fieldKey}>
                        {df.fieldName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground whitespace-nowrap">Sort by:</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[200px] bg-background">
                    <SelectValue placeholder="Sort by..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeTab === "archived" && (
                      <>
                        <SelectItem value="archivedAt_desc">Archived At (Newest)</SelectItem>
                        <SelectItem value="archivedAt_asc">Archived At (Oldest)</SelectItem>
                      </>
                    )}
                    <SelectItem value="createdAt_desc">Created (Newest)</SelectItem>
                    <SelectItem value="createdAt_asc">Created (Oldest)</SelectItem>
                    <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                    <SelectItem value="name_desc">Name (Z-A)</SelectItem>
                    {customFields?.map((cf: any) => (
                      <div key={cf.id}>
                        <SelectItem value={`${cf.fieldKey}_asc`}>{cf.fieldName} (Asc)</SelectItem>
                        <SelectItem value={`${cf.fieldKey}_desc`}>{cf.fieldName} (Desc)</SelectItem>
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-9 sm:w-auto px-0 sm:px-3">
                  <SlidersHorizontal className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">View</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px]">
                <DropdownMenuCheckboxItem
                  checked={!hiddenCols["sys-project-client"]}
                  onCheckedChange={(c) => toggleColumn("sys-project-client", c)}
                >
                  Client
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={!hiddenCols["sys-project-status"]}
                  onCheckedChange={(c) => toggleColumn("sys-project-status", c)}
                >
                  Status
                </DropdownMenuCheckboxItem>
                <Can I="finance:view_expenses">
                  <DropdownMenuCheckboxItem
                    checked={!hiddenCols.total_expenses}
                    onCheckedChange={(c) => toggleColumn("total_expenses", c)}
                  >
                    Total Expenses
                  </DropdownMenuCheckboxItem>
                </Can>
                <DropdownMenuCheckboxItem
                  checked={!hiddenCols.createdAt}
                  onCheckedChange={(c) => toggleColumn("createdAt", c)}
                >
                  Created At
                </DropdownMenuCheckboxItem>
                {activeTab === "archived" && (
                  <DropdownMenuCheckboxItem
                    checked={!hiddenCols.archivedAt}
                    onCheckedChange={(c) => toggleColumn("archivedAt", c)}
                  >
                    Archived At
                  </DropdownMenuCheckboxItem>
                )}
                {customFields?.length > 0 && <DropdownMenuSeparator />}
                {customFields?.map((cf: any) => (
                  <DropdownMenuCheckboxItem
                    key={cf.id}
                    checked={!hiddenCols[cf.id]}
                    onCheckedChange={(c) => toggleColumn(cf.id, c)}
                  >
                    {cf.fieldName}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <TabsContent value="active" className="m-0 border-none p-0 outline-none">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {viewMode === "list" ? (
              <ListView
                projects={sortedProjects}
                customFields={customFields || []}
                isLoading={projectsLoading}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onView={setProjectToView}
                onArchiveToggle={handleArchiveToggle}
                onViewClient={setClientToView}
                isArchivedView={false}
                visibleColumns={orgSettings?.metadata?.clientFileViewColumns}
                hiddenColumns={hiddenCols}
                allStatuses={allStatuses || []}
                workflowsEnabled={workflowsEnabled}
              />
            ) : viewMode === "tree" ? (
              <FolderView
                projects={sortedProjects}
                customFields={customFields || []}
                groupByKey={groupByKey}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onView={setProjectToView}
                onArchiveToggle={handleArchiveToggle}
                onViewClient={setClientToView}
                isArchivedView={false}
              />
            ) : (
              <ExplorerView
                projects={sortedProjects}
                customFields={customFields || []}
                groupByKey={groupByKey}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onView={setProjectToView}
                onArchiveToggle={handleArchiveToggle}
                onViewClient={setClientToView}
                isArchivedView={false}
                visibleColumns={orgSettings?.metadata?.clientFileViewColumns}
                hiddenColumns={hiddenCols}
                allStatuses={allStatuses || []}
                workflowsEnabled={workflowsEnabled}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="archived" className="m-0 border-none p-0 outline-none">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {viewMode === "list" ? (
              <ListView
                projects={sortedProjects}
                customFields={customFields || []}
                isLoading={projectsLoading}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onView={setProjectToView}
                onArchiveToggle={handleArchiveToggle}
                onViewClient={setClientToView}
                showArchivedAt={true}
                isArchivedView={true}
                visibleColumns={orgSettings?.metadata?.clientFileViewColumns}
                hiddenColumns={hiddenCols}
                allStatuses={allStatuses || []}
                workflowsEnabled={workflowsEnabled}
              />
            ) : viewMode === "tree" ? (
              <FolderView
                projects={sortedProjects}
                customFields={customFields || []}
                groupByKey={groupByKey}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onView={setProjectToView}
                onArchiveToggle={handleArchiveToggle}
                onViewClient={setClientToView}
                showArchivedAt={true}
                isArchivedView={true}
              />
            ) : (
              <ExplorerView
                projects={sortedProjects}
                customFields={customFields || []}
                groupByKey={groupByKey}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onView={setProjectToView}
                onArchiveToggle={handleArchiveToggle}
                onViewClient={setClientToView}
                showArchivedAt={true}
                isArchivedView={true}
                visibleColumns={orgSettings?.metadata?.clientFileViewColumns}
                hiddenColumns={hiddenCols}
                allStatuses={allStatuses || []}
                workflowsEnabled={workflowsEnabled}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>

      <AddProjectModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setProjectToEdit(null);
        }}
        editProject={projectToEdit}
      />

      <ProjectDetailsModal project={projectToView} onClose={() => setProjectToView(null)} />

      <ClientDetailsModal client={clientToView} mode="full" onClose={() => setClientToView(null)} />
    </div>
  );
}
