"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2, Search, ShieldCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  FilterableTableCell,
  FilterableTableHeader,
} from "@/components/ui/table-filter-components";
import { useTableCellFilter } from "@/hooks/use-table-cell-filter";
import { apiUrl } from "@/lib/constants";

interface AuditLog {
  id: string;
  action: string;
  reason: string;
  ipAddress: string;
  createdAt: string;
  adminId: string;
  targetUserId: string;
  adminEmail: string;
  targetEmail: string;
}

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface AuditLogsResponse {
  data: AuditLog[];
  meta: PaginationMeta;
}

export function AuditLogsTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();

  const page = Number(searchParams.get("page") || "1");
  const actionFilter = searchParams.get("action") || "";
  const adminIdFilter = searchParams.get("adminId") || "";
  const targetUserIdFilter = searchParams.get("targetUserId") || "";
  const limit = 20;

  const { data, isLoading, isPlaceholderData } = useQuery<AuditLogsResponse>({
    queryKey: ["super-admin-audit-logs", page, actionFilter, adminIdFilter, targetUserIdFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (actionFilter) params.set("action", actionFilter);
      if (adminIdFilter) params.set("adminId", adminIdFilter);
      if (targetUserIdFilter) params.set("targetUserId", targetUserIdFilter);

      const res = await fetch(`${apiUrl}/api/super-admin/audit-logs?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to fetch audit logs");
      }
      return res.json();
    },
    placeholderData: (prev) => prev,
    staleTime: 10000,
  });

  const handleFilterChange = (key: string, value: string) => {
    const currentParams = new URLSearchParams(window.location.search);
    if (value.trim()) {
      currentParams.set(key, value.trim());
    } else {
      currentParams.delete(key);
    }
    currentParams.set("page", "1");
    router.push(`${pathname}?${currentParams.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("page", newPage.toString());
    router.push(`${pathname}?${currentParams.toString()}`);
  };

  const logs = data?.data || [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages || 1;

  const getActionColor = (action: string) => {
    if (action.includes("BAN") || action.includes("NUKE"))
      return "bg-destructive/10 text-destructive border-destructive/20";
    if (action.includes("IMPERSONATE"))
      return "bg-accent/10 text-accent-foreground border-amber-500/20";
    if (action.includes("ELEVATE")) return "bg-indigo-500/10 text-indigo-500 border-indigo-500/20";
    return "bg-muted text-muted-foreground border-border";
  };

  const extractors = useMemo(() => {
    return {
      timestamp: (l: AuditLog) => format(new Date(l.createdAt), "MMM d, yyyy HH:mm:ss"),
      action: (l: AuditLog) => l.action.replace("SECURITY_ENFORCEMENT_", ""),
      actor: (l: AuditLog) => l.adminEmail,
      target: (l: AuditLog) => l.targetEmail,
      reason: (l: AuditLog) => l.reason,
    };
  }, []);

  const filteredLogs = useMemo(() => {
    return filterRows(logs, extractors);
  }, [logs, filterRows, extractors]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by Action..."
            defaultValue={actionFilter}
            onBlur={(e) => handleFilterChange("action", e.target.value)}
            className="pl-9 bg-card/50"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by Admin ID..."
            defaultValue={adminIdFilter}
            onBlur={(e) => handleFilterChange("adminId", e.target.value)}
            className="pl-9 bg-card/50"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by Target User ID..."
            defaultValue={targetUserIdFilter}
            onBlur={(e) => handleFilterChange("targetUserId", e.target.value)}
            className="pl-9 bg-card/50"
          />
        </div>
      </div>

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/10">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <FilterableTableHeader
                columnKey="timestamp"
                title="Timestamp"
                isFiltered={isColumnFiltered("timestamp")}
                activeValue={filters["timestamp"]}
                onClear={() => clearColumnFilter("timestamp")}
                className="w-[180px]"
              />
              <FilterableTableHeader
                columnKey="action"
                title="Action"
                isFiltered={isColumnFiltered("action")}
                activeValue={filters["action"]}
                onClear={() => clearColumnFilter("action")}
                className="w-[150px]"
              />
              <FilterableTableHeader
                columnKey="actor"
                title="Actor (Admin)"
                isFiltered={isColumnFiltered("actor")}
                activeValue={filters["actor"]}
                onClear={() => clearColumnFilter("actor")}
                className="w-[200px]"
              />
              <FilterableTableHeader
                columnKey="target"
                title="Target User"
                isFiltered={isColumnFiltered("target")}
                activeValue={filters["target"]}
                onClear={() => clearColumnFilter("target")}
                className="w-[200px]"
              />
              <FilterableTableHeader
                columnKey="reason"
                title="SOC2 Reason"
                isFiltered={isColumnFiltered("reason")}
                activeValue={filters["reason"]}
                onClear={() => clearColumnFilter("reason")}
                className="w-[300px]"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <ShieldCheck className="h-8 w-8 stroke-1 text-muted-foreground/60" />
                    <span>No security actions recorded matching current filters.</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredLogs.map((log) => (
                <TableRow
                  key={log.id}
                  className={`hover:bg-muted/40 transition-colors ${
                    isPlaceholderData ? "opacity-70" : ""
                  }`}
                >
                  <FilterableTableCell
                    columnKey="timestamp"
                    value={format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}
                    isFiltered={isColumnFiltered("timestamp")}
                    onToggleFilter={toggleFilter}
                  >
                    {format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="action"
                    value={log.action.replace("SECURITY_ENFORCEMENT_", "")}
                    isFiltered={isColumnFiltered("action")}
                    onToggleFilter={toggleFilter}
                  >
                    <Badge
                      className={`${getActionColor(log.action)} uppercase text-[10px] tracking-wider`}
                      variant="outline"
                    >
                      {log.action.replace("SECURITY_ENFORCEMENT_", "")}
                    </Badge>
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="actor"
                    value={log.adminEmail}
                    isFiltered={isColumnFiltered("actor")}
                    onToggleFilter={toggleFilter}
                  >
                    <div>
                      {log.adminEmail}
                      <div className="text-[10px] text-muted-foreground font-normal mt-0.5">
                        {log.ipAddress}
                      </div>
                    </div>
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="target"
                    value={log.targetEmail}
                    isFiltered={isColumnFiltered("target")}
                    onToggleFilter={toggleFilter}
                  >
                    {log.targetEmail}
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="reason"
                    value={log.reason}
                    isFiltered={isColumnFiltered("reason")}
                    onToggleFilter={toggleFilter}
                  >
                    <span className="max-w-[300px] truncate block" title={log.reason}>
                      {log.reason}
                    </span>
                  </FilterableTableCell>
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
    </div>
  );
}
