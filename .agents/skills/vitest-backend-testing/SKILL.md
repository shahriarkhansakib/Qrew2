---
name: vitest-backend-testing
description: Write rigorous Vitest backend integration tests for the Next.js/Hono/Drizzle B2B SaaS monolith using a real ephemeral PostgreSQL database, isolated multi-tenant PBAC contexts, database-integrity assertions, and exhaustive Invoice Formula Engine edge-case coverage.
---

# Vitest Backend Testing (Hono + Drizzle + Postgres)

You are writing integration tests for a strict TypeScript B2B SaaS monolith built with Hono, Drizzle ORM, and PostgreSQL. Correctness bugs here mean **money moving incorrectly between tenants**. Treat every test file as a legal contract about what the system guarantees.

## Guidelines

### 1. Never mock the database
`vi.mock('@starter/db')` (or any equivalent) is strictly banned. Drizzle's query builder produces SQL whose correctness (join conditions, `.where()` scoping, `ON CONFLICT` behavior) can only be verified against a real Postgres engine.
- Expect an ephemeral Postgres instance to be available via Testcontainers or local Docker.
- Never assert against Drizzle's generated query object. Assert against **rows actually persisted**, fetched with a fresh, independent query.

### 2. Every test file seeds its own isolated tenant context
This platform is multi-tenant with PBAC (Permission-Based Access Control). Reusing a shared "global" seeded organization is a latent tenant-isolation bug waiting to happen.
- In `beforeEach` (not `beforeAll`), seed at minimum **two** organizations: the org under test and a "foreign" org.
- Seed users with the specific PBAC roles/permissions required (e.g., `inventory:manage_brands`) using the system's seeding helpers.
- Tear down or roll back after every test. Do not rely on test execution order.

### 3. Formula engine tests (`features/invoices/engine/**`) need domain-specific coverage
The AST formula engine is a DAG evaluator with topological sort (Kahn's Algorithm) over `BigNumber` values. Every engine test suite must include:
- **Cycle detection:** Construct a forward reference cycle (`A depends on B`, `B depends on A`) and assert the engine throws a specific `CyclicDependencyError`. This prevents Vercel Serverless timeout crashes.
- **Division by zero:** Assert a controlled domain error (e.g., `DivisionByZeroError`), not `Infinity` or `NaN`.
- **Precision:** Never compare outputs with `===` on floating points. Compare `BigNumber` values with `.isEqualTo()` to prove no precision loss.

### 4. Verify persisted database integrity & transactional locks
For inventory/ledger mutations, the controller's HTTP return value can be correct while the database is wrong (e.g., a partial transaction).
- After calling a mutation, run an independent `SUM(quantity)` query against the ledger table and assert it matches the expected total.
- Test concurrent ledger operations using `Promise.all()` to enforce Drizzle `FOR UPDATE` row-level locks and prevent race conditions.

### 5. Tenant isolation and PBAC are first-class test subjects
For every mutation/query:
- Attempt the operation as a user from the "foreign" org against the target org's resource ID. Assert a 403/404 (zero rows returned).
- Attempt the operation as a user who lacks the specific PBAC permission and assert a 403 using the exact permission key.

## Anti-Patterns
- **Database Mocking:** Reject `vi.mock('@starter/db')` outright.
- **Shared Contexts:** Sharing one seeded organization across the file via `beforeAll` masks tenant-isolation bugs.
- **Fake Ledger Assertions:** Stopping at `expect(response.balance).toBe(80)` instead of querying Postgres to verify the real aggregate.
- **Error-Only Assertions:** Asserting `expect(...).toThrow()` without specifying the exact Error class (e.g., `.toThrow(CyclicDependencyError)`).

## Example Test

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BigNumber from 'bignumber.js';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@starter/db';
import { inventoryTransactions } from '@starter/db/schema';
import { evaluateFormulaGraph } from '../engine';
import { seedTenantContext, seedForeignContext, cleanup } from '../../../test/seed';

describe('Inventory + Invoice Engine Integration', () => {
  let tenant: any, foreignTenant: any;

  beforeEach(async () => {
    tenant = await seedTenantContext({ permissions: ['inventory:manage'] });
    foreignTenant = await seedForeignContext();
  });

  afterEach(async () => {
    await cleanup(tenant.orgId, foreignTenant.orgId);
  });

  it('preserves exact decimal math and detects DAG cycles', async () => {
    // 1. Precision check
    const precise = evaluateFormulaGraph({
      rows: [
        { id: 'subtotal', expression: '0.1 + 0.2' },
        { id: 'tax', expression: 'subtotal * 0.15' },
      ],
    });
    // Native JS: 0.1 + 0.2 = 0.30000000000000004
    expect(new BigNumber(precise.subtotal).toFixed(2)).toBe('0.30');

    // 2. Cycle detection (Kahn's Algorithm)
    expect(() =>
      evaluateFormulaGraph({
        rows: [
          { id: 'a', expression: 'b + 1' },
          { id: 'b', expression: 'a + 1' },
        ],
      }),
    ).toThrowError('CyclicDependencyError: Detected cycle at node b');
  });

  it('commits isolated inventory ledger transactions and locks', async () => {
    await tenant.inventory.receiveStock({ itemId: 'item-1', quantity: 100 });
    await tenant.inventory.issueStock({ itemId: 'item-1', quantity: 20 });

    const [aggregate] = await db
      .select({ quantity: sql<string>`sum(${inventoryTransactions.quantity})` })
      .from(inventoryTransactions)
      .where(and(
        eq(inventoryTransactions.organizationId, tenant.orgId),
        eq(inventoryTransactions.itemId, 'item-1')
      ));

    // WHY: Verify the real aggregate after mutation, not just the API response
    expect(aggregate.quantity).toBe('80');
  });

  it('strictly isolates data from foreign tenants', async () => {
    await expect(
      tenant.inventory.updateItem({
        organizationId: tenant.orgId,
        itemId: foreignTenant.knownItemId, // Attempt cross-tenant mutation
      }),
    ).rejects.toThrow(/not found|forbidden/i);
  });
});
```
