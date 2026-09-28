import { randomUUID } from "node:crypto";
import { relations } from "drizzle-orm";
import { boolean, index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------
// Enums
// ---------------------------------------------------------------

export const systemRoleEnum = pgEnum("system_role", ["user", "admin", "super_admin"]);

export const accountStatusEnum = pgEnum("account_status", ["active", "suspended", "banned"]);

// ---------------------------------------------------------------
// Users
// ---------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),

  role: systemRoleEnum("role").notNull().default("user"),

  status: accountStatusEnum("status").notNull().default("active"),
  requiresPasswordReset: boolean("requires_password_reset").notNull().default(false),

  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { mode: "date" }),

  // Custom fields
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  deletedAt: timestamp("deleted_at", { mode: "date" }),
  lastLoginAt: timestamp("last_login_at", { mode: "date" }),
  theme: text("theme").default("system"),

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Queried on every auth middleware check and session listing
    index("sessions_user_id_idx").on(table.userId),
    // Queried on session expiry cleanup jobs
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

// ---------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: "date" }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: "date" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Queried on listAccounts(), OAuth provider lookups, and credential checks
    index("accounts_user_id_idx").on(table.userId),
    // Queried when resolving OAuth sessions by provider
    index("accounts_provider_id_account_id_idx").on(table.providerId, table.accountId),
  ],
);

// ---------------------------------------------------------------
// Verifications
// ---------------------------------------------------------------

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Queried on every email verification, magic link, and OTP lookup
    index("verifications_identifier_idx").on(table.identifier),
  ],
);

// ---------------------------------------------------------------
// Two Factor (Required by Better Auth Plugin)
// ---------------------------------------------------------------

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").notNull().default(false),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [
    // Queried on every 2FA verification attempt
    index("two_factor_user_id_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------
// Passkeys (Enterprise Passwordless Flow)
// ---------------------------------------------------------------

export const passkeys = pgTable(
  "passkeys",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
  },
  (table) => [
    // Queried on passkey authentication lookup
    index("passkeys_user_id_idx").on(table.userId),
    // Queried during WebAuthn credential assertion
    index("passkeys_credential_id_idx").on(table.credentialID),
  ],
);

// ---------------------------------------------------------------
// Organizations (Multi-Tenancy)
// ---------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  metadata: text("metadata"),
});

export const members = pgTable("members", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

export const invitations = pgTable("invitations", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull(),
  expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
  inviterId: text("inviterId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

// ---------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;

export type TwoFactor = typeof twoFactor.$inferSelect;
export type NewTwoFactor = typeof twoFactor.$inferInsert;

export type Passkey = typeof passkeys.$inferSelect;
export type NewPasskey = typeof passkeys.$inferInsert;

export type SystemRole = (typeof systemRoleEnum.enumValues)[number];

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type Member = typeof members.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;

// ---------------------------------------------------------------
// Audit Logs (SOC2 Compliance)
// ---------------------------------------------------------------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    adminId: text("admin_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetUserId: text("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    ipAddress: text("ip_address").notNull().default("unknown"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_admin_id_idx").on(table.adminId),
    index("audit_logs_target_user_id_idx").on(table.targetUserId),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type AccountStatus = (typeof accountStatusEnum.enumValues)[number];

export const usersRelations = relations(users, ({ many }) => ({
  members: many(members),
}));

export const membersRelations = relations(members, ({ one }) => ({
  user: one(users, {
    fields: [members.userId],
    references: [users.id],
  }),
  workspace: one(organizations, {
    fields: [members.organizationId],
    references: [organizations.id],
  }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(members),
}));
