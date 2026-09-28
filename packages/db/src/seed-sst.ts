import * as crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import "dotenv/config";
import {
  accounts,
  clients,
  customFieldDefinitions,
  db,
  expenseCategories,
  expenses,
  invoiceLineItems,
  invoices,
  members,
  organizations,
  orgRolePermissions,
  orgRoles,
  projects,
  requisitions,
  users,
  walletTransactions,
} from "./index";
import { seedPermissionsDefaults } from "./seed-permissions";

function generateKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize("NFKC"),
      salt,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      },
    );
  });
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await generateKey(password, salt);
  return `${salt}:${key.toString("hex")}`;
}

async function seedSST() {
  console.log("🌊 Seeding SeaSideTraders (SST) Organization...");

  await seedPermissionsDefaults(db);

  // Generate a real scrypt hash for '12345678' to match better-auth v1.x expected format
  const defaultHash = await hashPassword("12345678");

  // 1. Create Users
  const userList = [
    { email: "kabir@sst.com", name: "Kabir Owner", pass: "12345678", role: "owner" },
    { email: "salin@sst.com", name: "Salin", pass: "12345678", role: "member" },
    { email: "rubel@sst.com", name: "Rubel", pass: "12345678", role: "member" },
    { email: "jahir@sst.com", name: "Jahir", pass: "12345678", role: "member" },
    { email: "monir@sst.com", name: "Monir", pass: "12345678", role: "member" },
    { email: "terek@sst.com", name: "Terek", pass: "12345678", role: "member" },
    { email: "jamil@sst.com", name: "Jamil", pass: "12345678", role: "member" },
  ];

  const createdUsers: Record<string, any> = {};

  for (const u of userList) {
    try {
      const userId = uuidv4();
      await db
        .insert(users)
        .values({
          id: userId,
          email: u.email,
          name: u.name,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing();

      const userDb = await db.query.users.findFirst({
        where: (users, { eq }) => eq(users.email, u.email),
      });
      if (userDb) {
        createdUsers[u.email] = userDb;

        await db
          .insert(accounts)
          .values({
            id: uuidv4(),
            userId: userDb.id,
            accountId: userDb.id,
            providerId: "credential",
            password: defaultHash,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: accounts.id,
            set: { password: defaultHash },
          });

        await db
          .update(accounts)
          .set({ password: defaultHash })
          .where(require("drizzle-orm").eq(accounts.userId, userDb.id));
      }

      console.log(`Created user: ${u.email}`);
    } catch (e) {
      console.log(`Error creating ${u.email}`, e);
    }
  }

  const owner = createdUsers["kabir@sst.com"];
  if (!owner) throw new Error("Owner not created");

  // 2. Create Organization
  console.log("🏢 Creating Organization...");
  const orgId = uuidv4();
  await db
    .insert(organizations)
    .values({
      id: orgId,
      name: "SeaSideTraders",
      slug: "seasidetraders",
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  const orgDb = await db.query.organizations.findFirst({
    where: (orgs, { eq }) => eq(orgs.slug, "seasidetraders"),
  });
  if (!orgDb) throw new Error("Org not created");

  const { seedOrganizationDefaults } = await import("./org-initializer");
  await seedOrganizationDefaults(db, orgDb.id, owner.id);

  // 2.5 Clean up existing SeaSideTraders data to make seeding idempotent and prevent duplicates
  console.log("🧹 Cleaning up existing SeaSideTraders data to ensure fresh seeding...");

  // Delete invoices and invoice line items
  const orgInvoices = await db.query.invoices.findMany({
    where: (inv, { eq }) => eq(inv.organizationId, orgDb.id),
  });
  if (orgInvoices.length > 0) {
    const invoiceIds = orgInvoices.map((i) => i.id);
    await db
      .delete(invoiceLineItems)
      .where(require("drizzle-orm").inArray(invoiceLineItems.invoiceId, invoiceIds));
    await db.delete(invoices).where(require("drizzle-orm").eq(invoices.organizationId, orgDb.id));
  }

  // Delete transactions, expenses, requisitions
  await db
    .delete(walletTransactions)
    .where(require("drizzle-orm").eq(walletTransactions.organizationId, orgDb.id));
  await db.delete(expenses).where(require("drizzle-orm").eq(expenses.organizationId, orgDb.id));
  await db
    .delete(requisitions)
    .where(require("drizzle-orm").eq(requisitions.organizationId, orgDb.id));

  // Delete projects, clients, expense categories, custom fields
  await db.delete(projects).where(require("drizzle-orm").eq(projects.organizationId, orgDb.id));
  await db.delete(clients).where(require("drizzle-orm").eq(clients.organizationId, orgDb.id));
  await db
    .delete(expenseCategories)
    .where(require("drizzle-orm").eq(expenseCategories.organizationId, orgDb.id));
  await db
    .delete(customFieldDefinitions)
    .where(require("drizzle-orm").eq(customFieldDefinitions.organizationId, orgDb.id));

  // 3. Create Custom Roles
  console.log("🛡️ Creating Roles...");

  // General Manager Role
  let gmRoleId = uuidv4();
  const existingGm = await db.query.orgRoles.findFirst({
    where: (r, { and, eq }) => and(eq(r.organizationId, orgDb.id), eq(r.name, "General Manager")),
  });
  if (existingGm) {
    gmRoleId = existingGm.id;
  } else {
    await db.insert(orgRoles).values({
      id: gmRoleId,
      organizationId: orgDb.id,
      name: "General Manager",
      description: "Admin level access. Cannot change org settings/invoice format.",
      createdBy: owner.id,
    });
    await db.insert(orgRolePermissions).values([
      { roleId: gmRoleId, permissionKey: "client:view" },
      { roleId: gmRoleId, permissionKey: "client:create" },
      { roleId: gmRoleId, permissionKey: "client:edit" },
      { roleId: gmRoleId, permissionKey: "client:delete" },
      { roleId: gmRoleId, permissionKey: "client:view_archived" },
      { roleId: gmRoleId, permissionKey: "file:view" },
      { roleId: gmRoleId, permissionKey: "file:create" },
      { roleId: gmRoleId, permissionKey: "file:edit" },
      { roleId: gmRoleId, permissionKey: "file:delete" },
      { roleId: gmRoleId, permissionKey: "file:view_archived" },
      { roleId: gmRoleId, permissionKey: "finance:view_expenses" },
      { roleId: gmRoleId, permissionKey: "finance:request_funds" },
      { roleId: gmRoleId, permissionKey: "finance:approve_funds" },
      { roleId: gmRoleId, permissionKey: "finance:record_expense" },
      { roleId: gmRoleId, permissionKey: "invoice:view" },
      { roleId: gmRoleId, permissionKey: "invoice:create" },
      { roleId: gmRoleId, permissionKey: "invoice:edit" },
      { roleId: gmRoleId, permissionKey: "invoice:delete" },
    ]);
  }

  // Accounts Role
  let accountsRoleId = uuidv4();
  const existingAcc = await db.query.orgRoles.findFirst({
    where: (r, { and, eq }) => and(eq(r.organizationId, orgDb.id), eq(r.name, "Accounts")),
  });
  if (existingAcc) {
    accountsRoleId = existingAcc.id;
  } else {
    await db.insert(orgRoles).values({
      id: accountsRoleId,
      organizationId: orgDb.id,
      name: "Accounts",
      description: "Handles all financials except invoices",
      createdBy: owner.id,
    });
    await db.insert(orgRolePermissions).values([
      { roleId: accountsRoleId, permissionKey: "client:view" },
      { roleId: accountsRoleId, permissionKey: "client:view_archived" },
      { roleId: accountsRoleId, permissionKey: "file:view" },
      { roleId: accountsRoleId, permissionKey: "file:view_archived" },
      { roleId: accountsRoleId, permissionKey: "finance:view_expenses" },
      { roleId: accountsRoleId, permissionKey: "finance:request_funds" },
      { roleId: accountsRoleId, permissionKey: "finance:approve_funds" },
      { roleId: accountsRoleId, permissionKey: "finance:record_expense" },
      { roleId: accountsRoleId, permissionKey: "finance:manage_categories" },
      { roleId: accountsRoleId, permissionKey: "finance:view_wallets" },
      { roleId: accountsRoleId, permissionKey: "finance:manage_wallets" },
    ]);
  }

  // Executive Officer Role
  let eoRoleId = uuidv4();
  const existingEo = await db.query.orgRoles.findFirst({
    where: (r, { and, eq }) => and(eq(r.organizationId, orgDb.id), eq(r.name, "Executive Officer")),
  });
  if (existingEo) {
    eoRoleId = existingEo.id;
  } else {
    await db.insert(orgRoles).values({
      id: eoRoleId,
      organizationId: orgDb.id,
      name: "Executive Officer",
      description: "Manages files. Read-only clients.",
      createdBy: owner.id,
    });
    await db.insert(orgRolePermissions).values([
      { roleId: eoRoleId, permissionKey: "client:view" },
      { roleId: eoRoleId, permissionKey: "file:view" },
      { roleId: eoRoleId, permissionKey: "file:create" },
      { roleId: eoRoleId, permissionKey: "file:edit" },
      { roleId: eoRoleId, permissionKey: "finance:request_funds" },
      { roleId: eoRoleId, permissionKey: "finance:view_expenses" },
    ]);
  }

  // General Staff Role
  let staffRoleId = uuidv4();
  const existingStaff = await db.query.orgRoles.findFirst({
    where: (r, { and, eq }) => and(eq(r.organizationId, orgDb.id), eq(r.name, "General Staff")),
  });
  if (existingStaff) {
    staffRoleId = existingStaff.id;
  } else {
    await db.insert(orgRoles).values({
      id: staffRoleId,
      organizationId: orgDb.id,
      name: "General Staff",
      description: "Read-only files/clients, can request money and record expense",
      createdBy: owner.id,
    });
    await db.insert(orgRolePermissions).values([
      { roleId: staffRoleId, permissionKey: "client:view" },
      { roleId: staffRoleId, permissionKey: "file:view" },
      { roleId: staffRoleId, permissionKey: "finance:request_funds" },
      { roleId: staffRoleId, permissionKey: "finance:record_expense" },
      { roleId: staffRoleId, permissionKey: "finance:view_expenses" },
    ]);
  }

  // 4. Add Members to Org
  console.log("👥 Adding Members...");
  await db
    .insert(members)
    .values({
      id: uuidv4(),
      organizationId: orgDb.id,
      userId: owner.id,
      role: "owner",
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  const { orgMemberRoles } = await import("./index");

  const assignRole = async (email: string, roleId: string) => {
    if (!createdUsers[email]) return;
    const uid = createdUsers[email].id;
    await db
      .insert(members)
      .values({
        id: uuidv4(),
        organizationId: orgDb.id,
        userId: uid,
        role: "member",
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    const dbMember = await db.query.members.findFirst({
      where: (m, { and, eq }) => and(eq(m.organizationId, orgDb.id), eq(m.userId, uid)),
    });
    if (dbMember) {
      await db
        .insert(orgMemberRoles)
        .values({
          id: uuidv4(),
          organizationId: orgDb.id,
          memberId: dbMember.id,
          roleId: roleId,
          assignedBy: owner.id,
        })
        .onConflictDoNothing();
    }
  };

  await assignRole("salin@sst.com", gmRoleId);
  await assignRole("rubel@sst.com", gmRoleId);
  await assignRole("jahir@sst.com", accountsRoleId);
  await assignRole("monir@sst.com", eoRoleId);
  await assignRole("terek@sst.com", staffRoleId);
  await assignRole("jamil@sst.com", staffRoleId);

  // 5. Custom Field Definitions
  console.log("📝 Adding Custom Fields Schema...");
  const fields = [
    { entity: "client", name: "Address", key: "address", type: "text", req: false },
    { entity: "client", name: "Contact Number", key: "contact_number", type: "text", req: false },
    { entity: "project", name: "Voyage Number", key: "voyage_number", type: "text", req: false },
    { entity: "project", name: "Arrival Date", key: "arrival_date", type: "date", req: false },
    { entity: "project", name: "Departure Date", key: "departure_date", type: "date", req: false },
    {
      entity: "project",
      name: "Terminal Number",
      key: "terminal_number",
      type: "text",
      req: false,
    },
    { entity: "project", name: "Port Number", key: "port_number", type: "text", req: false },
    {
      entity: "project",
      name: "Port",
      key: "port",
      type: "single_select",
      req: true,
      options: ["CDG", "Mongla", "Singapore", "Dubai"],
    },
    { entity: "project", name: "GRT", key: "grt", type: "number", req: false },
    { entity: "project", name: "NRT", key: "nrt", type: "number", req: false },
  ];

  for (const f of fields) {
    await db
      .insert(customFieldDefinitions)
      .values({
        id: uuidv4(),
        organizationId: orgDb.id,
        entityType: f.entity as "client" | "project",
        fieldName: f.name,
        fieldKey: f.key,
        fieldType: f.type as any,
        isRequired: f.req,
        options: f.options || null,
        isSeeded: true,
      })
      .onConflictDoNothing();
  }

  // 6. Demo Clients
  console.log("🤝 Creating 18 Demo Clients...");
  const clientNames = [
    "Oceanic Gas Carriers Ltd.",
    "Maersk Logistics Baltic",
    "Pacific Freight Co.",
    "Singapore Port Terminal Inc.",
    "Evergreen Shipping Line",
    "Hapag-Lloyd Bangladesh Ltd.",
    "Mediterranean Shipping Company (MSC)",
    "CMA CGM Logistics Asia",
    "Cosco Shipping Agencies Co.",
    "NYK Line South Asia",
    "Mitsui O.S.K. Lines Bangladesh",
    "Yang Ming Marine Transport Corp.",
    "Hyundai Merchant Marine Ltd.",
    "Zim Integrated Shipping Services",
    "Wan Hai Lines Ltd.",
    "Pacific International Lines (PIL)",
    "K Line Shipping Bangladesh",
    "OOCL Logistics Group",
  ];

  const cities = [
    "Singapore",
    "Copenhagen",
    "Sydney",
    "Mongla",
    "Dubai",
    "Chittagong",
    "Tokyo",
    "Rotterdam",
    "Shanghai",
    "Hamburg",
  ];

  const createdClients: any[] = [];

  function getRandomDateInPastDays(days: number) {
    const date = new Date();
    date.setDate(date.getDate() - Math.floor(Math.random() * days));
    date.setHours(
      Math.floor(Math.random() * 24),
      Math.floor(Math.random() * 60),
      Math.floor(Math.random() * 60),
    );
    return date;
  }

  for (let i = 0; i < clientNames.length; i++) {
    const clientId = uuidv4();
    const city = cities[i % cities.length];
    const phone = `+${Math.floor(100 + Math.random() * 900)} ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`;
    const customFields = {
      address: `${Math.floor(10 + Math.random() * 980)} Port Road, ${city}`,
      contact_number: phone,
    };

    const email = `${clientNames[i].toLowerCase().replace(/[^a-z0-9]/g, "")}@example.com`;

    await db.insert(clients).values({
      id: clientId,
      organizationId: orgDb.id,
      name: clientNames[i],
      email: email,
      customFields: customFields,
      createdAt: getRandomDateInPastDays(90),
    });

    createdClients.push({ id: clientId, name: clientNames[i] });
  }

  // 7. Demo Files (Projects)
  console.log("🚢 Creating 35 Demo Files (Projects)...");
  const vesselNames = [
    "LPG Sakura",
    "MV Golden Hawk",
    "MV Desert Explorer",
    "LPG Pioneer",
    "Maersk Sealand",
    "MSC Sofia",
    "Ever Given Voyager",
    "CMA CGM Orion",
    "Cosco Nebula",
    "Hyundai Pride",
    "Zim Virginia",
    "Wan Hai Star",
    "PIL Emerald",
    "K Line Crown",
    "OOCL Fortune",
    "Ocean Grace",
    "Bunga Raya",
    "Pacific Breeze",
    "Nordic Spirit",
    "Cape Express",
  ];

  const voyageSuffixes = [
    "Arrival",
    "Departure",
    "Bunkering",
    "Cargo Discharging",
    "Crew Change",
    "Maintenance",
    "Port Transit",
    "Supply Delivery",
  ];

  const dbStatuses = await db.query.projectStatuses.findMany({
    where: (s, { eq }) => eq(s.organizationId, orgDb.id),
  });
  const _createdStatus = dbStatuses.find((s) => s.name === "Created");
  const completedStatus = dbStatuses.find((s) => s.name === "Completed");

  const { projectStatuses } = await import("./index");
  const activeStatusId = uuidv4();
  await db
    .insert(projectStatuses)
    .values({
      id: activeStatusId,
      organizationId: orgDb.id,
      name: "Active",
      order: 3,
      isDefault: false,
      isSystem: false,
    })
    .onConflictDoNothing();

  const pendingStatusId = uuidv4();
  await db
    .insert(projectStatuses)
    .values({
      id: pendingStatusId,
      organizationId: orgDb.id,
      name: "Pending",
      order: 4,
      isDefault: false,
      isSystem: false,
    })
    .onConflictDoNothing();

  const statusChoices = [
    { sId: activeStatusId, ls: "open" },
    { sId: activeStatusId, ls: "open" },
    { sId: activeStatusId, ls: "open" },
    { sId: completedStatus?.id || activeStatusId, ls: "completed" },
    { sId: completedStatus?.id || activeStatusId, ls: "completed" },
    { sId: pendingStatusId, ls: "open" },
    { sId: activeStatusId, ls: "canceled" },
    { sId: completedStatus?.id || activeStatusId, ls: "archived" },
  ] as const;

  const ports = ["CDG", "Mongla", "Singapore", "Dubai"];

  const createdProjects: any[] = [];
  for (let i = 0; i < 35; i++) {
    const projectId = uuidv4();
    const vessel = vesselNames[i % vesselNames.length];
    const suffix = voyageSuffixes[Math.floor(Math.random() * voyageSuffixes.length)];
    const projectName = `${vessel} ${suffix}`;
    const client = createdClients[Math.floor(Math.random() * createdClients.length)];
    const choice = statusChoices[i % statusChoices.length];

    const arrival = getRandomDateInPastDays(90);
    const departure = new Date(arrival.getTime() + 86400000 * (1 + Math.floor(Math.random() * 4))); // 1 to 4 days later

    const port = ports[i % ports.length];
    const voyageNum = `V-${Math.floor(1000 + Math.random() * 9000)}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;

    const customFields = {
      voyage_number: voyageNum,
      arrival_date: arrival.toISOString(),
      departure_date:
        choice.ls === "completed" || choice.ls === "archived" ? departure.toISOString() : undefined,
      terminal_number: `T-0${Math.floor(1 + Math.random() * 9)}`,
      port_number: `P-${Math.floor(10 + Math.random() * 89)}`,
      port: port,
      grt: Math.floor(20000 + Math.random() * 50000),
      nrt: Math.floor(10000 + Math.random() * 20000),
    };

    await db.insert(projects).values({
      id: projectId,
      organizationId: orgDb.id,
      name: projectName,
      status: choice.sId,
      lifecycleState: choice.ls,
      archivedAt: choice.ls === "archived" ? new Date() : null,
      clientId: client.id,
      customFields: customFields,
      createdAt: arrival,
    });

    createdProjects.push({
      id: projectId,
      name: projectName,
      clientId: client.id,
      arrivalDate: arrival,
    });
  }

  // 8. Expense Categories
  console.log("💰 Creating Expense Categories...");
  const categoriesData = [
    { name: "Port Dues", description: "Mandatory port authority charges" },
    { name: "Crew Supplies", description: "Food and daily necessities for crew" },
    { name: "Transportation", description: "Logistics and local transport" },
    { name: "Maintenance", description: "Repair and service charges" },
    { name: "Agent Fees", description: "Local shipping agency representation fees" },
    { name: "Bunker/Fuel", description: "Vessel refueling charges" },
  ];

  const createdCategories: any[] = [];
  for (const cat of categoriesData) {
    const catId = uuidv4();
    await db.insert(expenseCategories).values({
      id: catId,
      organizationId: orgDb.id,
      name: cat.name,
      description: cat.description,
    });
    createdCategories.push({ id: catId, name: cat.name });
  }

  // 9. Demo Requisitions & Wallet Transactions
  console.log("💸 Simulating 50 Financial Requisitions...");

  const requesterPool = [
    createdUsers["terek@sst.com"],
    createdUsers["jamil@sst.com"],
    createdUsers["monir@sst.com"],
  ];
  const occasionalRequesterPool = [
    createdUsers["salin@sst.com"],
    createdUsers["rubel@sst.com"],
    createdUsers["jahir@sst.com"],
  ];

  const requisitionStatuses = [
    "disbursed",
    "disbursed",
    "disbursed",
    "approved",
    "rejected",
    "pending",
  ] as const;

  const requisitionPurposes = [
    "Advance for Port Dues",
    "Crew supplies & provisions",
    "Local transportation for surveyor",
    "Emergency engine maintenance",
    "Shipping agent representation fees",
    "Bunkering support cash advance",
    "Fresh water & supplies refill",
    "Customs clearance fee advance",
    "Terminal cargo handling deposit",
    "Local logistics and boat hire",
  ];

  const otherTopApprovers = [
    createdUsers["kabir@sst.com"],
    createdUsers["salin@sst.com"],
    createdUsers["rubel@sst.com"],
    createdUsers["monir@sst.com"],
  ];

  const createdRequisitions: any[] = [];

  for (let i = 0; i < 50; i++) {
    const reqId = uuidv4();
    const project = createdProjects[i % createdProjects.length];

    // Choose requester (90% from staff/executive, 10% from others)
    let requester = requesterPool[Math.floor(Math.random() * requesterPool.length)];
    if (Math.random() < 0.1) {
      requester =
        occasionalRequesterPool[Math.floor(Math.random() * occasionalRequesterPool.length)];
    }

    const status = requisitionStatuses[i % requisitionStatuses.length];

    // Pick actioner if not pending
    let actionerId: string | null = null;
    if (status !== "pending") {
      const isJahir = Math.random() < 0.9; // Maximum, 90% accepted by Jahir
      if (isJahir && requester.email !== "jahir@sst.com") {
        actionerId = createdUsers["jahir@sst.com"].id;
      } else {
        // Find an actioner who is not the requester
        const validApprovers = otherTopApprovers.filter((u) => u.id !== requester.id);
        const selectedApprover =
          validApprovers.length > 0
            ? validApprovers[Math.floor(Math.random() * validApprovers.length)]
            : createdUsers["kabir@sst.com"];
        actionerId = selectedApprover.id;
      }
    }

    const amountNum = (400 + Math.random() * 9000).toFixed(2);
    const purpose = `${requisitionPurposes[i % requisitionPurposes.length]} - ${project.name.split(" ")[0]}`;
    const createdAt = getRandomDateInPastDays(90);

    await db.insert(requisitions).values({
      id: reqId,
      organizationId: orgDb.id,
      requestedById: requester.id,
      projectId: project.id,
      amount: amountNum,
      purpose: purpose,
      status: status,
      actionedById: actionerId,
      createdAt: createdAt,
      updatedAt: createdAt,
    });

    createdRequisitions.push({
      id: reqId,
      organizationId: orgDb.id,
      requestedById: requester.id,
      projectId: project.id,
      amount: amountNum,
      purpose: purpose,
      status: status,
      actionedById: actionerId,
      createdAt: createdAt,
    });

    // Wallet transaction if disbursed
    if (status === "disbursed") {
      await db.insert(walletTransactions).values({
        id: uuidv4(),
        organizationId: orgDb.id,
        memberId: requester.id,
        type: "credit",
        amount: amountNum,
        referenceType: "requisition",
        referenceId: reqId,
        description: `Disbursed funds for Req: ${purpose}`,
        createdAt: createdAt,
      });
    }
  }

  // 10. Demo Expenses
  console.log("💰 Simulating 75 Logged Expenses...");

  const expenseCreators = [
    createdUsers["terek@sst.com"],
    createdUsers["jamil@sst.com"],
    createdUsers["monir@sst.com"],
    createdUsers["jahir@sst.com"],
  ];
  const occasionalExpenseCreators = [
    createdUsers["salin@sst.com"],
    createdUsers["rubel@sst.com"],
    createdUsers["kabir@sst.com"],
  ];

  const expenseDescriptions = [
    "Port authority tug boat fee",
    "Local fresh food provisions for crew",
    "Taxi and ferry transfer for incoming captain",
    "Replacement hydraulic valve and fittings",
    "Customs inspection clearance agent fee",
    "Emergency welder service for hull bracket",
    "Lubricating oil drums",
    "Garbage disposal service at berth",
    "Drinking water delivery (20,000 Liters)",
    "Laundry service for ship linen",
  ];

  const createdExpenses: any[] = [];

  for (let i = 0; i < 75; i++) {
    const expId = uuidv4();
    const project = createdProjects[i % createdProjects.length];
    const category = createdCategories[i % createdCategories.length];

    // Choose member who spent (95% from staff/executive/accountant, 5% others)
    let spender = expenseCreators[Math.floor(Math.random() * expenseCreators.length)];
    if (Math.random() < 0.05) {
      spender =
        occasionalExpenseCreators[Math.floor(Math.random() * occasionalExpenseCreators.length)];
    }

    const amountNum = (50 + Math.random() * 2500).toFixed(2);
    const descStr = `${expenseDescriptions[i % expenseDescriptions.length]} - ${project.name.split(" ")[0]}`;
    const createdAt = getRandomDateInPastDays(90);

    await db.insert(expenses).values({
      id: expId,
      organizationId: orgDb.id,
      memberId: spender.id,
      projectId: project.id,
      categoryId: category.id,
      amount: amountNum,
      description: descStr,
      createdAt: createdAt,
      updatedAt: createdAt,
    });

    createdExpenses.push({
      id: expId,
      organizationId: orgDb.id,
      memberId: spender.id,
      projectId: project.id,
      categoryId: category.id,
      amount: amountNum,
      description: descStr,
      createdAt: createdAt,
    });

    // Debit transaction in user's wallet
    await db.insert(walletTransactions).values({
      id: uuidv4(),
      organizationId: orgDb.id,
      memberId: spender.id,
      type: "debit",
      amount: amountNum,
      referenceType: "expense",
      referenceId: expId,
      description: `Expense logged: ${descStr}`,
      createdAt: createdAt,
    });
  }

  // 11. Demo Invoices and Line Items
  console.log("🧾 Generating Coherent Invoices & Line Items...");

  // Group expenses by project ID
  const expensesByProject: Record<string, typeof createdExpenses> = {};
  for (const exp of createdExpenses) {
    if (!expensesByProject[exp.projectId]) {
      expensesByProject[exp.projectId] = [];
    }
    expensesByProject[exp.projectId].push(exp);
  }

  // Create invoices for the first 15 projects that have expenses
  const projectIdsWithExpenses = Object.keys(expensesByProject);
  const invoiceCount = Math.min(16, projectIdsWithExpenses.length);
  const invoiceStatuses = [
    "draft",
    "issued",
    "issued",
    "paid",
    "paid",
    "paid",
    "void",
    "disputed",
  ] as const;

  const { invoiceTypes } = await import("./index");
  const defaultInvoiceType = await db.query.invoiceTypes.findFirst({
    where: (it: any, { and, eq }: any) =>
      and(eq(it.organizationId, orgDb.id), eq(it.isDefault, true)),
  });
  if (!defaultInvoiceType) throw new Error("Default invoice type not found");

  for (let i = 0; i < invoiceCount; i++) {
    const projectId = projectIdsWithExpenses[i];
    const projectExpenses = expensesByProject[projectId];

    // Find the project object to get its details and client
    const projectObj = createdProjects.find((p) => p.id === projectId);
    if (!projectObj) continue;

    const invoiceId = uuidv4();
    const invNumber = `INV-2026-${String(i + 1).padStart(3, "0")}`;
    const status = invoiceStatuses[i % invoiceStatuses.length];

    // Compute subtotal from the project's expenses
    let subtotal = 0;
    for (const exp of projectExpenses) {
      subtotal += parseFloat(exp.amount);
    }
    const subtotalStr = subtotal.toFixed(2);
    const taxNum = subtotal * 0.05; // 5% tax
    const taxStr = taxNum.toFixed(2);
    const totalStr = (subtotal + taxNum).toFixed(2);

    const issueDate = getRandomDateInPastDays(60);
    const _dueDate = new Date(issueDate.getTime() + 86400000 * 30); // 30 days later

    const clientObj = createdClients.find((c) => c.id === projectObj.clientId);
    const issuedToClientName = clientObj?.name ?? "Demo Client";

    await db.insert(invoices).values({
      id: invoiceId,
      organizationId: orgDb.id,
      clientId: projectObj.clientId,
      projectId: projectId,
      documentType: defaultInvoiceType.id,
      documentNumber: invNumber,
      status: status,
      generatedByUserId: createdUsers["kabir@sst.com"].id,
      issuedToClientName: issuedToClientName,
      currency: "USD",
      totalBaseAmount: subtotalStr,
      totalChargesAmount: taxStr,
      grandTotalAmount: totalStr,
      notes: `Invoice for maritime and agency services provided for vessel ${projectObj.name.split(" ")[0]}. Pls pay within 30 days.`,
      createdAt: issueDate,
      updatedAt: issueDate,
    });

    // Create line items for each expense of this project
    for (let j = 0; j < projectExpenses.length; j++) {
      const exp = projectExpenses[j];
      await db.insert(invoiceLineItems).values({
        id: uuidv4(),
        invoiceId: invoiceId,
        rowToken: `EXPENSE_${j + 1}`,
        lineType: "row",
        label: exp.description,
        baseValue: exp.amount,
        totalValue: exp.amount,
        displayOrder: j + 1,
        createdAt: exp.createdAt,
      });
    }
  }

  console.log("✅ SeaSideTraders Comprehensive Seed Completed!");
  process.exit(0);
}

seedSST();
