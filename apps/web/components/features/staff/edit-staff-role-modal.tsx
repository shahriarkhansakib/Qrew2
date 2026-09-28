"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EditStaffRoleModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  memberName: string;
  currentRoleId?: string;
  isSystemRole?: boolean;
}

export function EditStaffRoleModal({
  isOpen,
  onOpenChange,
  memberId,
  memberName,
  currentRoleId,
  isSystemRole,
}: EditStaffRoleModalProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [roleId, setRoleId] = useState(currentRoleId || "");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";

  // Fetch available roles for the dropdown
  const { data, isLoading: isLoadingRoles } = useQuery({
    queryKey: ["org-roles"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/roles`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch roles");
      return res.json();
    },
    enabled: isOpen,
  });

  const roles = data?.roles || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleId) return;

    setIsLoading(true);

    try {
      const res = await fetch(`${apiUrl}/api/workspaces/staff/${memberId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ roleId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to update role.");
      }

      toast.success("Role updated successfully.");
      onOpenChange(false);
      router.refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-background/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>Change Office Role</DialogTitle>
          <DialogDescription>Update the access level for {memberName}.</DialogDescription>
        </DialogHeader>

        {isSystemRole ? (
          <div className="py-4 text-center">
            <p className="text-sm text-accent-foreground bg-accent/10 p-3 rounded-md">
              This user has a protected system role and cannot be modified.
            </p>
            <div className="pt-4 flex justify-end">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="role">Select New Role</Label>
              <Select
                value={roleId}
                onValueChange={setRoleId}
                disabled={isLoading || isLoadingRoles}
                required
              >
                <SelectTrigger id="role">
                  <SelectValue
                    placeholder={isLoadingRoles ? "Loading roles..." : "Select a role"}
                  />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {roles.length > 0 ? (
                    roles.map((role: { id: string; name: string }) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="empty" disabled>
                      No roles available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="pt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !roleId || roleId === currentRoleId}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
