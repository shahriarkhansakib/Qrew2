import { type CustomFieldDefinition } from "@starter/db";
import { z } from "zod";

export function createDynamicZodSchema(definitions: CustomFieldDefinition[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const def of definitions) {
    let fieldSchema: z.ZodTypeAny;

    switch (def.fieldType) {
      case "text":
        fieldSchema = z.string();
        if (!def.isRequired) {
          fieldSchema = fieldSchema.optional().or(z.literal(""));
        } else {
          fieldSchema = (fieldSchema as z.ZodString).min(1, `${def.fieldName} is required`);
        }
        break;

      case "number":
        fieldSchema = z.coerce.number();
        if (!def.isRequired) {
          fieldSchema = fieldSchema.optional();
        }
        break;

      case "date":
        fieldSchema = z
          .string()
          .datetime({ offset: true })
          .or(z.date())
          .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a valid date (YYYY-MM-DD)"));
        if (!def.isRequired) {
          fieldSchema = fieldSchema.optional().or(z.literal(""));
        }
        break;

      case "boolean":
        fieldSchema = z.coerce.boolean();
        if (!def.isRequired) {
          fieldSchema = fieldSchema.optional();
        }
        break;

      case "single_select":
        if (def.options && def.options.length > 0) {
          fieldSchema = z.enum(def.options as [string, ...string[]]);
        } else {
          fieldSchema = z.string();
        }
        if (!def.isRequired) {
          fieldSchema = fieldSchema.optional().or(z.literal(""));
        }
        break;

      case "multi_select":
        if (def.options && def.options.length > 0) {
          fieldSchema = z.array(z.enum(def.options as [string, ...string[]]));
        } else {
          fieldSchema = z.array(z.string());
        }
        if (!def.isRequired) {
          fieldSchema = fieldSchema.optional().default([]);
        } else {
          fieldSchema = (fieldSchema as z.ZodArray<any>).min(
            1,
            `${def.fieldName} requires at least one selection`,
          );
        }
        break;

      case "others":
        fieldSchema = z.string();
        if (!def.isRequired) {
          fieldSchema = fieldSchema.optional().or(z.literal(""));
        } else {
          fieldSchema = (fieldSchema as z.ZodString).min(1, `${def.fieldName} is required`);
        }
        break;

      default:
        fieldSchema = z.any();
    }

    shape[def.fieldKey] = fieldSchema;
  }

  return z.object(shape).passthrough();
}
