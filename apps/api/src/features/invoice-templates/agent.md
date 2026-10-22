# Invoice Templates

## 1. Core Behavior and Invariants
- The template builder manages the schema that dictates how invoices are structured.
- **Archetype Split (`templateType`):** Templates branch cleanly between `"standard"` (project-bound, fixed 4-column formula calculation) and `"general"` (general-purpose, dynamic multi-column spreadsheets with arbitrary data types and custom `cellValues`).
- **Serial-Based Row Resequencing:** Rows are named canonically after their topological sequence: `ROW_1`, `ROW_2`, `ROW_3`, ... Resequencing runs automatically via a two-phase transaction on row creation, reordering, and deletion.
- **Single-Value Row Model:** Rows directly contain their calculation metadata (`valueType`, `formula`, `initialValue`, `cellValues`). Sub-components are obsolete.
- **Unified Formula Storage:** Formulas are stored as single expressions referencing row UUIDs via the formula codec (`{{$tok:UUID}}` and `{{$tok:UUID}}_TOTAL`).
- **Formula Codec (Codec-on-Read / Codec-on-Write):** Stored formulas use immutable row UUIDs. When reading or returning rows to the client, the API decodes UUIDs into current human-readable token names using `buildRowIndex`. When updating/creating, formulas are encoded into UUID form. Renaming row tokens never breaks database formulas.
- **Label Independence:** The `label` / `parentLabel` field drives human-readable names. Editing or updating `chargeToken` or `rowToken` must NEVER overwrite or mutate labels.
- **Circular Reference Prevention:** A formula for a row or charge cannot reference its own token or its `_TOTAL` variant.

## 2. Data Model and Schema Mapping
- `invoice_templates`: Columns include `id`, `organizationId`, `name`, `templateType` (`standard` | `general`), `documentType`, `scope`, `currency`, `version`, `isArchived`, `optional_rows` (`TemplateOptionalRow[]`), `column_definitions` (`TemplateColumnDefinition[]`).
- `template_rows`: Columns include `id`, `templateId`, `sectionId`, `parentLabel`, `rowToken`, `description`, `valueType` (`normal` | `formula`), `formula`, `initialValue`, `cellValues` (JSONB for dynamic column values), `sortOrder`.
- `template_row_charges`: Belongs directly to `template_rows`. Columns include `id`, `rowId`, `label`, `chargeToken`, `formula`, `subDescription`, `qualifier`, `tags`, `sortOrder`.
- `template_sections`: Defines section groupings and tokens (`sectionToken`).
- `template_section_charges`: Utilizes a unified `formula` column referencing section totals (`SEC_<TOKEN>_TOTAL`).

## 3. PBAC Permission Logic
- Standard `invoice_templates:update` (or `template:edit`) is required for all route handlers modifying rows, section charges, or headers.
- Route-level middleware `requireOrgPermission` enforces PBAC before controllers execute.

## 4. Submodule Directory Architecture
The feature is split into domain-focused submodules, each containing its own controllers, unit tests, and dedicated `agent.md`:
- `rows/`: `template-rows.controller.ts`, `template-row-charges.controller.ts`, `resequence-rows.service.ts`, unit tests, and `rows/agent.md`.
- `sections/`: `template-sections.controller.ts`, `template-section-charges.controller.ts`, unit tests, and `sections/agent.md`.
- `metadata/`: `template-constants.controller.ts`, `template-header-fields.controller.ts`, unit tests, and `metadata/agent.md`.
- `validation/`: `formula-validator.ts`, unit tests, and `validation/agent.md`.
- Root: `invoice-templates.route.ts`, `invoice-templates.controller.ts`, `invoice-templates.test.ts`, `invoice-templates.fixtures.ts`.

## 5. API Surface
- `GET /:templateId/sections/:sectionId/rows`: Returns decoded rows and row charges with `rowIndex` (`idToToken` map).
- `POST /:templateId/sections/:sectionId/rows`: Creates a single-value row, auto-resequences row tokens, and returns row with charges.
- `PATCH /:templateId/sections/:sectionId/rows/:rowId`: Updates row values (`valueType`, `formula`, `initialValue`, `parentLabel`, `rowToken`, `cellValues`).
- `DELETE /:templateId/sections/:sectionId/rows/:rowId`: Deletes row and triggers auto-resequencing.
- `PUT /:templateId/sections/:sectionId/rows/reorder`: Reorders rows and triggers topological resequencing (`ROW_1`, `ROW_2`, ...).
- `POST /sections/:sectionId/section-charges`: Accepts unified `formula`.
- `PATCH /sections/:sectionId/section-charges/:chargeId`: Partial update of formula and labels.
- `GET /:id/optional-rows`: Lists prebuilt optional service rows defined for the template catalog.
- `POST /:id/optional-rows`: Adds or appends a prebuilt optional service row to the catalog.
- `DELETE /:id/optional-rows/:rowToken`: Deletes an optional service row from the catalog by its `rowToken`.

## 6. Error States
- 422 Unprocessable Entity: Emitted if a `formula` payload fails mathematical parsing (via `validateFormulaChars` / `math.parse`), contains invalid characters, or attempts a circular reference to itself.
- 409 Conflict: Emitted if a `rowToken` or `chargeToken` already exists in the template.

## 7. Testing
- Test suite is strictly isolated to `@starter/api`. All DB interactions are mocked; a live DB must not be instantiated.
- `makeSelectChain()` / `hoistedChain()` is required for mocking multi-step `db.select()` flows.
- Tests must be placed in `*.test.ts` files aligned with the specific controller they cover.
- Shared fixtures (`makeCtx`, `makeTemplate`, `makeSection`, etc.) are centralized in `invoice-templates.fixtures.ts`.
- Resequencing service tested in `resequence-rows.test.ts` across single-section, multi-section, and 100-row stress test matrices.
