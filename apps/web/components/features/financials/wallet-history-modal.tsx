"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiUrl } from "@/lib/constants";

interface WalletHistoryModalProps {
  viewingUser: any | null;
  onClose: () => void;
}

export function WalletHistoryModal({ viewingUser, onClose }: WalletHistoryModalProps) {
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
    enabled: !!targetUserId,
  });

  return (
    <Dialog open={!!viewingUser} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Wallet History - {viewingUser?.name}</DialogTitle>
          <DialogDescription>
            Current Balance:{" "}
            <span className="font-bold text-green-600">
              ${Number(viewingUser?.walletBalance || 0).toFixed(2)}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {/* Transaction List */}
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
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
                      No transactions found.
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
                              ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400"
                              : tx.type === "debit"
                                ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
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
      </DialogContent>
    </Dialog>
  );
}
