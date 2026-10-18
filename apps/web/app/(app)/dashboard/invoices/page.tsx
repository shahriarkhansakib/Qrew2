"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CornerUpLeft,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Receipt,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ClientDetailsModal } from "@/components/features/clients/client-details-modal";
import { GenerateInvoiceModal } from "@/components/features/invoices/generate-invoice-modal";
import { ProjectDetailsModal } from "@/components/features/projects/project-details-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/lib/utils";

// ─── Status display helpers ───────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  draft: { label: "Draft", color: "bg-muted text-muted-foreground border-border", icon: Clock },
  frozen: {
    label: "Ready to Bill",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    icon: CheckCircle2,
  },
  issued: {
    label: "Issued",
    color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    icon: Receipt,
  },
  disputed: {
    label: "Disputed",
    color: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    icon: AlertCircle,
  },
  paid: {
    label: "Paid",
    color: "bg-primary/10 text-primary border-primary/20",
    icon: CheckCircle2,
  },
  void: { label: "Void", color: "bg-red-500/10 text-red-400 border-red-500/20", icon: AlertCircle },
  uncollectible: {
    label: "Uncollectible",
    color: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    icon: AlertCircle,
  },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status,
    color: "bg-muted text-muted-foreground border-border",
    icon: Clock,
  };
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
        meta.color,
      )}
    >
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

// ─── Tab counter badge ────────────────────────────────────────────────────────

