"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus } from "lucide-react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function InviteStaffModal() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";

  // 1. Fetch available roles for the dropdown using TanStack Query
  const { data, isLoading: isLoadingRoles } = useQuery({
    queryKey: ["org-roles"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/roles`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch roles");
      return res.json();
    },
    enabled: isOpen, // Optimization: Only fetch roles when the modal is actually opened
  });

  const roles = data?.roles || [];

  // 2. Handle the Submission (Invitation API)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !roleId) return;

    setIsLoading(true);

    try {
      const res = await fetch(`${apiUrl}/api/workspaces/staff/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, roleId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to send invitation.");
      }

      toast.success(data.message || "Invitation sent successfully.");

      // Reset form and close modal
      setIsOpen(false);
      setEmail("");
      setRoleId("");

      // Instantly update the invitations table in the background without reloading
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      // Optional: switch to the pending tab by pushing to router
      router.push("?tab=pending");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          Invite Staff
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-background/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle>Invite a Team Member</DialogTitle>
          <DialogDescription>
            Send an invitation link to a colleague's email address. They will be able to join the
            workspace immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="jane@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Office Role</Label>
            <Select
              value={roleId}
              onValueChange={setRoleId}
              disabled={isLoading || isLoadingRoles}
              required
            >
              <SelectTrigger id="role">
                <SelectValue placeholder={isLoadingRoles ? "Loading roles..." : "Select a role"} />
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
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !email || !roleId}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...
                </>
              ) : (
                "Send Invitation"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
