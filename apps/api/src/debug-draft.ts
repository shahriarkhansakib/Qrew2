import { db, invoiceDrafts, invoiceTemplates, organizations, projects, users } from "@starter/db";

async function main() {
  try {
    const user = await db.select().from(users).limit(1);
    const org = await db.select().from(organizations).limit(1);
    const proj = await db.select().from(projects).limit(1);
    const tpl = await db.select().from(invoiceTemplates).limit(1);

    if (!user.length || !org.length || !proj.length) {
      console.log("Missing data");
      return;
    }

    console.log("Trying to insert draft...");
    const [created] = await db
      .insert(invoiceDrafts)
      .values({
        id: crypto.randomUUID(),
        organizationId: org[0].id,
        projectId: proj[0].id,
        userId: user[0].id,
        sourceTemplateId: tpl.length ? tpl[0].id : undefined,
        draftHeaderValues: {},
        draftSections: [],
        lastAutoSavedAt: new Date(),
      })
      .returning();

    console.log("Inserted:", created.id);
  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    process.exit(0);
  }
}

main();
