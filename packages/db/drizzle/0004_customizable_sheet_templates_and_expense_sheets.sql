-- 0004_customizable_sheet_templates_and_expense_sheets.sql
-- Adds support for customizable sheet templates (general-purpose Excel-style) and standalone expense sheets.

-- 1. Extend invoice_templates with template_type and column_definitions
ALTER TABLE "invoice_templates"
  ADD COLUMN IF NOT EXISTS "template_type" TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE "invoice_templates"
  ADD COLUMN IF NOT EXISTS "column_definitions" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Extend template_rows with cell_values for arbitrary column storage
ALTER TABLE "template_rows"
  ADD COLUMN IF NOT EXISTS "cell_values" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Create expense_sheets table for dedicated standalone expense logs
CREATE TABLE IF NOT EXISTS "expense_sheets" (
  "id" TEXT PRIMARY KEY,
  "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "template_id" TEXT REFERENCES "invoice_templates"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "document_number" TEXT,
  "period_start" TIMESTAMP,
  "period_end" TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "column_definitions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "sections" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "edit_history" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "created_by_user_id" TEXT REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "expense_sheets_org_idx" ON "expense_sheets" ("organization_id");
CREATE INDEX IF NOT EXISTS "expense_sheets_status_idx" ON "expense_sheets" ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "expense_sheets_template_idx" ON "expense_sheets" ("template_id");
