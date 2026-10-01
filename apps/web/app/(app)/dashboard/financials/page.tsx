"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AddExpenseModal } from "@/components/features/financials/add-expense-modal";
import { AddRequisitionModal } from "@/components/features/financials/add-requisition-modal";
import { WalletsTab } from "@/components/features/financials/wallets-tab";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiUrl } from "@/lib/constants";
import { usePermissionStore } from "@/store/use-permission-store";

export default function FinancialsPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissionStore();
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isReqModalOpen, setIsReqModalOpen] = useState(false);

  // Fetch Expenses
  const { data: expenses, isLoading: loadingExpenses } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/expenses`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch expenses");
      return res.json();
    },
  });

  // Fetch Requisitions
  const { data: requisitions, isLoading: loadingReqs } = useQuery({
    queryKey: ["requisitions"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/requisitions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch requisitions");
      return res.json();
    },
  });

  const { mutate: actionReq, isPending: actioning } = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`${apiUrl}/api/requisitions/${id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Action failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requisitions"] });
      toast.success("Requisition updated successfully");
    },
    onError: () => toast.error("Failed to action requisition"),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financials Dashboard</h1>
          <p className="text-muted-foreground">
            Manage organizational expenses and fund requisitions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsReqModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Request Funds
          </Button>
          <Button onClick={() => setIsExpenseModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Log Expense
          </Button>
        </div>
      </div>

      <Tabs defaultValue="expenses" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="requisitions">Requisitions</TabsTrigger>
          <TabsTrigger value="wallets">Wallets</TabsTrigger>
        </TabsList>

        {/* EXPENSES TAB */}
        <TabsContent value="expenses">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Spent By</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>File / Project</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingExpenses ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : expenses?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      No expenses found.
                    </TableCell>
                  </TableRow>
                ) : (
                  expenses?.map((ex: any) => (
                    <TableRow key={ex.id}>
                      <TableCell className="font-medium">{ex.spentBy || "Unknown"}</TableCell>
                      <TableCell>{ex.categoryName}</TableCell>
                      <TableCell>${Number(ex.amount).toFixed(2)}</TableCell>
                      <TableCell>{format(new Date(ex.createdAt), "MMM d, yyyy")}</TableCell>
                      <TableCell>{ex.projectName || "-"}</TableCell>
                      <TableCell>{ex.description || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* REQUISITIONS TAB */}
        <TabsContent value="requisitions">
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>File / Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingReqs ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : requisitions?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24">
                      No requisitions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  requisitions?.map((req: any) => (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">{req.requestedBy || "Unknown"}</TableCell>
                      <TableCell>${Number(req.amount).toFixed(2)}</TableCell>
                      <TableCell>{format(new Date(req.createdAt), "MMM d, yyyy")}</TableCell>
                      <TableCell>{req.projectName || "-"}</TableCell>
                      <TableCell className="capitalize">{req.status}</TableCell>
                      <TableCell className="text-right">
                        {req.status === "pending" && can("finance:approve_requisition") && (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600"
                              onClick={() => actionReq({ id: req.id, status: "approved" })}
                              disabled={actioning}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => actionReq({ id: req.id, status: "rejected" })}
                              disabled={actioning}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                        {req.status === "approved" && can("finance:approve_requisition") && (
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => actionReq({ id: req.id, status: "disbursed" })}
                            disabled={actioning}
                          >
                            Mark Disbursed
                          </Button>
                        )}
                        {req.status === "disbursed" && (
                          <span className="text-xs text-muted-foreground">Disbursed</span>
                        )}
                        {req.status === "rejected" && (
                          <span className="text-xs text-muted-foreground">Rejected</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* WALLETS TAB */}
        <TabsContent value="wallets">
          <WalletsTab />
        </TabsContent>
      </Tabs>

      <AddExpenseModal isOpen={isExpenseModalOpen} onClose={() => setIsExpenseModalOpen(false)} />
      <AddRequisitionModal isOpen={isReqModalOpen} onClose={() => setIsReqModalOpen(false)} />
    </div>
  );
}
