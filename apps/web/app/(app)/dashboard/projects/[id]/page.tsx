"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  Clock,
  Eye,
  FileStack,
  Pencil,
  Plus,
  Receipt,
} from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { GenerateInvoiceModal } from "@/components/features/invoices/generate-invoice-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export default function ProjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const [isGenerateInvoiceOpen, setIsGenerateInvoiceOpen] = useState(false);

  // 1. Fetch Project Details
  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/projects/${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
  });

  // 2. Fetch Expenses
  const { data: expenses, isLoading: expensesLoading } = useQuery({
    queryKey: ["expenses", projectId],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/expenses?projectId=${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch expenses for this project");
      return res.json();
    },
  });

  // 3. Fetch Invoices
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["project-invoices", projectId],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoices?projectId=${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // 4. Fetch Drafts
  const { data: drafts, isLoading: draftsLoading } = useQuery({
    queryKey: ["project-drafts", projectId],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoices/drafts/list?projectId=${projectId}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const statusColor: Record<string, string> = {
    frozen: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    issued: "bg-primary/15 text-primary border-primary/30",
    paid: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    void: "bg-red-500/15 text-red-400 border-red-500/30",
    draft: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  };

  const totalExpenses = (expenses ?? []).reduce(
    (acc: number, item: any) => acc + Number(item.amount || 0),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/projects">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {project?.name || "Project Details"}
              </h1>
              {project?.status && (
                <Badge variant="outline" className="text-xs">
                  {project.statusRelation?.name || project.status}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Client:{" "}
              <strong className="text-foreground">{project?.client?.name || "Unassigned"}</strong> •
              Recorded Expenses:{" "}
              <strong className="text-foreground font-mono">
                ${totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => setIsGenerateInvoiceOpen(true)} className="gap-2">
            <Receipt className="h-4 w-4" />
            Generate Invoice
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="invoices" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="invoices" className="flex items-center gap-1.5">
            <FileStack className="w-4 h-4" />
            Invoices & Drafts
            {(drafts?.length ?? 0) + (invoices?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">
                {(drafts?.length ?? 0) + (invoices?.length ?? 0)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex items-center gap-1.5">
            <Receipt className="w-4 h-4" />
            Expenses
            {(expenses?.length ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 h-4">
                {expenses.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── INVOICES & DRAFTS TAB ── */}
        <TabsContent value="invoices" className="space-y-6">
          {/* Active Collaborative Drafts */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-500" />
                    Active Collaborative Drafts
                  </CardTitle>
                  <CardDescription>
                    Work-in-progress drafts shared across the team. Updates calculate dynamically.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsGenerateInvoiceOpen(true)}
                  className="gap-1.5 text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Draft
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {draftsLoading ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  Loading drafts...
                </div>
              ) : (drafts ?? []).length === 0 ? (
                <div className="text-center py-6 border border-dashed rounded-lg text-sm text-muted-foreground">
                  No active drafts for this project. Click "New Draft" to begin drafting an invoice.
                </div>
              ) : (
                <div className="divide-y rounded-md border">
                  {(drafts ?? []).map((draft: any) => (
                    <div
                      key={draft.id}
                      className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{draft.name || "Invoice Draft"}</span>
                        <span className="text-xs text-muted-foreground">
                          Created by {draft.user?.name || draft.user?.email || "Team Member"} •{" "}
                          {draft.lastAutoSavedAt
                            ? `Last edited ${format(new Date(draft.lastAutoSavedAt), "MMM d, h:mm a")}`
                            : "Draft"}
                        </span>
                      </div>
                      <Link href={`/dashboard/invoices/drafts/${draft.id}`}>
                        <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                          <Pencil className="w-3.5 h-3.5" />
                          Resume Draft
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Finalized Invoices */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Receipt className="w-4 h-4 text-primary" />
                Finalized Invoices
              </CardTitle>
              <CardDescription>
                Frozen, issued, and paid invoices generated for this project.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoicesLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center h-20 text-muted-foreground">
                          Loading invoices...
                        </TableCell>
                      </TableRow>
                    ) : (invoices ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center h-20 text-muted-foreground">
                          No finalized invoices recorded yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (invoices ?? []).map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium text-sm">
                            {inv.documentNumber || inv.sourceTemplateName || "Invoice"}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border",
                                statusColor[inv.status] ||
                                  "bg-muted text-muted-foreground border-border",
                              )}
                            >
                              {inv.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(inv.createdAt), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums text-sm">
                            $
                            {Number(inv.grandTotalAmount ?? inv.totalAmount ?? 0).toLocaleString(
                              undefined,
                              { minimumFractionDigits: 2, maximumFractionDigits: 2 },
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Link href={`/dashboard/invoices/${inv.id}`}>
                              <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                                <Eye className="w-3.5 h-3.5" />
                                View
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── EXPENSES TAB ── */}
        <TabsContent value="expenses">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Recorded Project Expenses</CardTitle>
              <CardDescription>
                All expenses logged against this project. These are dynamically ingested into
                invoice formulas via EXP_* tokens.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Spent By</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expensesLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center h-24">
                          Loading expenses...
                        </TableCell>
                      </TableRow>
                    ) : (expenses ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                          No expenses logged for this project yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      expenses?.map((ex: any) => (
                        <TableRow key={ex.id}>
                          <TableCell className="font-medium">{ex.spentBy || "Unknown"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal text-xs">
                              {ex.categoryName}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-semibold tabular-nums">
                            ${Number(ex.amount).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {format(new Date(ex.createdAt), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {ex.description || "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Generate Invoice Modal */}
      {isGenerateInvoiceOpen && (
        <GenerateInvoiceModal
          isOpen={isGenerateInvoiceOpen}
          onClose={() => setIsGenerateInvoiceOpen(false)}
          projectId={projectId}
          projectName={project?.name}
        />
      )}
    </div>
  );
}