function CountBadge({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold w-4 h-4">
      {count > 9 ? "9+" : count}
    </span>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="h-32 text-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Receipt className="w-7 h-7 opacity-30" />
          <p className="text-sm">{message}</p>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("drafts");
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [selectedFileForDetails, setSelectedFileForDetails] = useState<any>(null);
  const [clientToView, setClientToView] = useState<any>(null);

  const [draftToDelete, setDraftToDelete] = useState<string | null>(null);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);

  const [invoiceToRevert, setInvoiceToRevert] = useState<any | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  const queryClient = useQueryClient();

  const handleAction = async (
    invoiceId: string,
    action: "unfreeze" | "mark-paid" | "issue" | "dispute" | "void",
  ) => {
    try {
      const res = await fetch(`${apiUrl}/api/invoices/${invoiceId}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Action failed");
      }
      const actionMessages: Record<string, string> = {
        unfreeze: "Invoice reverted to draft for corrections",
        dispute: "Invoice marked as disputed",
        void: "Invoice marked as void",
        issue: "Invoice marked as issued",
        "mark-paid": "Invoice marked as paid",
      };
      toast.success(actionMessages[action] || "Invoice updated successfully");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to update invoice");
    }
  };

  // Drafts
  const { data: drafts, isLoading: draftsLoading } = useQuery({
    queryKey: ["invoice-drafts"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoices/drafts/list`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch drafts");
      return res.json();
    },
  });

  // Ready to Bill (frozen invoices — awaiting client billing)
  const { data: readyToBill, isLoading: readyLoading } = useQuery({
    queryKey: ["invoices", "frozen"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoices?status=frozen`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ready-to-bill invoices");
      return res.json();
    },
  });

  // All Invoices (issued / paid / void / uncollectible)
  const { data: allInvoices, isLoading: allLoading } = useQuery({
    queryKey: ["invoices", "all"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoices`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch invoices");
      return res.json();
    },
  });

  const _openGenerateModal = (projectId: string) => {
    setSelectedProjectId(projectId);
    setIsGenerateModalOpen(true);
  };

  // Filter "All Invoices" to exclude frozen/draft (those live in their own tabs)
  const billedInvoices = (allInvoices ?? []).filter(
    (inv: any) => !["draft", "frozen"].includes(inv.status),
  );
  const frozenInvoices = readyToBill ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Manage the full invoice lifecycle — from draft to payment.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          {/* Tab order: Drafts → Ready to Bill → All Invoices */}
          <TabsTrigger value="drafts" className="flex items-center">
            Drafts
            <CountBadge count={(drafts ?? []).length} />
          </TabsTrigger>
          <TabsTrigger value="ready" className="flex items-center">
            Ready to Bill
            <CountBadge count={frozenInvoices.length} />
          </TabsTrigger>
          <TabsTrigger value="all">All Invoices</TabsTrigger>
        </TabsList>

        {/* ── DRAFTS ── */}
        <TabsContent value="drafts">
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[38%]">Invoice / File</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Last Saved</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draftsLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                      Loading drafts…
                    </TableCell>
                  </TableRow>
                ) : (drafts ?? []).length === 0 ? (
                  <EmptyRow
                    colSpan={4}
                    message="No drafts found. Generate an invoice from a file to create a draft."
                  />
                ) : (
                  (drafts ?? []).map((draft: any) => (
                    <TableRow key={draft.id} className="hover:bg-muted/30 transition-colors group">
                      {/* Invoice / File */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-sm">
                            {draft.name || "Invoice Draft"}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {draft.project?.name || draft.projectId}
                          </span>
                        </div>
                      </TableCell>
                      {/* Created By */}
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium text-xs">
                            {draft.user?.name || draft.user?.email || "Team Member"}
                          </span>
                          {draft.createdAt && (
                            <span className="text-[11px] text-muted-foreground">
                              {format(new Date(draft.createdAt), "MMM d, yyyy")}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {/* Last saved */}
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="flex flex-col">
                          <span>
                            {draft.lastAutoSavedAt
                              ? format(new Date(draft.lastAutoSavedAt), "MMM d, yyyy h:mm a")
                              : draft.updatedAt
                                ? format(new Date(draft.updatedAt), "MMM d, yyyy h:mm a")
                                : "—"}
                          </span>
                          {Array.isArray(draft.editHistory) && draft.editHistory.length > 1 && (
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {draft.editHistory.length} revisions
                            </span>
                          )}
                        </div>
                      </TableCell>
                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/dashboard/invoices/drafts/${draft.id}`}>
                            <Button variant="outline" size="sm" className="gap-1.5">
                              <Pencil className="h-3.5 w-3.5" />
                              Edit Draft
                            </Button>
                          </Link>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[160px]">
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                onClick={() => setDraftToDelete(draft.id)}
                              >
                                Delete Draft
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <AlertDialog
            open={!!draftToDelete}
            onOpenChange={(open) => !open && setDraftToDelete(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your invoice draft.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletingDraft}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={isDeletingDraft}
                  className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                  onClick={async (e) => {
                    e.preventDefault();
                    if (!draftToDelete) return;
                    setIsDeletingDraft(true);
                    try {
                      const res = await fetch(`${apiUrl}/api/invoices/drafts/${draftToDelete}`, {
                        method: "DELETE",
                        credentials: "include",
                      });
                      if (!res.ok) throw new Error("Failed to delete draft");
                      toast.success("Draft deleted");
                      queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
                      setDraftToDelete(null);
                    } catch (error) {
                      console.error(error);
                      toast.error("An error occurred while deleting the draft");
                    } finally {
                      setIsDeletingDraft(false);
                    }
                  }}
                >
                  {isDeletingDraft ? "Deleting..." : "Delete Draft"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        {/* ── READY TO BILL ── */}
        <TabsContent value="ready">
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[35%]">Invoice</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readyLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : frozenInvoices.length === 0 ? (
                  <EmptyRow
                    colSpan={6}
                    message="No invoices ready to bill. Finalize a draft to move it here."
                  />
                ) : (
                  frozenInvoices.map((inv: any) => (
                    <TableRow key={inv.id} className="hover:bg-muted/30 transition-colors group">
                      {/* Invoice name / doc number */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-sm">
                            {inv.documentNumber && inv.documentNumber !== "PENDING"
                              ? inv.documentNumber
                              : inv.sourceTemplateName || "Invoice"}
                          </span>
                        </div>
                      </TableCell>
                      {/* File */}
                      <TableCell className="text-sm">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFileForDetails(inv.project);
                          }}
                          className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                        >
                          <FileText className="w-3 h-3 shrink-0" />
                          <span className="truncate">{inv.project?.name || "—"}</span>
                        </button>
                      </TableCell>
                      {/* Client */}
                      <TableCell className="text-sm">
                        {inv.project?.client ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setClientToView(inv.project.client);
                            }}
                            className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                          >
                            <span className="truncate">
                              {inv.issuedToClientName || inv.project.client.name}
                            </span>
                          </button>
                        ) : (
                          <span className="text-muted-foreground">
                            {inv.issuedToClientName || "—"}
                          </span>
                        )}
                      </TableCell>
                      {/* Status */}
                      <TableCell>
                        <StatusBadge status={inv.status} />
                      </TableCell>
                      {/* Amount */}
                      <TableCell className="font-semibold tabular-nums text-sm">
                        $
                        {Number(inv.grandTotalAmount ?? inv.totalAmount ?? 0).toLocaleString(
                          undefined,
                          { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                        )}
                      </TableCell>
                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-2">
                          <Button variant="outline" size="sm" className="gap-1.5" asChild>
                            <Link href={`/dashboard/invoices/${inv.id}`}>
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </Link>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleAction(inv.id, "issue")}>
                                <Send className="w-4 h-4 mr-2" />
                                Mark as Issued
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleAction(inv.id, "mark-paid")}>
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Mark as Paid
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setInvoiceToRevert(inv)}
                                className="text-accent-foreground focus:text-accent-foreground"
                              >
                                <CornerUpLeft className="w-4 h-4 mr-2" />
                                Revert to Draft
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleAction(inv.id, "void")}
                                className="text-red-600 focus:text-red-600"
                              >
                                <AlertCircle className="w-4 h-4 mr-2" />
                                Void Invoice
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── ALL INVOICES (issued / paid / void) ── */}
        <TabsContent value="all">
          <div className="rounded-xl border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[28%]">Invoice</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-24 text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : billedInvoices.length === 0 ? (
                  <EmptyRow colSpan={7} message="No completed invoices yet." />
                ) : (
                  billedInvoices.map((inv: any) => (
                    <TableRow key={inv.id} className="hover:bg-muted/30 transition-colors group">
                      {/* Invoice */}
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-sm">
                            {inv.documentNumber && inv.documentNumber !== "PENDING"
                              ? inv.documentNumber
                              : inv.sourceTemplateName || "Invoice"}
                          </span>
                        </div>
                      </TableCell>
                      {/* File */}
                      <TableCell className="text-sm">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFileForDetails(inv.project);
                          }}
                          className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                        >
                          <FileText className="w-3 h-3 shrink-0" />
                          <span className="truncate">{inv.project?.name || "—"}</span>
                        </button>
                      </TableCell>
                      {/* Client */}
                      <TableCell className="text-sm">
                        {inv.project?.client ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setClientToView(inv.project.client);
                            }}
                            className="flex items-center gap-1 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                          >
                            <span className="truncate">
                              {inv.issuedToClientName || inv.project.client.name}
                            </span>
                          </button>
                        ) : (
                          <span className="text-muted-foreground">
                            {inv.issuedToClientName || "—"}
                          </span>
                        )}
                      </TableCell>
                      {/* Status */}
                      <TableCell>
                        <StatusBadge status={inv.status} />
                      </TableCell>
                      {/* Issued date */}
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.issuedAt ? format(new Date(inv.issuedAt), "MMM d, yyyy") : "—"}
                      </TableCell>
                      {/* Amount */}
                      <TableCell className="font-bold tabular-nums text-sm">
                        $
                        {Number(inv.grandTotalAmount ?? inv.totalAmount ?? 0).toLocaleString(
                          undefined,
                          { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                        )}
                      </TableCell>
                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-2">
                          <Button variant="outline" size="sm" className="gap-1.5" asChild>
                            <Link href={`/dashboard/invoices/${inv.id}`}>
                              <Eye className="h-3.5 w-3.5" />
                              View
                            </Link>
                          </Button>
                          {inv.status !== "void" && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {inv.status === "issued" && (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => handleAction(inv.id, "mark-paid")}
                                    >
                                      <CheckCircle2 className="w-4 h-4 mr-2" />
                                      Mark as Paid
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleAction(inv.id, "dispute")}
                                    >
                                      <AlertCircle className="w-4 h-4 mr-2 text-amber-500" />
                                      Mark as Disputed
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setInvoiceToRevert(inv)}
                                      className="text-accent-foreground focus:text-accent-foreground"
                                    >
                                      <CornerUpLeft className="w-4 h-4 mr-2" />
                                      Revert to Draft (Correct)
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleAction(inv.id, "void")}
                                      className="text-red-600 focus:text-red-600"
                                    >
                                      <AlertCircle className="w-4 h-4 mr-2" />
                                      Void Invoice
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {inv.status === "disputed" && (
                                  <>
                                    <DropdownMenuItem onClick={() => handleAction(inv.id, "issue")}>
                                      <Send className="w-4 h-4 mr-2" />
                                      Resolve Dispute (Re-Issue)
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleAction(inv.id, "mark-paid")}
                                    >
                                      <CheckCircle2 className="w-4 h-4 mr-2" />
                                      Mark as Paid
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => setInvoiceToRevert(inv)}
                                      className="text-accent-foreground focus:text-accent-foreground"
                                    >
                                      <CornerUpLeft className="w-4 h-4 mr-2" />
                                      Revert to Draft (Correct)
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleAction(inv.id, "void")}
                                      className="text-red-600 focus:text-red-600"
                                    >
                                      <AlertCircle className="w-4 h-4 mr-2" />
                                      Void Invoice
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {inv.status === "paid" && (
                                  <DropdownMenuItem
                                    onClick={() => handleAction(inv.id, "void")}
                                    className="text-red-600 focus:text-red-600"
                                  >
                                    <AlertCircle className="w-4 h-4 mr-2" />
                                    Void Invoice
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Revert to Draft (Correction) Confirmation Dialog ── */}
      <AlertDialog
        open={!!invoiceToRevert}
        onOpenChange={(open) => !open && !isReverting && setInvoiceToRevert(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert Invoice to Editable Draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unlock invoice{" "}
              <strong className="text-foreground">
                {invoiceToRevert?.documentNumber && invoiceToRevert?.documentNumber !== "PENDING"
                  ? invoiceToRevert.documentNumber
                  : invoiceToRevert?.sourceTemplateName || "Invoice"}
              </strong>{" "}
              and convert it back into an active draft. You will be able to modify line items,
              re-evaluate dynamic formulas, and correct values before re-finalizing. The draft will
              open immediately for editing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isReverting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isReverting}
              className="bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-600 gap-1.5"
              onClick={async (e) => {
                e.preventDefault();
                if (!invoiceToRevert) return;
                setIsReverting(true);
                try {
                  const res = await fetch(`${apiUrl}/api/invoices/${invoiceToRevert.id}/unfreeze`, {
                    method: "POST",
                    credentials: "include",
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    throw new Error(data.error || "Failed to revert invoice");
                  }
                  toast.success("Invoice reverted to draft for corrections");
                  queryClient.invalidateQueries({ queryKey: ["invoices"] });
                  queryClient.invalidateQueries({ queryKey: ["invoice-drafts"] });
                  const draftId = data.draftId;
                  setInvoiceToRevert(null);
                  if (draftId) {
                    router.push(`/dashboard/invoices/drafts/${draftId}`);
                  }
                } catch (err: any) {
                  toast.error(err.message || "Failed to revert invoice");
                } finally {
                  setIsReverting(false);
                }
              }}
            >
              {isReverting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Reverting...
                </>
              ) : (
                "Revert & Open Draft"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isGenerateModalOpen && selectedProjectId && (
        <GenerateInvoiceModal
          isOpen={isGenerateModalOpen}
          onClose={() => setIsGenerateModalOpen(false)}
          projectId={selectedProjectId}
        />
      )}

      {selectedFileForDetails && (
        <ProjectDetailsModal
          project={selectedFileForDetails}
          onClose={() => setSelectedFileForDetails(null)}
        />
      )}

      {clientToView && (
        <ClientDetailsModal client={clientToView} onClose={() => setClientToView(null)} />
      )}
    </div>
  );
}
