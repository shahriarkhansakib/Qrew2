import * as schema from "@starter/db";
import { db, members, orgMemberRoles, orgRoles, users } from "@starter/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { Context } from "hono";
import { v4 as uuidv4 } from "uuid";
import { auth } from "../../infra/lib/auth";

export class WorkspacesController {
  static async createWorkspace(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const body = await c.req.json();
      const { name } = body;
      if (!name) return c.json({ error: "Organization name is required" }, 400);

      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");
      const orgId = uuidv4();
      const memberId = uuidv4();
      const userId = sessionData.user.id;

      // Check quota: max 5 owned workspaces per standard user account
      if (sessionData.user.role === "user") {
        const [{ ownedCount }] = await db
          .select({ ownedCount: sql<number>`count(*)::int` })
          .from(schema.members)
          .where(and(eq(schema.members.userId, userId), eq(schema.members.role, "owner")));

        if (ownedCount >= 5) {
          return c.json(
            { error: "Workspace limit reached (maximum 5 owned workspaces per account)." },
            403,
          );
        }
      }

      await db.transaction(async (tx) => {
        // 1. Create Organization
        await tx.insert(schema.organizations).values({
          id: orgId,
          name,
          slug,
          createdAt: new Date(),
        });

        // 2. Create Member (Owner)
        await tx.insert(schema.members).values({
          id: memberId,
          organizationId: orgId,
          userId: userId,
          role: "owner",
          createdAt: new Date(),
        });

        // 3. Seed Defaults
        await schema.seedOrganizationDefaults(tx, orgId, userId);
      });

      return c.json({ success: true, organizationId: orgId }, 201);
    } catch (error) {
      console.error("[WorkspacesController.createWorkspace] Failed:", error);
      return c.json({ error: "Failed to create workspace" }, 500);
    }
  }

  static async inviteStaff(c: Context) {
    try {
      // 1. Authenticate and get active context
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const activeOrgId = sessionData.session.activeOrganizationId;
      if (!activeOrgId) return c.json({ error: "No active workspace selected" }, 400);

      // 2. Parse payload
      const body = await c.req.json();
      const { email, roleId } = body;

      if (!email || !roleId) {
        return c.json({ error: "Missing required fields (email, roleId)" }, 400);
      }

      // 3. Verify the requested custom role actually exists in this organization
      const targetRole = await db.query.orgRoles.findFirst({
        where: and(eq(orgRoles.id, roleId), eq(orgRoles.organizationId, activeOrgId)),
      });
      if (!targetRole) {
        return c.json({ error: "Invalid role selected." }, 400);
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Check if user with this email is already a member of the workspace
      const existingUserByEmail = await db.query.users.findFirst({
        where: eq(users.email, normalizedEmail),
      });

      if (existingUserByEmail) {
        const existingMember = await db.query.members.findFirst({
          where: and(
            eq(members.userId, existingUserByEmail.id),
            eq(members.organizationId, activeOrgId),
          ),
        });
        if (existingMember) {
          return c.json({ error: "User is already a member of this workspace" }, 400);
        }
      }

      // Remove any existing pending invitation for this email in the organization
      await db
        .delete(schema.invitations)
        .where(
          and(
            eq(schema.invitations.organizationId, activeOrgId),
            eq(schema.invitations.email, normalizedEmail),
            eq(schema.invitations.status, "pending"),
          ),
        );

      // Get org details for the email
      const org = await db.query.organizations.findFirst({
        where: eq(schema.organizations.id, activeOrgId),
      });

      // 4. Create the invitation in the DB
      const inviteId = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      await db.insert(schema.invitations).values({
        id: inviteId,
        organizationId: activeOrgId,
        email: normalizedEmail,
        role: roleId, // Store custom PBAC roleId here
        status: "pending",
        expiresAt,
        inviterId: sessionData.user.id,
      });

      // 5. Send the email
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, normalizedEmail),
      });

      const { sendSmartEmail } = await import("../../infra/lib/auth");
      const frontendUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?id=${inviteId}`;
      const orgName = org?.name || "a workspace";

      const emailContent = existingUser
        ? `<div style="font-family: sans-serif; padding: 20px;">
             <h2>Workspace Invitation</h2>
             <p><strong>${sessionData.user.name}</strong> has invited you to join the office <strong>${orgName}</strong>.</p>
             <a href="${frontendUrl}" style="display: inline-block; padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 5px;">Accept Invitation</a>
           </div>`
        : `<div style="font-family: sans-serif; padding: 20px;">
             <h2>Workspace Invitation</h2>
             <p><strong>${sessionData.user.name}</strong> has invited you to join the office <strong>${orgName}</strong>.</p>
             <p>Create an account to accept the invitation and join the team.</p>
             <a href="${frontendUrl}" style="display: inline-block; padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 5px;">Create an account and accept invitation</a>
           </div>`;

      await sendSmartEmail(
        normalizedEmail,
        `You have been invited to join ${orgName}`,
        emailContent,
      );

      return c.json(
        {
          success: true,
          message: "Invitation Sent Successfully",
        },
        200,
      );
    } catch (error) {
      console.error("[WorkspacesController.inviteStaff] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async listInvitations(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const activeOrgId = sessionData.session.activeOrganizationId;
      if (!activeOrgId) return c.json({ error: "No active workspace selected" }, 400);

      const pendingInvites = await db
        .select({
          id: schema.invitations.id,
          email: schema.invitations.email,
          status: schema.invitations.status,
          expiresAt: schema.invitations.expiresAt,
          roleName: orgRoles.name,
        })
        .from(schema.invitations)
        .where(
          and(
            eq(schema.invitations.organizationId, activeOrgId),
            eq(schema.invitations.status, "pending"),
          ),
        )
        .leftJoin(orgRoles, eq(orgRoles.id, schema.invitations.role));

      return c.json({ invitations: pendingInvites }, 200);
    } catch (error) {
      console.error("[WorkspacesController.listInvitations] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async getInvitation(c: Context) {
    try {
      const inviteId = c.req.param("id");
      if (!inviteId) return c.json({ error: "Missing invite id" }, 400);

      const invite = await db.query.invitations.findFirst({
        where: and(eq(schema.invitations.id, inviteId), eq(schema.invitations.status, "pending")),
      });

      if (!invite || invite.expiresAt < new Date()) {
        return c.json({ error: "Invalid or expired invitation" }, 404);
      }

      const org = await db.query.organizations.findFirst({
        where: eq(schema.organizations.id, invite.organizationId),
      });

      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, invite.email),
      });

      return c.json(
        {
          email: invite.email,
          orgName: org?.name || "a workspace",
          userExists: !!existingUser,
        },
        200,
      );
    } catch (error) {
      console.error("[WorkspacesController.getInvitation] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async cancelInvitation(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const activeOrgId = sessionData.session.activeOrganizationId;
      if (!activeOrgId) return c.json({ error: "No active workspace selected" }, 400);

      const inviteId = c.req.param("id");
      if (!inviteId) return c.json({ error: "Missing invite id" }, 400);

      await db
        .delete(schema.invitations)
        .where(
          and(
            eq(schema.invitations.id, inviteId),
            eq(schema.invitations.organizationId, activeOrgId),
          ),
        );

      return c.json({ success: true }, 200);
    } catch (error) {
      console.error("[WorkspacesController.cancelInvitation] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async acceptInvitation(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const { id: inviteId } = await c.req.json();
      if (!inviteId) return c.json({ error: "Missing invitation id" }, 400);

      const invite = await db.query.invitations.findFirst({
        where: and(eq(schema.invitations.id, inviteId), eq(schema.invitations.status, "pending")),
      });

      if (!invite) return c.json({ error: "Invalid or expired invitation" }, 404);

      if (invite.expiresAt < new Date()) {
        return c.json({ error: "Invitation has expired" }, 400);
      }

      // Enforce email verification before accepting invitation
      if (!sessionData.user.emailVerified) {
        return c.json(
          { error: "Email verification required to accept workspace invitations" },
          403,
        );
      }

      // Case-insensitive email comparison
      if (invite.email.toLowerCase() !== sessionData.user.email.toLowerCase()) {
        return c.json({ error: "This invitation is for a different email address" }, 403);
      }

      // Atomic transaction for invitation acceptance
      return await db.transaction(async (tx) => {
        // Check if user is already a member
        const alreadyMember = await tx.query.members.findFirst({
          where: and(
            eq(members.userId, sessionData.user.id),
            eq(members.organizationId, invite.organizationId),
          ),
        });

        if (alreadyMember) {
          await tx.delete(schema.invitations).where(eq(schema.invitations.id, inviteId));
          return c.json({ success: true, message: "Already a member" }, 200);
        }

        // Bind to organization (Better Auth base role)
        const newMemberId = uuidv4();
        await tx.insert(members).values({
          id: newMemberId,
          organizationId: invite.organizationId,
          userId: sessionData.user.id,
          role: "member",
        });

        // Bind to Custom PBAC role if provided
        if (invite.role) {
          await tx.insert(orgMemberRoles).values({
            id: uuidv4(),
            organizationId: invite.organizationId,
            memberId: newMemberId,
            roleId: invite.role, // role column holds our PBAC roleId
            assignedBy: invite.inviterId,
          });
        }

        // Delete invitation after successful acceptance
        await tx.delete(schema.invitations).where(eq(schema.invitations.id, inviteId));

        return c.json({ success: true, organizationId: invite.organizationId }, 200);
      });
    } catch (error) {
      console.error("[WorkspacesController.acceptInvitation] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async listStaff(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const activeOrgId = sessionData.session.activeOrganizationId;
      if (!activeOrgId) return c.json({ error: "No active workspace selected" }, 400);

      c.set("organizationId", activeOrgId);

      const currentMember = await db.query.members.findFirst({
        where: and(
          eq(members.userId, sessionData.user.id),
          eq(members.organizationId, activeOrgId),
        ),
      });
      const isOwner = sessionData.user.role === "super_admin" || currentMember?.role === "owner";
      c.set("isOwner", isOwner);

      if (!isOwner) {
        const { PermissionService } = await import("../../features/permissions/permission.service");
        const userPermissions = await PermissionService.resolvePermissions(
          sessionData.user.id,
          activeOrgId,
        );
        c.set("userPermissions", userPermissions);
      }

      const staffList = await db
        .select({
          memberId: members.id,
          userId: users.id,
          name: users.name,
          email: users.email,
          createdAt: members.createdAt,
          memberBaseRole: members.role, // Fetch Better Auth base role to detect 'owner'
          roleName: orgRoles.name,
          roleId: orgRoles.id,
          isSystem: orgRoles.isSystem,
        })
        .from(members)
        .where(eq(members.organizationId, activeOrgId))
        .innerJoin(users, eq(users.id, members.userId))
        .leftJoin(orgMemberRoles, eq(orgMemberRoles.memberId, members.id))
        .leftJoin(orgRoles, eq(orgRoles.id, orgMemberRoles.roleId));

      const balances = await db
        .select({
          userId: schema.walletTransactions.memberId,
          balance: sql<number>`SUM(CASE WHEN ${schema.walletTransactions.type} = 'credit' THEN ${schema.walletTransactions.amount} ELSE -${schema.walletTransactions.amount} END)`,
        })
        .from(schema.walletTransactions)
        .where(eq(schema.walletTransactions.organizationId, activeOrgId))
        .groupBy(schema.walletTransactions.memberId);

      const balanceMap = new Map(balances.map((b) => [b.userId, Number(b.balance) || 0]));

      const staffMap = new Map();
      for (const s of staffList) {
        if (!staffMap.has(s.memberId)) {
          staffMap.set(s.memberId, s);
        } else {
          const existing = staffMap.get(s.memberId);
          // Prefer specific roles over empty or generic ones
          if (!existing.roleName && s.roleName) {
            staffMap.set(s.memberId, s);
          }
        }
      }

      const uniqueStaffList = Array.from(staffMap.values());

      const staff = uniqueStaffList.map((s) => {
        if (s.memberBaseRole === "owner") {
          return {
            ...s,
            roleName: "Owner",
            isSystem: true,
            walletBalance: balanceMap.get(s.userId) || 0,
          };
        }
        return {
          ...s,
          roleName: s.roleName || "Member",
          walletBalance: balanceMap.get(s.userId) || 0,
        };
      });

      const { scrubEntityData, getScrubberConfig } = await import("../../infra/lib/data-scrubber");
      const scrubberConfig = await getScrubberConfig(c, "staff");
      const scrubbedStaff = staff.map((s) => scrubEntityData(s, scrubberConfig, "staff"));

      return c.json({ staff: scrubbedStaff }, 200);
    } catch (error) {
      console.error("[WorkspacesController.listStaff] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async updateStaffRole(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const activeOrgId = sessionData.session.activeOrganizationId;
      if (!activeOrgId) return c.json({ error: "No active workspace selected" }, 400);

      const memberId = c.req.param("memberId");
      const { roleId } = await c.req.json();

      if (!memberId || !roleId) {
        return c.json({ error: "Missing memberId or roleId" }, 400);
      }

      const targetRole = await db.query.orgRoles.findFirst({
        where: and(eq(orgRoles.id, roleId), eq(orgRoles.organizationId, activeOrgId)),
      });

      if (!targetRole) {
        return c.json({ error: "Invalid role selected." }, 400);
      }

      const targetMember = await db.query.members.findFirst({
        where: and(eq(members.id, memberId), eq(members.organizationId, activeOrgId)),
      });

      if (!targetMember) {
        return c.json({ error: "Member not found." }, 404);
      }

      await db.delete(orgMemberRoles).where(eq(orgMemberRoles.memberId, memberId));

      await db.insert(orgMemberRoles).values({
        id: uuidv4(),
        organizationId: activeOrgId,
        memberId: memberId,
        roleId: roleId,
        assignedBy: sessionData.user.id,
      });

      return c.json({ success: true }, 200);
    } catch (error) {
      console.error("[WorkspacesController.updateStaffRole] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async revokeStaff(c: Context) {
    const orgId = c.get("organizationId");
    const memberId = c.req.param("memberId");

    if (!orgId || !memberId) {
      return c.json({ error: "Missing organizationId or memberId" }, 400);
    }

    const { members } = await import("@starter/db");

    const [deleted] = await db
      .delete(members)
      .where(and(eq(members.id, memberId), eq(members.organizationId, orgId)))
      .returning();

    if (!deleted) return c.json({ error: "Member not found" }, 404);

    return c.json({ success: true });
  }

  // --- Organization Settings ---
  static async getSettings(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const orgId = sessionData.session.activeOrganizationId;
      if (!orgId) return c.json({ error: "No active workspace selected" }, 400);

      const { organizations } = await import("@starter/db");

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
      });

      if (!org) return c.json({ error: "Organization not found" }, 404);

      let metadata = {};
      try {
        if (org.metadata) {
          metadata = JSON.parse(org.metadata);
        }
      } catch (_e) {
        // Ignore parse errors
      }

      return c.json({ metadata });
    } catch (error) {
      console.error("[WorkspacesController.getSettings] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async updateSettings(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const orgId = sessionData.session.activeOrganizationId;
      if (!orgId) return c.json({ error: "No active workspace selected" }, 400);

      const body = await c.req.json();
      const metadata = body.metadata;

      const { organizations } = await import("@starter/db");

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
      });

      if (!org) return c.json({ error: "Organization not found" }, 404);

      let currentMetadata = {};
      try {
        if (org.metadata) {
          currentMetadata = JSON.parse(org.metadata);
        }
      } catch (_e) {
        // Ignore parse errors
      }

      const newMetadata = { ...currentMetadata, ...metadata };

      await db
        .update(organizations)
        .set({ metadata: JSON.stringify(newMetadata) })
        .where(eq(organizations.id, orgId));

      return c.json({ success: true, metadata: newMetadata });
    } catch (error) {
      console.error("[WorkspacesController.updateSettings] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async getUserPreferences(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const orgId = sessionData.session.activeOrganizationId;
      if (!orgId) return c.json({ error: "No active workspace selected" }, 400);

      const userId = sessionData.user.id;
      const { organizations } = await import("@starter/db");

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
      });
      if (!org) return c.json({ error: "Organization not found" }, 404);

      let metadata: any = {};
      try {
        if (org.metadata) metadata = JSON.parse(org.metadata);
      } catch (_e) {}

      const userPrefs = metadata[`userPrefs_${userId}`] || {};
      return c.json({ preferences: userPrefs });
    } catch (error) {
      console.error("[WorkspacesController.getUserPreferences] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async updateUserPreferences(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const orgId = sessionData.session.activeOrganizationId;
      if (!orgId) return c.json({ error: "No active workspace selected" }, 400);

      const userId = sessionData.user.id;
      const body = await c.req.json();
      const preferences = body.preferences || {};

      const { organizations } = await import("@starter/db");

      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, orgId),
      });
      if (!org) return c.json({ error: "Organization not found" }, 404);

      let currentMetadata: any = {};
      try {
        if (org.metadata) currentMetadata = JSON.parse(org.metadata);
      } catch (_e) {}

      const key = `userPrefs_${userId}`;
      const currentUserPrefs = currentMetadata[key] || {};
      const updatedUserPrefs = { ...currentUserPrefs, ...preferences };

      const newMetadata = { ...currentMetadata, [key]: updatedUserPrefs };

      await db
        .update(organizations)
        .set({ metadata: JSON.stringify(newMetadata) })
        .where(eq(organizations.id, orgId));

      return c.json({ success: true, preferences: updatedUserPrefs });
    } catch (error) {
      console.error("[WorkspacesController.updateUserPreferences] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }

  static async getDashboardStats(c: Context) {
    try {
      const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!sessionData?.session) return c.json({ error: "Unauthorized" }, 401);

      const activeOrgId = sessionData.session.activeOrganizationId;
      if (!activeOrgId) return c.json({ error: "No active workspace selected" }, 400);

      // 1. Total counts
      const [totalClientsRes] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.clients)
        .where(eq(schema.clients.organizationId, activeOrgId));

      const [totalProjectsRes] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.organizationId, activeOrgId),
            eq(schema.projects.status, "active"),
          ),
        );

      const [totalExpensesRes] = await db
        .select({ sum: sql<number>`sum(${schema.expenses.amount})` })
        .from(schema.expenses)
        .where(eq(schema.expenses.organizationId, activeOrgId));

      const [pendingInvoicesRes] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.organizationId, activeOrgId),
            sql`${schema.invoices.status} IN ('issued', 'frozen', 'disputed')`,
          ),
        );

      const [draftInvoicesRes] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.invoices)
        .where(
          and(eq(schema.invoices.organizationId, activeOrgId), eq(schema.invoices.status, "draft")),
        );

      const [totalRevenueRes] = await db
        .select({ sum: sql<number>`sum(${schema.invoices.grandTotalAmount})` })
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.organizationId, activeOrgId),
            sql`${schema.invoices.status} IN ('paid', 'issued')`,
          ),
        );

      const [totalStaffRes] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.members)
        .where(eq(schema.members.organizationId, activeOrgId));

      // 2. Recent entities
      const recentFiles = await db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.organizationId, activeOrgId))
        .orderBy(desc(schema.projects.createdAt))
        .limit(5);

      const recentInvoices = await db
        .select({
          id: schema.invoices.id,
          documentNumber: schema.invoices.documentNumber,
          grandTotalAmount: schema.invoices.grandTotalAmount,
          status: schema.invoices.status,
          issuedToClientName: schema.invoices.issuedToClientName,
          currency: schema.invoices.currency,
          createdAt: schema.invoices.createdAt,
        })
        .from(schema.invoices)
        .where(eq(schema.invoices.organizationId, activeOrgId))
        .orderBy(desc(schema.invoices.createdAt))
        .limit(5);

      // 3. Dynamic 6-Month Time Series Aggregation
      const monthsList: { monthKey: string; name: string; revenue: number; expenses: number }[] =
        [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const name = d.toLocaleString("en-US", { month: "short" });
        monthsList.push({ monthKey, name, revenue: 0, expenses: 0 });
      }

      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

      const dbInvoices = await db
        .select({
          grandTotalAmount: schema.invoices.grandTotalAmount,
          createdAt: schema.invoices.createdAt,
          status: schema.invoices.status,
        })
        .from(schema.invoices)
        .where(
          and(
            eq(schema.invoices.organizationId, activeOrgId),
            sql`${schema.invoices.status} != 'void'`,
            sql`${schema.invoices.createdAt} >= ${sixMonthsAgo.toISOString()}`,
          ),
        );

      const dbExpenses = await db
        .select({
          amount: schema.expenses.amount,
          createdAt: schema.expenses.createdAt,
        })
        .from(schema.expenses)
        .where(
          and(
            eq(schema.expenses.organizationId, activeOrgId),
            sql`${schema.expenses.createdAt} >= ${sixMonthsAgo.toISOString()}`,
          ),
        );

      const monthMap = new Map(monthsList.map((m) => [m.monthKey, m]));

      for (const inv of dbInvoices) {
        if (inv.createdAt) {
          const invDate = new Date(inv.createdAt);
          const key = `${invDate.getFullYear()}-${String(invDate.getMonth() + 1).padStart(2, "0")}`;
          const target = monthMap.get(key);
          if (target) {
            target.revenue += Number(inv.grandTotalAmount) || 0;
          }
        }
      }

      for (const exp of dbExpenses) {
        if (exp.createdAt) {
          const expDate = new Date(exp.createdAt);
          const key = `${expDate.getFullYear()}-${String(expDate.getMonth() + 1).padStart(2, "0")}`;
          const target = monthMap.get(key);
          if (target) {
            target.expenses += Number(exp.amount) || 0;
          }
        }
      }

      const monthlyData = monthsList.map(({ name, revenue, expenses }) => ({
        name,
        revenue: Math.round(revenue * 100) / 100,
        expenses: Math.round(expenses * 100) / 100,
      }));

      // Calculate MoM growth for revenue and expenses
      const currentMonthIndex = monthsList.length - 1;
      const prevMonthIndex = monthsList.length - 2;

      const currentRev = monthsList[currentMonthIndex]?.revenue || 0;
      const prevRev = monthsList[prevMonthIndex]?.revenue || 0;
      const revenueGrowth =
        prevRev > 0
          ? Math.round(((currentRev - prevRev) / prevRev) * 100 * 10) / 10
          : currentRev > 0
            ? 100
            : 0;

      const currentExp = monthsList[currentMonthIndex]?.expenses || 0;
      const prevExp = monthsList[prevMonthIndex]?.expenses || 0;
      const expenseGrowth =
        prevExp > 0
          ? Math.round(((currentExp - prevExp) / prevExp) * 100 * 10) / 10
          : currentExp > 0
            ? 100
            : 0;

      return c.json(
        {
          totalClients: Number(totalClientsRes?.count) || 0,
          activeFiles: Number(totalProjectsRes?.count) || 0,
          totalExpenses: Number(totalExpensesRes?.sum) || 0,
          totalRevenue: Number(totalRevenueRes?.sum) || 0,
          pendingInvoices: Number(pendingInvoicesRes?.count) || 0,
          draftInvoices: Number(draftInvoicesRes?.count) || 0,
          totalStaff: Number(totalStaffRes?.count) || 0,
          revenueGrowth,
          expenseGrowth,
          recentFiles,
          recentInvoices,
          monthlyData,
        },
        200,
      );
    } catch (error) {
      console.error("[WorkspacesController.getDashboardStats] Failed:", error);
      return c.json({ error: "Internal Server Error" }, 500);
    }
  }
}
