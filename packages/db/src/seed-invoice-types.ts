import "dotenv/config";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db } from "./index";
import { invoiceTypes, organizations } from "./schema";

async function run() {
  console.log("Seeding invoice types for existing orgs...");
  const orgs = await db.select().from(organizations);
  for (const org of orgs) {
    const existingInvoiceTypes = await db
      .select()
      .from(invoiceTypes)
      .where(eq(invoiceTypes.organizationId, org.id));
    if (existingInvoiceTypes.length === 0) {
      await db.insert(invoiceTypes).values([
        { id: uuidv4(), organizationId: org.id, name: "Proforma", isDefault: true },
        { id: uuidv4(), organizationId: org.id, name: "Tax Invoice", isDefault: false },
        { id: uuidv4(), organizationId: org.id, name: "Receipt", isDefault: false },
      ]);
      console.log(`Seeded for org: ${org.id}`);
    }
  }
  console.log("Done");
  process.exit(0);
}

run();
