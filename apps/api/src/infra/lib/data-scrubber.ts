import { type AppPermission, type CustomFieldDefinition, customFieldDefinitions, db, organizations } from "@starter/db";
import { and, eq } from "drizzle-orm";
import { type Context } from "hono";

export interface ScrubberContext {
  isOwner: boolean;
  userPermissions?: Set<string>;
  orgSettings?: {
    sysDetailedFields?: string[];
    sysSensitiveFields?: string[];
    sysPrivateFields?: string[];
  };
  customFieldDefinitions?: CustomFieldDefinition[];
}

export async function getScrubberConfig(
  c: Context,
  entityType: "project" | "client" | "staff" | "all",
): Promise<ScrubberContext> {
  const orgId = c.get("organizationId");
  const isOwner = c.get("isOwner") || false;
  const userPermissions = c.get("userPermissions") as Set<string> | undefined;

  // If owner, we don't need to load anything because scrubber will instantly return
  if (isOwner) {
    return { isOwner };
  }

  // Load org settings
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });
  const orgSettings = org?.metadata ? JSON.parse(org.metadata) : {};

  // Load custom field definitions for the requested entity (or all if "all")
  let defsWhere = eq(customFieldDefinitions.organizationId, orgId);
  if (entityType !== "all") {
    defsWhere = and(defsWhere, eq(customFieldDefinitions.entityType, entityType))!;
  }

  const defs = await db.query.customFieldDefinitions.findMany({
    where: defsWhere,
  });

  return {
    isOwner,
    userPermissions,
    orgSettings,
    customFieldDefinitions: defs,
  };
}

/**
 * Scrubs private, sensitive, and detailed fields from an entity before returning it to the frontend.
 * Works for both Category 1 (System Fields) and Category 2 (Custom Fields).
 */
export function scrubEntityData<T extends Record<string, any>>(
  entity: T,
  config: ScrubberContext,
  entityType: "project" | "client" | "staff",
): T {
  // If user is owner, they see everything. No scrubbing needed.
  if (config.isOwner) {
    return entity;
  }

  const result = { ...entity };
  const permissions = config.userPermissions || new Set();
  const settings = config.orgSettings || {};

  // ---------------------------------------------------------------------------
  // 1. Scrub Category 1 (System Fields)
  // These are stored directly on the entity (e.g. result.email, result.status)
  // ---------------------------------------------------------------------------

  // A. Scrub Private System Fields (No one except owner should see these)
  if (settings.sysPrivateFields?.length) {
    for (const fieldId of settings.sysPrivateFields) {
      const key = getSystemFieldKey(fieldId, entityType);
      if (key && key in result) {
        delete result[key];
      }
    }
  }

  const sensitivePerm: AppPermission =
    entityType === "client"
      ? "client:view_sensitive"
      : entityType === "staff"
        ? "staff:view_sensitive"
        : "file:view_sensitive";

  const detailedPerm: AppPermission =
    entityType === "client"
      ? "client:view_details"
      : entityType === "staff"
        ? "staff:view_details"
        : "file:view_details";

  // B. Scrub Sensitive System Fields
  if (!permissions.has(sensitivePerm) && settings.sysSensitiveFields?.length) {
    for (const fieldId of settings.sysSensitiveFields) {
      const key = getSystemFieldKey(fieldId, entityType);
      if (key && key in result) {
        delete result[key];
      }
    }
  }

  // C. Scrub Detailed System Fields
  if (!permissions.has(detailedPerm) && settings.sysDetailedFields?.length) {
    for (const fieldId of settings.sysDetailedFields) {
      const key = getSystemFieldKey(fieldId, entityType);
      if (key && key in result) {
        delete result[key];
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Scrub Category 2 (Custom Fields)
  // These are stored inside the `customFields` JSONB object
  // ---------------------------------------------------------------------------
  if (result.customFields && config.customFieldDefinitions) {
    const scrubbedCustomFields = { ...result.customFields };
    let hasChanges = false;

    // Filter definitions to match this entity type
    const relevantDefs = config.customFieldDefinitions.filter((d) => d.entityType === entityType);

    for (const def of relevantDefs) {
      const key = def.fieldKey;
      if (key in scrubbedCustomFields) {
        let shouldScrub = false;

        if (def.isPrivate) {
          shouldScrub = true; // We already know they aren't owner from the early return
        } else if (def.isSensitive && !permissions.has(sensitivePerm)) {
          shouldScrub = true;
        } else if (def.isDetailed && !permissions.has(detailedPerm)) {
          shouldScrub = true;
        }

        if (shouldScrub) {
          delete scrubbedCustomFields[key];
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      (result as any).customFields = scrubbedCustomFields;
    }
  }

  return result;
}

/**
 * Helper to map a System Field ID (e.g. sys-client-email) to its actual payload key (e.g. email)
 */
function getSystemFieldKey(sysFieldId: string, entityType: string): string | null {
  // We only map fields relevant to the requested entityType
  const map: Record<string, { entity: string; key: string }> = {
    "sys-client-name": { entity: "client", key: "name" },
    "sys-client-email": { entity: "client", key: "email" },
    "sys-project-name": { entity: "project", key: "name" },
    "sys-project-client": { entity: "project", key: "clientId" },
    "sys-project-status": { entity: "project", key: "status" },
    "sys-staff-name": { entity: "staff", key: "name" },
    "sys-staff-email": { entity: "staff", key: "email" },
    "sys-staff-role": { entity: "staff", key: "role" }, // or memberBaseRole depending on query
  };

  const mapping = map[sysFieldId];
  if (mapping && mapping.entity === entityType) {
    return mapping.key;
  }
  return null;
}
