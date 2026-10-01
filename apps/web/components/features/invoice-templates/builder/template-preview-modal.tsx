"use client";

import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiUrl } from "@/lib/constants";
import { InvoiceTablePreview } from "./invoice-table-preview";

export function TemplatePreviewModal({
  isOpen,
  onClose,
  templateId,
}: {
  isOpen: boolean;
  onClose: () => void;
  templateId: string;
}) {
  const { data: preview, isLoading } = useQuery({
    queryKey: ["template-preview", templateId],
    queryFn: async () => {
      // Create a dummy project/client for the preview
      const res = await fetch(`${apiUrl}/api/invoices/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          templateId,
          projectId: "preview",
          clientId: "preview",
        }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const json = await res.json();
      return json.data || json;
    },
    enabled: isOpen,
  });

  const sections = preview?.sections || [];
  const grandTotal = Number(preview?.grandTotal ?? 0);
  const validationErrors = preview?.validationErrors || [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2 border-b">
          <DialogTitle>Template Preview</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto bg-muted/20 p-6">
          <InvoiceTablePreview
            previewLoading={isLoading}
            preview={preview}
            sections={sections}
            grandTotal={grandTotal}
            validationErrors={validationErrors}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
