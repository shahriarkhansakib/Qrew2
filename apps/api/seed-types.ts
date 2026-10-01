import { db, invoiceTypes, organizations } from "@starter/db";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

async function seed() {
  const orgs = await db.select().from(organizations).limit(1);
  if (!orgs.length) return console.log("No org found");
  const orgId = orgs[0].id;

  const types = [
    { id: uuidv4(), organizationId: orgId, name: "Proforma", isDefault: true },
    { id: uuidv4(), organizationId: orgId, name: "Tax Invoice", isDefault: false },
    { id: uuidv4(), organizationId: orgId, name: "Receipt", isDefault: false },
  ];

  for (const t of types) {
    const existing = await db.select().from(invoiceTypes).where(eq(invoiceTypes.name, t.name));
    if (!existing.length) {
      await db.insert(invoiceTypes).values(t);
      console.log(`Inserted ${t.name}`);
    } else {
      console.log(`Skipped ${t.name}`);
    }
  }
  console.log("Seeded invoice types!");
  await new Promise((r) => setTimeout(r, 2000));
  process.exit(0);
}
seed();
