# Backend AI Agent Directives: Enterprise B2B SaaS

## App Context & Purpose
This is an Enterprise B2B SaaS serving as a central operating system for organizations.
- **Workspaces/Organizations:** The fundamental tenant boundary. Every API must enforce this isolation.
- **Dynamic Entities (JSONB):** Clients and Projects utilize a robust Postgres JSONB custom fields architecture. The backend is responsible for dynamically generating Zod schemas from field definitions to strictly validate all incoming data payloads before saving.
- **PBAC Engine:** Strict Maker/Checker and granular role-based workflows govern operations.
## Core Stack
* Hono (API Framework)
* Drizzle ORM
* PostgreSQL
* Redis (Upstash/Local)
* Better Auth (Server API)

## Architectural Principles
1. **Scale to 100k+:** Proactively design every API route and database schema assuming it will handle 100,000 concurrent users. 
2. **O(log n) Reads:** All critical database queries MUST hit an index. Identify missing composite indexes or B-Tree indexes when designing new tables.
3. **Schema Normalization:** Table names must be plural (e.g., `organizations`, `members`). Never use the Entity-Attribute-Value (EAV) pattern; utilize PostgreSQL's native `JSONB` for dynamic tenant metadata.
4. **The PBAC Engine:** Never trust the client. Every protected route must pass through the `requireOrgPermission(permissionKey: AppPermission | AppPermission[])` middleware using canonical permissions from `@starter/db`. Magic string literals and legacy aliases (e.g. `invoice:create`, `invoice:edit`) are strictly prohibited. Validate the active tenant context (`session.activeOrganizationId`) mathematically against the requested resource.


## Code Quality & Security
1. **Merciless Reviews:** Prioritize finding Big-O performance bottlenecks and OWASP Top 10 vulnerabilities (e.g., IDOR, Privilege Escalation).
2. **Strict DB Boundaries:** Controller functions should never perform raw SQL strings. Utilize Drizzle's typed query builder exclusively.
3. **Defensive Programming:** Use guard clauses for early exits. Validate all incoming JSON payloads before processing.
4. **No Dummy Code:** Provide 100% production-ready code. Do not omit error handling or logging layers for brevity.
5. **Structured Logging (Pino):** Never use `console.*` anywhere in the API. Always import `logger` from `@/infra/lib/logger` (or relative path) and use a child logger (e.g. `const log = logger.child({ module: 'feature-name' })`) to trace errors, warnings, and operations with structured metadata context (like `userId`, `orgId`, `err`).
6. **Explain the WHY:** When writing complex business logic (like PBAC resolution algorithms or maker/checker workflows), comment the code to explain the architectural reasoning, not just the mechanical steps.
7. **Feature Constitutions:** When modifying specific domain features, always consult the feature's localized `agent.md` file:
   - Invoice Templates API: `apps/api/src/features/invoice-templates/agent.md`
   - Invoices & Calculation Engine: `apps/api/src/features/invoices/engine/agent.md`

