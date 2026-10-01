import { db, walletTransactions } from "@starter/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { type Context } from "hono";
import { auth } from "../../infra/lib/auth";

export async function getWalletBalance(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const organizationId = session?.session?.activeOrganizationId;
  const userId = session?.user?.id;

  if (!organizationId || !userId) {
    return c.json({ error: "Missing active session context" }, 401);
  }

  // Calculate balance: SUM(credits) - SUM(debits)
  const [result] = await db
    .select({
      balance: sql<number>`SUM(CASE WHEN ${walletTransactions.type} = 'credit' THEN ${walletTransactions.amount} ELSE -${walletTransactions.amount} END)`,
    })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.organizationId, organizationId),
        eq(walletTransactions.memberId, userId),
      ),
    );

  const balance = result?.balance || 0;

  return c.json({ balance });
}

export async function listTransactions(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const organizationId = session?.session?.activeOrganizationId;
  const userId = session?.user?.id;

  if (!organizationId || !userId) {
    return c.json({ error: "Missing active session context" }, 401);
  }

  // Could optionally accept a user ID if an admin is checking someone else's wallet
  const targetUserId = c.req.query("userId") || userId;

  const transactions = await db
    .select()
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.organizationId, organizationId),
        eq(walletTransactions.memberId, targetUserId),
      ),
    )
    .orderBy(desc(walletTransactions.createdAt));

  return c.json(transactions);
}

export async function addManualAdjustment(c: Context) {
  try {
    const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

    const organizationId = sessionData.session.activeOrganizationId;
    if (!organizationId) return c.json({ error: "No active workspace selected" }, 400);

    // Verify Admin rights here
    // In a real scenario, use PBAC checks, but for now we assume caller is an admin
    // if we put a check for role etc.

    const memberId = c.req.param("memberId");
    if (!memberId) return c.json({ error: "Missing memberId" }, 400);

    const body = await c.req.json();
    const { amount, type, description } = body;

    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      return c.json({ error: "Invalid positive amount required" }, 400);
    }
    if (type !== "credit" && type !== "debit") {
      return c.json({ error: "Type must be credit or debit" }, 400);
    }

    const { v4: uuidv4 } = await import("uuid");
    const txId = uuidv4();

    await db.insert(walletTransactions).values({
      id: txId,
      organizationId,
      memberId,
      type,
      amount: amount.toString(),
      referenceType: "manual",
      description: description || `Manual adjustment by ${sessionData.user.name}`,
    });

    return c.json({ success: true, message: "Adjustment recorded" }, 200);
  } catch (error) {
    console.error("[addManualAdjustment] Failed:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
}
