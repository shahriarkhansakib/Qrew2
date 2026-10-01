"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { Can } from "@/components/features/auth/can";
import { WalletHistoryModal } from "@/components/features/financials/wallet-history-modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiUrl } from "@/lib/constants";

// We'll reuse the staff fetch to show all wallets for admins
export function WalletsTab() {
  const [viewingUser, setViewingUser] = useState<any | null>(null);

  // For Admin: Fetch all staff to show their balances
  const { data: staffList = [], isLoading: loadingStaff } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/staff/list`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.staff || [];
    },
  });

  // For User: Fetch their own balance
  const { data: myBalanceData } = useQuery({
    queryKey: ["wallet-balance", "me"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/wallet/balance`, { credentials: "include" });
      if (!res.ok) return { balance: 0 };
      return res.json();
    },
  });

  // Transaction history for the selected user (or current user if viewingUser is null)
  const targetUserId = viewingUser ? viewingUser.userId : "";
  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ["wallet-transactions", targetUserId],
    queryFn: async () => {
      const res = await fetch(
        `${apiUrl}/api/wallet/transactions${targetUserId ? `?userId=${targetUserId}` : ""}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!targetUserId || viewingUser === null, // if viewingUser is null, it means we are a standard user just viewing our own tab, or an admin hasn't clicked anyone yet. Wait, admins should only fetch when they click.
  });

  return (
    <div className="flex flex-col gap-6">
      {/* User's own Wallet Overview */}
      <div className="rounded-xl border bg-linear-to-br from-card to-muted p-6 shadow-sm">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">My Wallet Balance</h3>
        <p className="text-4xl font-bold tracking-tight text-green-600 dark:text-green-500">
          ${Number(myBalanceData?.balance || 0).toFixed(2)}
        </p>
        <p className="text-sm text-muted-foreground mt-2">Funds available for office expenses.</p>
      </div>

      {/* Admin View: All Staff Wallets */}
      <Can I="financials:manage">
        <div>
          <h3 className="text-lg font-semibold mb-4">Organization Wallets</h3>
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Wallet Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingStaff ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center h-24">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : staffList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center h-24">
                      No staff found.
                    </TableCell>
                  </TableRow>
                ) : (
                  staffList.map((staff: any) => (
                    <TableRow
                      key={staff.memberId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setViewingUser(staff)}
                    >
                      <TableCell className="font-medium">
                        <div>{staff.name}</div>
                        <div className="text-xs text-muted-foreground">{staff.email}</div>
                      </TableCell>
                      <TableCell>{staff.roleName}</TableCell>
                      <TableCell className="text-right font-semibold text-green-600 dark:text-green-500">
                        ${Number(staff.walletBalance || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Can>

      {/* User View: Own Transactions (Only if not admin OR if they explicitly want to see their own. For simplicity, just list them below the card for non-admins) */}
      <Can not I="financials:manage">
        <div>
          <h3 className="text-lg font-semibold mb-4">My Transaction History</h3>
          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingTx ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24">
                      No transactions.
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell>{format(new Date(tx.createdAt), "MMM d, yyyy")}</TableCell>
                      <TableCell className="capitalize">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            tx.type === "credit"
                              ? "bg-green-100 text-green-700"
                              : tx.type === "debit"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {tx.type}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {tx.type === "debit" ? "-" : ""}${Number(tx.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>{tx.description || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Can>

      {/* Admin: View User Transactions Modal */}
      <WalletHistoryModal viewingUser={viewingUser} onClose={() => setViewingUser(null)} />
    </div>
  );
}
