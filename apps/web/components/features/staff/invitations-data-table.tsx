"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Mail, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Can } from "@/components/features/auth/can";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Invitation {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  roleName: string | null;
}

export function InvitationsDataTable() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
  const router = useRouter();

  const [revokingInvite, setRevokingInvite] = useState<Invitation | null>(null);

  const {
    data: invitations = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["invitations"],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/workspaces/staff/invites`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.invitations || [];
    },
  });

  const handleRevoke = async () => {
    if (!revokingInvite) return;

    try {
      const res = await fetch(`${apiUrl}/api/workspaces/staff/invites/${revokingInvite.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel invitation.");
      }

      toast.success(`Invitation to ${revokingInvite.email} has been canceled.`);
      refetch();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setRevokingInvite(null);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground animate-pulse">
        Loading invitations...
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center border rounded-md border-dashed bg-muted/10">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
          <Mail className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium text-foreground">No pending invitations</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          All sent invitations have been accepted, canceled, or expired.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mb-8">
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Assigned Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expires</TableHead>
              <Can I="staff:provision" fallback={<TableHead className="w-[50px]"></TableHead>}>
                <TableHead className="text-right">Actions</TableHead>
              </Can>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((invite: Invitation) => (
              <TableRow key={invite.id}>
                <TableCell className="font-medium">{invite.email}</TableCell>
                <TableCell>
                  <div
                    className={`inline-flex items-center px-2 py-1 rounded-full border text-xs font-medium bg-muted/50`}
                  >
                    {invite.roleName || "Member"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="inline-flex items-center px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground text-[10px] font-semibold uppercase tracking-wider">
                    {invite.status}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(invite.expiresAt), "MMM d, yyyy")}
                </TableCell>

                <Can I="staff:provision" fallback={<TableCell></TableCell>}>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setRevokingInvite(invite)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </Can>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <AlertDialog
          open={!!revokingInvite}
          onOpenChange={(open) => !open && setRevokingInvite(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Invitation?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to cancel the invitation sent to{" "}
                <span className="font-semibold text-foreground">{revokingInvite?.email}</span>? They
                will no longer be able to use the link to join.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRevoke}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Cancel Invitation
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
