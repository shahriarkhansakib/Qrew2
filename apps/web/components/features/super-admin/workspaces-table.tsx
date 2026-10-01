"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Building, ChevronLeft, ChevronRight, Loader2, Search, Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  FilterableTableCell,
  FilterableTableHeader,
} from "@/components/ui/table-filter-components";
import { useTableCellFilter } from "@/hooks/use-table-cell-filter";
import { apiUrl } from "@/lib/constants";
import { WorkspaceMembersModal } from "./workspace-members-modal";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export function WorkspacesTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();

  const page = Number(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";
  const limit = 20;

  const [membersModal, setMembersModal] = useState<{
    isOpen: boolean;
    workspace: Workspace | null;
  }>({
    isOpen: false,
    workspace: null,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["super-admin-workspaces", page, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
      if (search) params.set("search", search);

      const res = await fetch(`${apiUrl}/api/super-admin/workspaces?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch workspaces");
      return res.json();
    },
    staleTime: 10000,
  });

  const handleSearch = (value: string) => {
    const currentParams = new URLSearchParams(window.location.search);
    if (value.trim()) currentParams.set("search", value.trim());
    else currentParams.delete("search");
    currentParams.set("page", "1");
    router.push(`${pathname}?${currentParams.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("page", newPage.toString());
    router.push(`${pathname}?${currentParams.toString()}`);
  };

  const workspaces = data?.data || [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages || 1;

  const extractors = useMemo(() => {
    return {
      name: (ws: Workspace) => ws.name,
      slug: (ws: Workspace) => ws.slug || "-",
      createdAt: (ws: Workspace) => format(new Date(ws.createdAt), "MMM d, yyyy"),
    };
  }, []);

  const filteredWorkspaces = useMemo(() => {
    return filterRows(workspaces, extractors);
  }, [workspaces, filterRows, extractors]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full sm:w-[320px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search organizations..."
          defaultValue={search}
          onBlur={(e) => handleSearch(e.target.value)}
          className="pl-9 bg-card/50"
        />
      </div>

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/10">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <FilterableTableHeader
                columnKey="name"
                title="Organization Name"
                isFiltered={isColumnFiltered("name")}
                activeValue={filters.name}
                onClear={() => clearColumnFilter("name")}
              />
              <FilterableTableHeader
                columnKey="slug"
                title="Slug"
                isFiltered={isColumnFiltered("slug")}
                activeValue={filters.slug}
                onClear={() => clearColumnFilter("slug")}
              />
              <FilterableTableHeader
                columnKey="createdAt"
                title="Created At"
                isFiltered={isColumnFiltered("createdAt")}
                activeValue={filters.createdAt}
                onClear={() => clearColumnFilter("createdAt")}
              />
              <TableCell className="text-right font-medium text-muted-foreground">
                Actions
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && workspaces.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-48 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredWorkspaces.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-48 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Building className="h-8 w-8 stroke-1 text-muted-foreground/60" />
                    <span>No workspaces found matching current filters.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredWorkspaces.map((ws: Workspace) => (
                <TableRow key={ws.id} className="hover:bg-muted/40 transition-colors">
                  <FilterableTableCell
                    columnKey="name"
                    value={ws.name}
                    isFiltered={isColumnFiltered("name")}
                    onToggleFilter={toggleFilter}
                  >
                    {ws.name}
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="slug"
                    value={ws.slug || "-"}
                    isFiltered={isColumnFiltered("slug")}
                    onToggleFilter={toggleFilter}
                  >
                    {ws.slug || "-"}
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="createdAt"
                    value={format(new Date(ws.createdAt), "MMM d, yyyy")}
                    isFiltered={isColumnFiltered("createdAt")}
                    onToggleFilter={toggleFilter}
                  >
                    {format(new Date(ws.createdAt), "MMM d, yyyy")}
                  </FilterableTableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMembersModal({ isOpen: true, workspace: ws })}
                      className="gap-2"
                    >
                      <Users className="h-4 w-4" />
                      Members
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 py-1">
          <div className="text-xs text-muted-foreground">
            Page {meta?.page} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(meta!.page - 1)}
              disabled={meta!.page <= 1 || isLoading}
              className="gap-1 h-8"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(meta!.page + 1)}
              disabled={meta!.page >= totalPages || isLoading}
              className="gap-1 h-8"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <WorkspaceMembersModal
        isOpen={membersModal.isOpen}
        onClose={() => setMembersModal({ isOpen: false, workspace: null })}
        workspace={membersModal.workspace}
      />
    </div>
  );
}
