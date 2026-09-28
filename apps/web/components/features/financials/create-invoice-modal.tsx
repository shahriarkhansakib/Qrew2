"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiUrl } from "@/lib/constants";

export function CreateInvoiceModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [taxRate, setTaxRate] = useState<number>(0);

  const [lineItems, setLineItems] = useState<
    {
      id: string;
      description: string;
      quantity: number;
      unitPrice: number;
      expenseId?: string;
    }[]
  >([{ id: "1", description: "Service Fee", quantity: 1, unitPrice: 0 }]);

  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/projects`, { credentials: "include" });
      return res.json();
    },
  });

  const { data: clientsData } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/clients`, { credentials: "include" });
      return res.json();
    },
  });

  const { data: expensesData } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/expenses`, { credentials: "include" });
      return res.json();
    },
  });

  const projects = Array.isArray(projectsData) ? projectsData : [];
  const clients = Array.isArray(clientsData) ? clientsData : [];
  const expenses = Array.isArray(expensesData) ? expensesData : [];

  const { mutate: createInvoice, isPending } = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`${apiUrl}/api/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to create invoice");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice created successfully");
      reset();
      onClose();
    },
    onError: () => toast.error("Failed to create invoice"),
  });

  const reset = () => {
    setProjectId("");
    setClientId("");
    setInvoiceNumber("");
    setIssueDate(format(new Date(), "yyyy-MM-dd"));
    setDueDate("");
    setNotes("");
    setTaxRate(0);
    setLineItems([{ id: "1", description: "Service Fee", quantity: 1, unitPrice: 0 }]);
  };

  const handleImportExpenses = () => {
    if (!projectId) {
      toast.error("Please select a file/project first");
      return;
    }
    const projectExpenses = expenses?.filter((e: any) => e.projectId === projectId);
    if (!projectExpenses || projectExpenses.length === 0) {
      toast.info("No expenses found for this file.");
      return;
    }

    const newLines = projectExpenses.map((ex: any) => ({
      id: Math.random().toString(),
      description: `${ex.categoryName} - ${ex.description || "Expense"}`,
      quantity: 1,
      unitPrice: Number(ex.amount),
      expenseId: ex.id,
    }));

    setLineItems((prev) => [...prev, ...newLines]);
    toast.success(`Imported ${newLines.length} expenses`);
  };

  const updateLineItem = (id: string, field: string, value: any) => {
    setLineItems((prev) => prev.map((li) => (li.id === id ? { ...li, [field]: value } : li)));
  };

  const removeLineItem = (id: string) => {
    setLineItems((prev) => prev.filter((li) => li.id !== id));
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: Math.random().toString(), description: "", quantity: 1, unitPrice: 0 },
    ]);
  };

  const subtotal = lineItems.reduce((acc, li) => acc + li.quantity * li.unitPrice, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal + taxAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNumber) {
      toast.error("Invoice number is required");
      return;
    }

    createInvoice({
      clientId: clientId || null,
      projectId: projectId || null,
      invoiceNumber,
      issueDate: issueDate || undefined,
      dueDate: dueDate || undefined,
      subtotal,
      taxAmount,
      totalAmount,
      notes,
      lineItems: lineItems.map((li) => ({
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        amount: li.quantity * li.unitPrice,
        expenseId: li.expenseId,
      })),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Invoice Number</Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                required
                placeholder="INV-2023-001"
              />
            </div>

            <div className="space-y-2">
              <Label>Client (Optional)</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {clients?.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>File / Project (Optional)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a file" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {projectId && projectId !== "none" && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="px-0"
                  onClick={handleImportExpenses}
                >
                  Import Billable Expenses
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>Issue Date</Label>
              <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Tax Rate (%)</Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={taxRate}
                onChange={(e) => setTaxRate(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Label className="text-lg font-semibold">Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                <Plus className="mr-2 h-4 w-4" /> Add Item
              </Button>
            </div>

            <div className="border rounded-md p-4 space-y-4 bg-muted/20">
              {lineItems.map((li, _idx) => (
                <div key={li.id} className="flex gap-4 items-end">
                  <div className="flex-1 space-y-2">
                    <Label className="text-xs">Description</Label>
                    <Input
                      value={li.description}
                      onChange={(e) => updateLineItem(li.id, "description", e.target.value)}
                      required
                    />
                  </div>
                  <div className="w-24 space-y-2">
                    <Label className="text-xs">Qty</Label>
                    <Input
                      type="number"
                      min="1"
                      step="0.1"
                      value={li.quantity}
                      onChange={(e) => updateLineItem(li.id, "quantity", Number(e.target.value))}
                      required
                    />
                  </div>
                  <div className="w-32 space-y-2">
                    <Label className="text-xs">Unit Price</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={li.unitPrice}
                      onChange={(e) => updateLineItem(li.id, "unitPrice", Number(e.target.value))}
                      required
                    />
                  </div>
                  <div className="w-32 space-y-2">
                    <Label className="text-xs">Amount</Label>
                    <div className="h-10 flex items-center px-3 border rounded-md bg-muted">
                      ${(li.quantity * li.unitPrice).toFixed(2)}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-red-500 mb-0.5"
                    onClick={() => removeLineItem(li.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {lineItems.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">No items added.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tax ({taxRate}%):</span>
                <span>${taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total:</span>
                <span>${totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment terms, thank you message, etc."
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating..." : "Save Invoice"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
