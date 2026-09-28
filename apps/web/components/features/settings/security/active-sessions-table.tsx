"use client";

import { Laptop, Loader2, Smartphone, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { UAParser } from "ua-parser-js";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  FilterableTableCell,
  FilterableTableHeader,
} from "@/components/ui/table-filter-components";
import { useTableCellFilter } from "@/hooks/use-table-cell-filter";
import { authClient, useSession } from "@/lib/auth-client";

export function ActiveSessionsTable() {
  const { data: currentSession } = useSession();
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    const { data } = await authClient.listSessions();
    if (data) setSessions(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevoke = async (token: string) => {
    setRevokingId(token);
    const { error } = await authClient.revokeSession({ token });
    if (!error) {
      setSessions((prev) => prev.filter((s) => s.token !== token));
    }
    setRevokingId(null);
  };

  const parseUserAgent = (uaString: string) => {
    const parser = new UAParser(uaString);
    const result = parser.getResult();
    const device = result.device.type === "mobile" ? "Mobile" : result.os.name || "Desktop";
    const browser = result.browser.name || "Unknown Browser";
    return { name: `${device} - ${browser}`, isDesktop: result.device.type !== "mobile" };
  };

  const extractors = useMemo(() => {
    return {
      device: (s: any) => parseUserAgent(s.userAgent || "").name,
      ip: (s: any) => s.ipAddress || "Unknown IP",
      created: (s: any) => new Date(s.createdAt).toLocaleDateString(),
    };
  }, [parseUserAgent]);

  const filteredSessions = useMemo(() => {
    return filterRows(sessions || [], extractors);
  }, [sessions, filterRows, extractors]);

  if (isLoading)
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="animate-spin text-muted-foreground h-6 w-6" />
      </div>
    );

  return (
    <div className="rounded-md border border-border/50 bg-card/40 backdrop-blur-sm w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <FilterableTableHeader
              columnKey="device"
              title="Device"
              isFiltered={isColumnFiltered("device")}
              activeValue={filters.device}
              onClear={() => clearColumnFilter("device")}
            />
            <FilterableTableHeader
              columnKey="ip"
              title="IP Address"
              isFiltered={isColumnFiltered("ip")}
              activeValue={filters.ip}
              onClear={() => clearColumnFilter("ip")}
              className="hidden sm:table-cell"
            />
            <FilterableTableHeader
              columnKey="created"
              title="Created"
              isFiltered={isColumnFiltered("created")}
              activeValue={filters.created}
              onClear={() => clearColumnFilter("created")}
              className="hidden sm:table-cell"
            />
            <TableCell className="text-right font-medium text-muted-foreground">Action</TableCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredSessions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                No active sessions found.
              </TableCell>
            </TableRow>
          ) : (
            filteredSessions.map((session) => {
              const { name, isDesktop } = parseUserAgent(session.userAgent || "");
              const isCurrent = session.id === currentSession?.session?.id;

              return (
                <TableRow key={session.id} className="hover:bg-muted/30 transition-colors">
                  <FilterableTableCell
                    columnKey="device"
                    value={name}
                    isFiltered={isColumnFiltered("device")}
                    onToggleFilter={toggleFilter}
                  >
                    <div className="flex items-start sm:items-center gap-3">
                      <div className="mt-1 sm:mt-0">
                        {isDesktop ? (
                          <Laptop className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Smartphone className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{name}</span>
                          {isCurrent && (
                            <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="sm:hidden flex flex-col text-xs text-muted-foreground font-normal">
                          <span>{session.ipAddress || "Unknown IP"}</span>
                          <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="ip"
                    value={session.ipAddress || "Unknown IP"}
                    isFiltered={isColumnFiltered("ip")}
                    onToggleFilter={toggleFilter}
                    className="hidden sm:table-cell"
                  >
                    {session.ipAddress || "Unknown IP"}
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="created"
                    value={new Date(session.createdAt).toLocaleDateString()}
                    isFiltered={isColumnFiltered("created")}
                    onToggleFilter={toggleFilter}
                    className="hidden sm:table-cell"
                  >
                    {new Date(session.createdAt).toLocaleDateString()}
                  </FilterableTableCell>
                  <TableCell
                    className="text-right align-top sm:align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 px-2"
                        onClick={() => handleRevoke(session.token)}
                        disabled={revokingId === session.token}
                      >
                        {revokingId === session.token ? (
                          <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 sm:mr-2" />
                        )}
                        <span className="hidden sm:inline">Revoke</span>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
