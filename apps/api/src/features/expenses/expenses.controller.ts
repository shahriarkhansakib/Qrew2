import { db, expenseCategories, expenses, projects, tokens, users, walletTransactions } from "@starter/db";
import { and, desc, eq } from "drizzle-orm";
import { type Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { auth } from "../../infra/lib/auth";

const createExpenseSchema = z.object({
  amount: z.number().positive(),
  categoryId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  description: z.string().optional(),
});

export async function createExpense(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const organizationId = session?.session?.activeOrganizationId;
  const userId = session?.user?.id;

  if (!organizationId || !userId) {
    return c.json({ error: "Missing active session context" }, 401);
  }

  const body = await c.req.json();
  const parsed = createExpenseSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid data", details: parsed.error.format() }, 400);
  }

  let newExpense;

  // We must do this in a transaction: 1. Create expense, 2. Add debit to wallet
  await db.transaction(async (tx) => {
    const expenseId = uuidv4();

    const [insertedExpense] = await tx
      .insert(expenses)
      .values({
        id: expenseId,
        organizationId,
        memberId: userId,
        projectId: parsed.data.projectId || null,
        categoryId: parsed.data.categoryId,
        amount: parsed.data.amount.toString(),
        description: parsed.data.description,
      })
      .returning();

    newExpense = insertedExpense;

    await tx.insert(walletTransactions).values({
      id: uuidv4(),
      organizationId,
      memberId: userId,
      type: "debit",
      amount: parsed.data.amount.toString(),
      referenceType: "expense",
      referenceId: expenseId,
      description: `Expense logged: ${parsed.data.description || "N/A"}`,
    });
  });

  return c.json(newExpense, 201);
}

export async function listExpenses(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const organizationId = session?.session?.activeOrganizationId;

  if (!organizationId) {
    return c.json({ error: "Missing organization ID" }, 401);
  }

  const projectId = c.req.query("projectId");

  const conditions: any[] = [eq(expenses.organizationId, organizationId)];
  if (projectId) {
    conditions.push(eq(expenses.projectId, projectId));
  }

  const allExpenses = await db
    .select({
      id: expenses.id,
      amount: expenses.amount,
      description: expenses.description,
      createdAt: expenses.createdAt,
      categoryName: tokens.label,
      spentBy: users.name,
      projectName: projects.name,
    })
    .from(expenses)
    .where(and(...conditions))
    .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
    .leftJoin(tokens, eq(expenseCategories.id, tokens.id))
    .leftJoin(users, eq(expenses.memberId, users.id))
    .leftJoin(projects, eq(expenses.projectId, projects.id))
    .orderBy(desc(expenses.createdAt));

  return c.json(allExpenses);
}
