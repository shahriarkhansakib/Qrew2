import { DraftEditAuditEntry } from "@starter/db";

/**
 * Appends or coalesces a draft edit audit log entry.
 * - Coalesces consecutive actions by the same user within 2 minutes into a single entry
 * - Retains the latest 50 audit entries to prevent unbounded JSONB growth
 */
export function appendAuditEntry(
  existingHistory: DraftEditAuditEntry[] | undefined | null,
  user: { id: string; name?: string | null; email?: string | null },
  action: string = "Edited draft",
): DraftEditAuditEntry[] {
  const history: DraftEditAuditEntry[] = Array.isArray(existingHistory)
    ? [...existingHistory]
    : [];
  const now = new Date();
  const userName = user.name || user.email || "Unknown User";

  const last = history[history.length - 1];
  if (
    last &&
    last.userId === user.id &&
    now.getTime() - new Date(last.editedAt).getTime() < 2 * 60 * 1000
  ) {
    last.editedAt = now.toISOString();
    last.action = action;
  } else {
    history.push({
      userId: user.id,
      userName,
      userEmail: user.email || undefined,
      editedAt: now.toISOString(),
      action,
    });
  }

  if (history.length > 50) {
    return history.slice(history.length - 50);
  }

  return history;
}
