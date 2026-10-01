"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, Fingerprint, Loader2, MonitorSmartphone, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { SecurityUserContext } from "./security-action-modal";

interface UserDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: SecurityUserContext | null;
}

interface Session {
  id: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  expiresAt: string;
}

interface IdentityData {
  id: string;
  name: string;
  email: string;
  lastLoginAt: string | null;
  accounts: Array<{
    id: string;
    providerId: string;
    createdAt: string;
  }>;
}

export function UserDetailsModal({ isOpen, onClose, user }: UserDetailsModalProps) {
  const queryClient = useQueryClient();
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data: sessions, isLoading } = useQuery<{ data: Session[] }>({
    queryKey: ["admin-user-sessions", user?.id],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/admin/users/${user?.id}/sessions`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch sessions");
      return res.json();
    },
    enabled: !!user?.id && isOpen,
  });

  const { data: identity, isLoading: isIdentityLoading } = useQuery<{ data: IdentityData }>({
    queryKey: ["admin-user-identity", user?.id],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/api/admin/users/${user?.id}/identity`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch identity");
      return res.json();
    },
    enabled: !!user?.id && isOpen,
  });

  const revokeMutation = useMutation({
    mutationFn: async ({ sessionId, auditReason }: { sessionId: string; auditReason: string }) => {
      if (!user) throw new Error("Missing user context");

      const res = await fetch(`${apiUrl}/api/admin/sessions/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, targetUserId: user.id, reason: auditReason }),
        credentials: "include",
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to revoke session");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-user-sessions", user?.id] });
      toast.success("Session revoked successfully");
      setRevokingSessionId(null);
      setReason("");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleRevoke = (sessionId: string) => {
    if (reason.length < 10) {
      toast.error("Audit reason must be at least 10 characters.");
      return;
    }
    revokeMutation.mutate({ sessionId, auditReason: reason });
  };

  if (!user) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setRevokingSessionId(null);
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            User Details
            <Badge variant="outline" className="text-xs uppercase">
              {user.role}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {user.email} (ID: {user.id})
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* Identity & OAuth Activity */}
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
              <Fingerprint className="h-5 w-5 text-muted-foreground" />
              Identity & Activity
            </h3>

            <div className="mt-4 space-y-3">
              {isIdentityLoading ? (
                <div className="flex justify-center p-4 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : identity?.data ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 border rounded-md bg-card/30 space-y-1">
                    <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                      Last Login
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {identity.data.lastLoginAt
                        ? format(new Date(identity.data.lastLoginAt), "PPP p")
                        : "Never"}
                    </div>
                  </div>

                  <div className="p-4 border rounded-md bg-card/30 space-y-1">
                    <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                      Connected Providers
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {identity.data.accounts.length === 0 ? (
                        <span className="text-sm text-muted-foreground">None (Local Password)</span>
                      ) : (
                        identity.data.accounts.map((acc) => (
                          <Badge key={acc.id} variant="secondary" className="capitalize">
                            {acc.providerId}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 border rounded-md text-center text-sm text-muted-foreground bg-muted/20">
                  Could not load identity data.
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2 border-b pb-2">
              <MonitorSmartphone className="h-5 w-5 text-muted-foreground" />
              Active Sessions
            </h3>

            <div className="mt-4 space-y-3">
              {isLoading ? (
                <div className="flex justify-center p-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : !sessions?.data?.length ? (
                <div className="p-4 border rounded-md text-center text-sm text-muted-foreground bg-muted/20">
                  No active sessions found.
                </div>
              ) : (
                sessions.data.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 border rounded-md bg-card/30 flex flex-col gap-3"
                  >
                    <div className="flex justify-between items-start gap-4 flex-wrap sm:flex-nowrap">
                      <div className="space-y-1 text-sm overflow-hidden flex-1">
                        <div
                          className="font-medium truncate"
                          title={session.userAgent || "Unknown Device"}
                        >
                          {session.userAgent || "Unknown Device"}
                        </div>
                        <div className="text-muted-foreground flex gap-4 text-xs">
                          <span>IP: {session.ipAddress || "Unknown"}</span>
                          <span>
                            Created: {format(new Date(session.createdAt), "MMM d, HH:mm")}
                          </span>
                        </div>
                      </div>

                      {revokingSessionId !== session.id ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="shrink-0"
                          onClick={() => setRevokingSessionId(session.id)}
                        >
                          Revoke
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRevokingSessionId(null)}
                          className="shrink-0"
                        >
                          <X className="h-4 w-4 mr-1" /> Cancel
                        </Button>
                      )}
                    </div>

                    {revokingSessionId === session.id && (
                      <div className="bg-destructive/10 p-3 rounded-md border border-destructive/20 mt-2 space-y-3">
                        <div className="flex gap-2">
                          <ShieldAlert className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                          <p className="text-xs text-destructive/90">
                            You are about to forcefully terminate this session. Please provide a
                            SOC2 audit reason.
                          </p>
                        </div>
                        <div className="flex gap-2 items-end">
                          <div className="flex-1 space-y-1.5">
                            <Label htmlFor={`reason-${session.id}`} className="text-xs">
                              Audit Reason
                            </Label>
                            <Input
                              id={`reason-${session.id}`}
                              placeholder="e.g., Compromised device reported by user"
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              className="h-8 text-sm bg-background"
                              autoFocus
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRevoke(session.id)}
                            disabled={revokeMutation.isPending || reason.length < 10}
                            className="h-8 shrink-0"
                          >
                            {revokeMutation.isPending && (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            )}
                            Confirm Revoke
                          </Button>
                        </div>
                      </div>
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
