import { PERMISSIONS_CATALOG } from "./permissions-registry";
import { permissions } from "./schema";

export async function seedPermissionsDefaults(db: any) {
  console.log(`1. Seeding PBAC Permissions (${PERMISSIONS_CATALOG.length} permissions)...`);
  for (const perm of PERMISSIONS_CATALOG) {
    await db
      .insert(permissions)
      .values({
        key: perm.key,
        category: perm.category,
        description: perm.description,
      })
      .onConflictDoUpdate({
        target: permissions.key,
        set: {
          description: perm.description,
          category: perm.category,
        },
      });
  }
}
