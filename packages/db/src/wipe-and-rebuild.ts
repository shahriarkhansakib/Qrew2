import "dotenv/config";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import * as schema from "./schema";
import { seedPermissionsDefaults } from "./seed-permissions";
import { seedOrganizationDefaults } from "./org-initializer";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is not set.");
  process.exit(1);
}

async function run() {
  console.log("==================================================================");
  console.log("🧹 STARTING TOTAL DATABASE WIPE & REBUILD FROM SCRATCH");
  console.log("==================================================================");

  const rawSql = postgres(connectionString!, { max: 1 });

  try {
    // 1. Drop public schema cascade to completely wipe all tables, types, sequences, triggers
    console.log("\n💥 Step 1: Dropping public schema (CASCADE)...");
    await rawSql.unsafe(`
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;
    `);
    console.log("✅ Public schema wiped clean.");
  } finally {
    await rawSql.end();
  }

  // 2. Push Drizzle Schema
  console.log("\n📦 Step 2: Running drizzle-kit push to create all tables fresh from TypeScript schema...");
  try {
    const pnpmCmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const pushOutput = execSync(`${pnpmCmd} --filter @starter/db push --force`, {
      encoding: "utf-8",
      cwd: path.resolve(__dirname, "../../.."),
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log(pushOutput);
    console.log("✅ Drizzle schema pushed successfully.");
  } catch (err: any) {
    console.error("❌ drizzle-kit push failed:", err.stdout || err.stderr || err.message);
    process.exit(1);
  }

  // 3. Connect fresh with Drizzle ORM
  const sql = postgres(connectionString!, { max: 5 });
  const db = drizzle(sql, { schema });

  try {
    // 4. Install PostgreSQL entity & token sync triggers
    console.log("\n⚡ Step 3: Installing database token integrity triggers...");
    const triggersPath = path.resolve(__dirname, "../drizzle/0003_token_triggers.sql");
    if (fs.existsSync(triggersPath)) {
      const triggerSql = fs.readFileSync(triggersPath, "utf-8");
      await sql.unsafe(triggerSql);
      console.log("✅ Token sync triggers installed successfully.");
    } else {
      console.warn("⚠️ Trigger file 0003_token_triggers.sql not found, skipping.");
    }

    // 5. Seed PBAC Permissions
    console.log("\n🛡️ Step 4: Seeding canonical PBAC permissions catalog...");
    await seedPermissionsDefaults(db);
    console.log("✅ PBAC permissions seeded.");

    // 6. Seed User & Authentication
    console.log("\n👤 Step 5: Seeding primary user and Google OAuth credential...");
    const userId = "5ZnxSLh29GTIpSFq1y7573ciagTNKC4c";
    const orgId = "c8a38144-88b6-406a-8929-9416eaaa9e5b";

    await db.insert(schema.users).values({
      id: userId,
      name: "Shahriar Khan Sakib",
      email: "sakibshahriarkhan.88@gmail.com",
      emailVerified: true,
      image: "https://lh3.googleusercontent.com/a/ACg8ocKNrW9S6d1Q_Lh0D4oshG6nX4zRSUtVMzWQy6jDDj_4Z0KAoTtQ=s96-c",
      role: "user",
      status: "active",
      theme: "system",
    });

    await db.insert(schema.accounts).values({
      id: "mNJM6QiaJpniN2GEf7ySOcjKh9GtM8It",
      accountId: "107399631414764468906",
      providerId: "google",
      userId: userId,
      scope: "https://www.googleapis.com/auth/userinfo.email,openid,https://www.googleapis.com/auth/userinfo.profile",
    });

    await db.insert(schema.organizations).values({
      id: orgId,
      name: "org1",
      slug: "org1",
    });

    await db.insert(schema.members).values({
      id: "750e427a-f1a5-48f9-aca6-d1fc15160cfa",
      organizationId: orgId,
      userId: userId,
      role: "owner",
    });
    console.log("✅ User, Google OAuth account, organization org1, and Owner membership seeded.");

    // 7. Seed Organization Defaults (Roles, PBAC, Categories, Statuses, Sequences, Templates)
    console.log("\n🏢 Step 6: Initializing organization defaults (PBAC, Expenses, Statuses, Agency Templates)...");
    await seedOrganizationDefaults(db, orgId, userId);
    console.log("✅ Organization defaults initialized successfully.");

    // 8. Seed Sample Client & Projects
    console.log("\n📁 Step 7: Seeding baseline Client & Projects for immediate drafting/invoicing...");
    const clientId = uuidv4();
    await db.insert(schema.clients).values({
      id: clientId,
      organizationId: orgId,
      name: "Acme Global Enterprises",
      email: "finance@acmeglobal.com",
      status: "active",
    });

    const [initialStatus] = await db
      .select()
      .from(schema.projectStatuses)
      .where(eq(schema.projectStatuses.organizationId, orgId))
      .limit(1);

    if (!initialStatus) {
      throw new Error("Initial project status was not created by seedOrganizationDefaults!");
    }

    const p1Id = uuidv4();
    await db.insert(schema.projects).values({
      id: p1Id,
      organizationId: orgId,
      clientId: clientId,
      name: "Q4 Marketing Strategy & Brand Evolution",
      status: initialStatus.id,
      fileSequenceNumber: 1,
      lifecycleState: "open",
    });

    const p2Id = uuidv4();
    await db.insert(schema.projects).values({
      id: p2Id,
      organizationId: orgId,
      clientId: clientId,
      name: "Enterprise Architecture Modernization",
      status: initialStatus.id,
      fileSequenceNumber: 2,
      lifecycleState: "open",
    });

    console.log("✅ Sample client 'Acme Global Enterprises' and 2 active projects seeded.");

    // 9. Verification & Summary
    console.log("\n📊 Step 8: Database Integrity Audit:");
    const tableCount = await sql`SELECT count(*)::int as count FROM information_schema.tables WHERE table_schema = 'public'`;
    const permCount = await db.select().from(schema.permissions);
    const orgCount = await db.select().from(schema.organizations);
    const userCount = await db.select().from(schema.users);
    const tplCount = await db.select().from(schema.invoiceTemplates);
    const projCount = await db.select().from(schema.projects);
    const tokCount = await db.select().from(schema.tokens);

    console.log(`   - Total Tables:       ${tableCount[0].count}`);
    console.log(`   - PBAC Permissions:   ${permCount.length}`);
    console.log(`   - Organizations:      ${orgCount.length}`);
    console.log(`   - Users:              ${userCount.length}`);
    console.log(`   - Invoice Templates:  ${tplCount.length}`);
    console.log(`   - Projects:           ${projCount.length}`);
    console.log(`   - Unified Tokens:     ${tokCount.length}`);

    console.log("\n==================================================================");
    console.log("✨ DATABASE WIPE & REBUILD COMPLETED SUCCESSFULLY WITH CLEAN DATA!");
    console.log("==================================================================");
  } catch (error) {
    console.error("❌ Rebuild failed with error:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
