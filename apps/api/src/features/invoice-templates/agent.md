# Invoice Templates

## 1. Core Behavior and Invariants
- The template builder manages the schema that dictates how invoices are structured.
- **Single-Value Row Model:** Rows directly contain their calculation metadata (`valueType`, `formula`, `initialValue`). Sub-components are obsolete.
- **Unified Formula Storage:** Formulas are stored as single expressions referencing row UUIDs via the formula codec (`{{$row:UUID}}` and `{{$row:UUID}}_TOTAL`).
- **Formula Codec (Codec-on-Read / Codec-on-Write):** Stored formulas use immutable row UUIDs. When reading or returning rows to the client, the API decodes UUIDs into current human-readable token names using `buildRowIndex`. When updating/creating, formulas are encoded into UUID form.
- **Label Independence:** The `label` / `parentLabel` field drives human-readable names. Editing or updating `chargeToken` or `rowToken` must NEVER overwrite or mutate labels.
- **Circular Reference Prevention:** A formula for a row or charge cannot reference its own token or its `_TOTAL` variant.

## 2. Data Model and Schema Mapping
- `invoice_templates`: Columns include `id`, `organizationId`, `name`, `documentType`, `scope`, `currency`, `version`, `isArchived`, `optional_rows` (`TemplateOptionalRow[]`).
- `template_rows`: Columns include `id`, `templateId`, `sectionId`, `parentLabel`, `rowToken`, `description`, `valueType` (`normal` | `formula`), `formula`, `initialValue`, `sortOrder`.
- `template_row_charges`: Belongs directly to `template_rows`. Columns include `id`, `rowId`, `label`, `chargeToken`, `formula`, `subDescription`, `qualifier`, `tags`, `sortOrder`.
- `template_sections`: Defines section groupings and tokens (`sectionToken`).
- `template_section_charges`: Utilizes a unified `formula` column referencing section totals (`SEC_<TOKEN>_TOTAL`).

## 3. PBAC Permission Logic
- Standard `invoice_templates:update` is required for all route handlers modifying rows, section charges, or headers.

## 4. Submodule Directory Architecture
The feature is split into domain-focused submodules, each containing its own controllers, unit tests, and dedicated `agent.md`:
- `rows/`: `template-rows.controller.ts`, `template-row-charges.controller.ts`, unit tests, and `rows/agent.md`.
- `sections/`: `template-sections.controller.ts`, `template-section-charges.controller.ts`, unit tests, and `sections/agent.md`.
- `metadata/`: `template-constants.controller.ts`, `template-header-fields.controller.ts`, unit tests, and `metadata/agent.md`.
- `validation/`: `formula-validator.ts`, unit tests, and `validation/agent.md`.
- Root: `invoice-templates.route.ts`, `invoice-templates.controller.ts`, `invoice-templates.test.ts`, `invoice-templates.fixtures.ts`.

## 5. API Surface
- `GET /:templateId/sections/:sectionId/rows`: Returns decoded rows and row charges with `rowIndex` (`idToToken` map).
- `POST /:templateId/sections/:sectionId/rows`: Creates a single-value row and its initial charges.
- `PATCH /:templateId/sections/:sectionId/rows/:rowId`: Updates row values (`valueType`, `formula`, `initialValue`, `parentLabel`, `rowToken`, charges).
- `POST /sections/:sectionId/section-charges`: Accepts unified `formula`.
- `PATCH /sections/:sectionId/section-charges/:chargeId`: Partial update of formula and labels.
- `GET /:id/optional-rows`: Lists prebuilt optional service rows defined for the template.
- `POST /:id/optional-rows`: Adds or appends a prebuilt optional service row to the catalog.
- `DELETE /:id/optional-rows/:rowToken`: Deletes an optional service row from the catalog by its `rowToken`.

## 6. Error States
- 422 Unprocessable Entity: Emitted if a `formula` payload fails mathematical parsing (via `validateFormulaChars` / `math.parse`), contains invalid characters, or attempts a circular reference to itself.
- 409 Conflict: Emitted if a `rowToken` or `chargeToken` already exists in the template.

## 7. Testing
- Test suite is strictly isolated to `@starter/api`. All DB interactions are mocked; a live DB must not be instantiated.
- `makeSelectChain()` / `hoistedChain()` is required for mocking multi-step `db.select()` flows (specifically ownership checks followed by `buildConstantIndex`, `buildRowIndex`, `buildSectionIndex` which consume mock queue slots).
- Tests must be placed in `*.test.ts` files aligned with the specific controller they cover.
- Shared fixtures (`makeCtx`, `makeTemplate`, `makeSection`, etc.) are centralized in `invoice-templates.fixtures.ts`. Avoid inline re-definitions.
- Formula encoding/decoding `decodeFormula` must be asserted in `create` and `update` responses to ensure raw UUID forms do not leak to the client.

## 8. Known Limitations
- `TemplateConstantsController` auth is entirely enforced via the `requireOrgPermission` route-level middleware in `invoice-templates.route.ts`. The controller itself lacks an internal `organizationId` guard. This middleware MUST NEVER be removed without replacing it with an explicit controller-level check.
- `TemplateHeaderFieldsController.deleteHeaderField` returns the deleted field object (e.g. `{ id: '...', templateId: '...', ... }`) rather than the `{ success: true }` standard used by all other delete endpoints in this feature. Tests pin this exact behavior. Changing it to standard will break tests.
- `deleteHeaderField` ownership check filters only by `id` and `templateId` without a join to `invoiceTemplates` to verify `organizationId`. A malicious cross-tenant delete is possible if a valid cross-tenant `templateId` is known (a security gap left unchanged by design in the initial refactor, to be fixed in a later sweep).
- Token validation in `TemplateRowChargesController` uses regex, while `TemplateSectionChargesController` uses `math.parse` AST validation. Both are correct and serve different security surfaces, but the inconsistency is known.
