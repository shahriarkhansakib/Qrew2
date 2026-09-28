"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { DynamicCustomFieldsRenderer } from "@/components/features/custom-fields/dynamic-custom-fields-renderer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiUrl } from "@/lib/constants";

interface EditStageDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
  status: any;
  customFields: any[];
}

export function EditStageDataModal({
  isOpen,
  onClose,
  project,
  status,
  customFields,
}: EditStageDataModalProps) {
  const queryClient = useQueryClient();

  const stageFields = customFields?.filter((f) => f.projectStatusId === status?.id) || [];

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      customFields: project?.customFields || {},
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      // Merge new custom fields with existing ones
      const updatedFields = {
        ...project.customFields,
        ...values.customFields,
      };

      const payload = {
        name: project.name,
        clientId: project.clientId,
        status: project.status, // ID
        customFields: updatedFields,
      };

      const res = await fetch(`${apiUrl}/api/workspaces/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update project data");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Stage data updated");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Data: {status?.name}</DialogTitle>
        </DialogHeader>

        {stageFields.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            No fields configured for this stage.
          </div>
        ) : (
          <form onSubmit={handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
            <DynamicCustomFieldsRenderer
              control={control}
              definitions={stageFields}
              basePath="customFields"
              errors={errors.customFields as any}
            />
            <div className="flex justify-end pt-4 gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
