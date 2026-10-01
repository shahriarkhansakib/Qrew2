"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { DynamicCustomFieldsRenderer } from "@/components/features/custom-fields/dynamic-custom-fields-renderer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiUrl } from "@/lib/constants";

const baseSchema = z.object({
  name: z.string().min(1, "Client name is required"),
  email: z.string().email("Invalid email").optional().nullable().or(z.literal("")),
  customFields: z.record(z.string(), z.any()).default({}),
});

type FormValues = z.infer<typeof baseSchema>;

export function AddClientModal({
  isOpen,
  onClose,
  editClient,
}: {
  isOpen: boolean;
  onClose: () => void;
  editClient?: any;
}) {
  const queryClient = useQueryClient();

  const { data: customFieldDefs } = useQuery({
    queryKey: ["custom-fields", "client"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/custom-fields?entityType=client`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch custom fields");
      return res.json();
    },
    enabled: isOpen,
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(baseSchema as any),
    defaultValues: {
      name: "",
      email: "",
      customFields: {},
    },
  });

  useEffect(() => {
    if (isOpen) {
      if (editClient) {
        reset({
          name: editClient.name,
          email: editClient.email || "",
          customFields: editClient.customFields || {},
        });
      } else {
        reset({
          name: "",
          email: "",
          customFields: {},
        });
      }
    }
  }, [isOpen, editClient, reset]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const url = editClient
        ? `${apiUrl}/api/workspaces/clients/${editClient.id}`
        : `${apiUrl}/api/workspaces/clients`;
      const method = editClient ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${editClient ? "update" : "create"} client`);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(`Client ${editClient ? "updated" : "created"} successfully`);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      onClose();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  function onSubmit(values: FormValues) {
    saveMutation.mutate(values);
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editClient ? "Edit Client" : "Add New Client"}</DialogTitle>
          <DialogDescription>
            {editClient ? "Update client details." : "Enter the client details."} Custom fields
            configured in settings will appear below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Client Name *</Label>
            <Controller
              control={control}
              name="name"
              render={({ field }) => <Input placeholder="Acme Corp" {...field} />}
            />
            {errors.name && (
              <p className="text-[0.8rem] font-medium text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Client Email</Label>
            <Controller
              control={control}
              name="email"
              render={({ field }) => (
                <Input
                  placeholder="client@example.com"
                  type="email"
                  {...field}
                  value={field.value || ""}
                />
              )}
            />
            {errors.email && (
              <p className="text-[0.8rem] font-medium text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="mt-4">
            <DynamicCustomFieldsRenderer
              control={control}
              definitions={customFieldDefs || []}
              basePath="customFields"
              errors={errors.customFields as any}
            />
          </div>

          <div className="flex justify-end pt-4 gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : editClient ? "Save Changes" : "Create Client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
