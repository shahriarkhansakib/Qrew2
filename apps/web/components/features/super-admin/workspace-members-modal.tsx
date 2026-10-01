"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiUrl } from "@/lib/constants";

interface WorkspaceMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: { id: string; name: string } | null;
}

interface Member {
  id: string;
  role: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export function WorkspaceMembersModal({ isOpen, onClose, workspace }: WorkspaceMembersModalProps) {
  const queryClient = useQueryClient();
  const [newUserId, setNewUserId] = useState("");
  const [newUserRole, setNewUserRole] = useState("member");
  const [actionReason, setActionReason] = useState("");
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ data: Member[] }>({
    queryKey: ["super-admin-workspace-members", workspace?.id],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/super-admin/workspaces/${workspace?.id}/members`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
    enabled: !!workspace?.id && isOpen,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiUrl}/api/super-admin/workspaces/${workspace?.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: newUserId, role: newUserRole, reason: actionReason }),
        credentials: "include",
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to add member");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-workspace-members", workspace?.id] });
      toast.success("Member added/updated successfully");
      setNewUserId("");
      setActionReason("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch(
        `${apiUrl}/api/super-admin/workspaces/${workspace?.id}/members/${memberId}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: actionReason }),
          credentials: "include",
        },
      );
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to remove member");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-admin-workspace-members", workspace?.id] });
      toast.success("Member removed successfully");
      setRemovingMemberId(null);
      setActionReason("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserId.trim()) {
      toast.error("User ID is required");
      return;
    }
    if (actionReason.length < 10) {
      toast.error("Audit reason must be at least 10 characters");
      return;
    }
    addMutation.mutate();
  };

  const handleRemove = (memberId: string) => {
    if (actionReason.length < 10) {
      toast.error("Audit reason must be at least 10 characters");
      return;
    }
    removeMutation.mutate(memberId);
  };

  const resetStateAndClose = () => {
    setNewUserId("");
    setNewUserRole("member");
    setActionReason("");
    setRemovingMemberId(null);
    onClose();
  };

  if (!workspace) return null;
  const members = data?.data || [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && resetStateAndClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Workspace Members: {workspace.name}</DialogTitle>
          <DialogDescription>
            Manage users attached to this organization. Actions are strictly audited.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* Add Member Form */}
          <form onSubmit={handleAdd} className="p-4 border rounded-lg bg-card/30 space-y-4">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add / Update Member
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">User ID</Label>
                <Input
                  placeholder="e.g. usr_12345"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  className="h-8"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Role</Label>
                <Select value={newUserRole} onValueChange={setNewUserRole}>
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-1">
                <Label className="text-xs">SOC2 Audit Reason</Label>
                <Input
                  placeholder="Reason..."
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  className="h-8"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={addMutation.isPending || !newUserId || actionReason.length < 10}
              >
                {addMutation.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Add Member
              </Button>
            </div>
          </form>

          {/* Members List */}
          <div>
            <h4 className="font-medium text-sm mb-3">Current Members</h4>
            <div className="space-y-2">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </div>
              ) : members.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground border rounded-md">
                  No members found in this workspace.
                </div>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-md bg-card/10 gap-4"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="font-medium text-sm">
                        {member.user.name}{" "}
                        <span className="text-muted-foreground font-normal">
                          ({member.user.email})
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        Role:{" "}
                        <span className="uppercase text-[10px] bg-secondary px-1.5 py-0.5 rounded-sm text-secondary-foreground">
                          {member.role}
                        </span>
                        | User ID: <span className="font-mono">{member.user.id}</span>
                      </div>
                    </div>

                    {removingMemberId === member.id ? (
                      <div className="flex items-center gap-2 mt-2 sm:mt-0">
                        <Input
                          placeholder="Audit Reason (Required)"
                          value={actionReason}
                          onChange={(e) => setActionReason(e.target.value)}
                          className="h-8 w-[200px] text-xs"
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8"
                          onClick={() => handleRemove(member.id)}
                          disabled={removeMutation.isPending || actionReason.length < 10}
                        >
                          {removeMutation.isPending && (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          )}
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => {
                            setRemovingMemberId(null);
                            setActionReason("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          setRemovingMemberId(member.id);
                          setActionReason("");
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
