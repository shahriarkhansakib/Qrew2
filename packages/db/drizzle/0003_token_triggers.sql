-- Trigger function for delete cascade from entity to tokens
CREATE OR REPLACE FUNCTION delete_token_on_entity_delete()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM tokens WHERE id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for update timestamp sync
CREATE OR REPLACE FUNCTION sync_token_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tokens SET updated_at = NOW() WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trg_delete_token_template_rows ON template_rows;
DROP TRIGGER IF EXISTS trg_delete_token_template_sections ON template_sections;
DROP TRIGGER IF EXISTS trg_delete_token_template_row_charges ON template_row_charges;
DROP TRIGGER IF EXISTS trg_delete_token_template_section_charges ON template_section_charges;
DROP TRIGGER IF EXISTS trg_delete_token_template_constants ON template_constants;
DROP TRIGGER IF EXISTS trg_delete_token_template_header_fields ON template_header_fields;
DROP TRIGGER IF EXISTS trg_delete_token_organization_configs ON organization_configs;
DROP TRIGGER IF EXISTS trg_delete_token_expense_categories ON expense_categories;

DROP TRIGGER IF EXISTS trg_update_token_template_rows ON template_rows;
DROP TRIGGER IF EXISTS trg_update_token_template_sections ON template_sections;
DROP TRIGGER IF EXISTS trg_update_token_template_row_charges ON template_row_charges;
DROP TRIGGER IF EXISTS trg_update_token_template_section_charges ON template_section_charges;
DROP TRIGGER IF EXISTS trg_update_token_template_constants ON template_constants;
DROP TRIGGER IF EXISTS trg_update_token_template_header_fields ON template_header_fields;
DROP TRIGGER IF EXISTS trg_update_token_organization_configs ON organization_configs;
DROP TRIGGER IF EXISTS trg_update_token_expense_categories ON expense_categories;

-- Create DELETE triggers
CREATE TRIGGER trg_delete_token_template_rows
AFTER DELETE ON template_rows
FOR EACH ROW EXECUTE FUNCTION delete_token_on_entity_delete();

CREATE TRIGGER trg_delete_token_template_sections
AFTER DELETE ON template_sections
FOR EACH ROW EXECUTE FUNCTION delete_token_on_entity_delete();

CREATE TRIGGER trg_delete_token_template_row_charges
AFTER DELETE ON template_row_charges
FOR EACH ROW EXECUTE FUNCTION delete_token_on_entity_delete();

CREATE TRIGGER trg_delete_token_template_section_charges
AFTER DELETE ON template_section_charges
FOR EACH ROW EXECUTE FUNCTION delete_token_on_entity_delete();

CREATE TRIGGER trg_delete_token_template_constants
AFTER DELETE ON template_constants
FOR EACH ROW EXECUTE FUNCTION delete_token_on_entity_delete();

CREATE TRIGGER trg_delete_token_template_header_fields
AFTER DELETE ON template_header_fields
FOR EACH ROW EXECUTE FUNCTION delete_token_on_entity_delete();

CREATE TRIGGER trg_delete_token_organization_configs
AFTER DELETE ON organization_configs
FOR EACH ROW EXECUTE FUNCTION delete_token_on_entity_delete();

CREATE TRIGGER trg_delete_token_expense_categories
AFTER DELETE ON expense_categories
FOR EACH ROW EXECUTE FUNCTION delete_token_on_entity_delete();

-- Create UPDATE triggers
CREATE TRIGGER trg_update_token_template_rows
AFTER UPDATE ON template_rows
FOR EACH ROW EXECUTE FUNCTION sync_token_updated_at();

CREATE TRIGGER trg_update_token_template_sections
AFTER UPDATE ON template_sections
FOR EACH ROW EXECUTE FUNCTION sync_token_updated_at();

CREATE TRIGGER trg_update_token_template_row_charges
AFTER UPDATE ON template_row_charges
FOR EACH ROW EXECUTE FUNCTION sync_token_updated_at();

CREATE TRIGGER trg_update_token_template_section_charges
AFTER UPDATE ON template_section_charges
FOR EACH ROW EXECUTE FUNCTION sync_token_updated_at();

CREATE TRIGGER trg_update_token_template_constants
AFTER UPDATE ON template_constants
FOR EACH ROW EXECUTE FUNCTION sync_token_updated_at();

CREATE TRIGGER trg_update_token_template_header_fields
AFTER UPDATE ON template_header_fields
FOR EACH ROW EXECUTE FUNCTION sync_token_updated_at();

CREATE TRIGGER trg_update_token_organization_configs
AFTER UPDATE ON organization_configs
FOR EACH ROW EXECUTE FUNCTION sync_token_updated_at();

CREATE TRIGGER trg_update_token_expense_categories
AFTER UPDATE ON expense_categories
FOR EACH ROW EXECUTE FUNCTION sync_token_updated_at();
