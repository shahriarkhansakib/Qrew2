"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiUrl } from "@/lib/constants";

export function SaveDraftAsTemplateModal({
  isOpen,
  onClose,
  draftId,
  defaultName = "",
  defaultDescription = "",
}: {
  isOpen: boolean;
  onClose: () => void;
  draftId: string;
  defaultName?: string;
  defaultDescription?: string;
}) {
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [documentPrefix, setDocumentPrefix] = useState("INV");
  const [numberingFormat, setNumberingFormat] = useState("{PREFIX}-{YYYY}-{SEQ:4}");

  useEffect(() => {
    if (isOpen) {
      setName(defaultName ? `${defaultName} (Template)` : "Custom Master Template");
      setDescription(defaultDescription || "");
      setDocumentPrefix("INV");
      setNumberingFormat("{PREFIX}-{YYYY}-{SEQ:4}");
    }
  }, [isOpen, defaultName, defaultDescription]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiUrl}/api/invoices/drafts/${draftId}/save-as-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          documentPrefix: documentPrefix.trim() || "INV",
          numberingFormat: numberingFormat.trim() || "{PREFIX}-{YYYY}-{SEQ:4}",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save draft as template");
      }

      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["invoice-templates"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      toast.success(`Template "${data.name}" created successfully!`, {
        action: {
          label: "Open Template",
          onClick: () => {
            window.open(`/org-admin/invoice-templates/${data.id}`, "_blank");
          },
        },
      });
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create template from draft");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Template name is required");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <BookmarkPlus className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">Save Draft as Template</DialogTitle>
              <DialogDescription className="text-xs">
                Turn this draft's sections, line items, and formulas into a reusable master
                template.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="template-name" className="text-xs font-semibold">
              Template Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tanker Port Dues Template"
              className="text-xs h-9"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-desc" className="text-xs font-semibold">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="template-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of when to use this template..."
              className="text-xs min-h-[70px] resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="doc-prefix" className="text-xs font-semibold">
                Doc Prefix
              </Label>
              <Input
                id="doc-prefix"
                value={documentPrefix}
                onChange={(e) => setDocumentPrefix(e.target.value.toUpperCase())}
                placeholder="INV"
                className="text-xs h-9 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-format" className="text-xs font-semibold">
                Numbering Format
              </Label>
              <Input
                id="doc-format"
                value={numberingFormat}
                onChange={(e) => setNumberingFormat(e.target.value)}
                placeholder="{PREFIX}-{YYYY}-{SEQ:4}"
                className="text-xs h-9 font-mono"
              />
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saveMutation.isPending || !name.trim()}
              className="gap-1.5"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Creating Template...
                </>
              ) : (
                <>
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  Save as Template
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
