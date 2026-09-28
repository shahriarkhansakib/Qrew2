"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpCircle, Loader2, MoreHorizontal, Search, ShieldAlert } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  FilterableTableCell,
  FilterableTableHeader,
} from "@/components/ui/table-filter-components";
import { useTableCellFilter } from "@/hooks/use-table-cell-filter";
import { useSession } from "@/lib/auth-client";
import { apiUrl } from "@/lib/constants";

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
}

export function SuperAdminUsersTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const _currentUserRole = (session?.user as any)?.role ?? "user";

  const { filters, toggleFilter, clearColumnFilter, filterRows, isColumnFiltered } =
    useTableCellFilter();

  const page = Number(searchParams.get("page") || "1");
  const search = searchParams.get("search") || "";
  const limit = 20;

  const [searchInputValue, setSearchInputValue] = useState(search);
  const [elevateModalOpen, setElevateModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null);
  const [newRole, setNewRole] = useState<"admin" | "super_admin">("admin");
  const [reason, setReason] = useState("");

  useEffect(() => {
    setSearchInputValue(search);
  }, [search]);

  useEffect(() => {
    const handler = setTimeout(() => {
      const currentParams = new URLSearchParams(window.location.search);
      const prevSearch = currentParams.get("search") || "";
      if (searchInputValue !== prevSearch) {
        if (searchInputValue.trim()) {
          currentParams.set("search", searchInputValue.trim());
        } else {
          currentParams.delete("search");
        }
        currentParams.set("page", "1");
        router.push(`${pathname}?${currentParams.toString()}`);
      }
    }, 300);

    return () => clearTimeout(handler);
  }, [searchInputValue, pathname, router]);

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ["super-admin-users", page, search],
    queryFn: async () => {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (search) queryParams.set("search", search);

      const res = await fetch(`${apiUrl}/api/admin/users?${queryParams.toString()}`, {
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    placeholderData: (prev) => prev,
    staleTime: 5000,
  });

  const elevateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error("No user selected");
      const res = await fetch(`${apiUrl}/api/super-admin/elevate-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: selectedUser.id, newRole, reason }),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to elevate role");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-users"] });
      toast.success(`User successfully elevated to ${newRole}`);
      setElevateModalOpen(false);
      setReason("");
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  const handlePageChange = (newPage: number) => {
    const currentParams = new URLSearchParams(window.location.search);
    currentParams.set("page", newPage.toString());
    router.push(`${pathname}?${currentParams.toString()}`);
  };

  const usersList = data?.data || [];
  const meta = data?.meta;
  const totalPages = meta?.totalPages || 1;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "super_admin":
        return (
          <Badge
            className="bg-destructive/10 text-destructive hover:bg-destructive/10 uppercase text-[10px]"
            variant="outline"
          >
            Super Admin
          </Badge>
        );
      case "admin":
        return (
          <Badge
            className="bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/10 uppercase text-[10px]"
            variant="outline"
          >
            Admin
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground uppercase text-[10px]" variant="outline">
            User
          </Badge>
        );
    }
  };

  const extractors = useMemo(() => {
    return {
      name: (u: UserRecord) => u.name,
      email: (u: UserRecord) => u.email,
      role: (u: UserRecord) =>
        u.role === "super_admin" ? "Super Admin" : u.role === "admin" ? "Admin" : "User",
    };
  }, []);

  const displayUsers = useMemo(() => {
    return filterRows(usersList, extractors);
  }, [usersList, filterRows, extractors]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full sm:w-[320px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email to elevate..."
            value={searchInputValue}
            onChange={(e) => setSearchInputValue(e.target.value)}
            className="pl-9 bg-card/50"
          />
          {searchInputValue && searchInputValue !== search && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/10">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              <FilterableTableHeader
                columnKey="name"
                title="Name"
                isFiltered={isColumnFiltered("name")}
                activeValue={filters.name}
                onClear={() => clearColumnFilter("name")}
                className="w-[220px]"
              />
              <FilterableTableHeader
                columnKey="email"
                title="Email"
                isFiltered={isColumnFiltered("email")}
                activeValue={filters.email}
                onClear={() => clearColumnFilter("email")}
                className="w-[250px]"
              />
              <FilterableTableHeader
                columnKey="role"
                title="System Role"
                isFiltered={isColumnFiltered("role")}
                activeValue={filters.role}
                onClear={() => clearColumnFilter("role")}
                className="w-[140px]"
              />
              <TableCell className="w-[80px] text-right font-medium text-muted-foreground">
                Actions
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && usersList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-48 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : displayUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-48 text-center text-muted-foreground">
                  No users found matching current filters.
                </TableCell>
              </TableRow>
            ) : (
              displayUsers.map((user: UserRecord) => (
                <TableRow key={user.id} className="hover:bg-muted/40 transition-colors">
                  <FilterableTableCell
                    columnKey="name"
                    value={user.name}
                    isFiltered={isColumnFiltered("name")}
                    onToggleFilter={toggleFilter}
                  >
                    {user.name}
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="email"
                    value={user.email}
                    isFiltered={isColumnFiltered("email")}
                    onToggleFilter={toggleFilter}
                  >
                    {user.email}
                  </FilterableTableCell>
                  <FilterableTableCell
                    columnKey="role"
                    value={
                      user.role === "super_admin"
                        ? "Super Admin"
                        : user.role === "admin"
                          ? "Admin"
                          : "User"
                    }
                    isFiltered={isColumnFiltered("role")}
                    onToggleFilter={toggleFilter}
                  >
                    {getRoleBadge(user.role)}
                  </FilterableTableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 z-[100]">
                        <DropdownMenuLabel>Role Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={
                            user.role === "super_admin" || user.id === (session?.user as any)?.id
                          }
                          onClick={() => {
                            setSelectedUser(user);
                            setNewRole(user.role === "admin" ? "super_admin" : "admin");
                            setElevateModalOpen(true);
                          }}
                          className="cursor-pointer font-medium text-indigo-500 focus:text-indigo-500 focus:bg-indigo-500/10"
                        >
                          <ArrowUpCircle className="mr-2 h-4 w-4" />
                          Elevate Role
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
            Page {page} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || isLoading}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || isLoading}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Elevation Modal */}
      <Dialog open={elevateModalOpen} onOpenChange={setElevateModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <ShieldAlert className="mr-2 h-5 w-5 text-indigo-500" />
              Elevate Global Role
            </DialogTitle>
            <DialogDescription>
              Granting global administrative powers to{" "}
              <strong className="text-foreground">{selectedUser?.email}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label>Target Role</Label>
              <Select value={newRole} onValueChange={(v: "admin" | "super_admin") => setNewRole(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Global Admin</SelectItem>
                  <SelectItem value="super_admin">Super Admin (God Mode)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>SOC2 Audit Reason</Label>
              <Input
                placeholder="e.g., Granted IT Lead access to admin tools"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={elevateMutation.isPending}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setElevateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => elevateMutation.mutate()}
              disabled={elevateMutation.isPending || reason.length < 10}
              className="bg-indigo-500 hover:bg-indigo-600 text-white"
            >
              {elevateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "Confirm Elevation"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
