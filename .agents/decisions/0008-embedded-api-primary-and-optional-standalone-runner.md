# ADR-0008: Next.js Embedded API Primary Execution and Purely Optional Standalone Server Runner

- **Status**: Accepted
- **Date**: 2026-10-17
- **Deciders**: Software Architecture Team, Lead Product Engineer
- **Context**: Monorepo Architecture, Next.js App Router, Hono API Runner, Developer Experience, Environment Configuration

---

## Context & Problem Statement

The platform monorepo mounts Hono inside the Next.js App Router via a catch-all route handler (`apps/web/app/api/[[...route]]/route.ts`) using `hono/vercel`. This architecture provides same-origin zero-CORS requests and seamless first-party session cookie sharing between Next.js frontend pages, server components, middleware, and backend API endpoints.

A proposal was evaluated to adopt a "Hybrid Dual-Runner" pattern by introducing a standalone Node server runner (`apps/api/src/server.ts`) using `@hono/node-server`. However:
1. Adding a standard `"dev"` script to `apps/api/package.json` caused Turborepo (`turbo run dev`) to spawn both `apps/web` (port 5002) and `apps/api` (port 3001) simultaneously during local development.
2. Running two concurrent API servers introduced operational confusion, port allocation collisions, and duplicate environment variable stores (`.env` vs `.env.local`).
3. Historical scratch scripts (`seed-archive-permissions.ts`, `debug-draft*.ts`, `seed-types.ts`) lingered in the API repository, creating noise and confusion.

---

## Decision

### 1. Next.js App Router as the Sole Primary Runner
* **Single Dev Process**: Local development (`pnpm dev`) strictly executes `@starter/web` (`next dev --turbo --port 5002`). Next.js remains the primary, authoritative runner for both the frontend application and the embedded Hono API backend.
* **No Auto-Start for Standalone API**: The `"dev"` and `"start"` scripts in `apps/api/package.json` are renamed to `"dev:standalone"` and `"start:standalone"` respectively. Because `turbo.json` targets `dev`, Turborepo bypasses `apps/api` during normal monorepo development.

### 2. Standalone Server Kept as Purely Optional & On-Demand
* **Decoupled Standalone Capability**: The standalone entrypoint (`apps/api/src/server.ts` powered by `@hono/node-server`) and its Docker production configuration (`apps/api/Dockerfile`) are retained for:
  - Dedicated container deployments (e.g., Render, Fly.io, ECS) where running a standalone Node.js microservice is desirable.
  - Native mobile clients (iOS, Android, React Native, Flutter) or external third-party webhooks that require high throughput without Next.js serverless timeouts.
* **Explicit Execution Only**: When standalone execution is needed for testing, engineers explicitly invoke:
  ```bash
  pnpm --filter @starter/api dev:standalone
  ```

### 3. Unified Environment Variable Standards (`.env.local` Only)
* **No Redundant `.env` Files**: Duplicate `.env` files in `apps/api` and `apps/web` are prohibited. Every workspace exclusively maintains a committed `.env.example` template and an uncommitted `.env.local` for local secrets.
* **Strip Client-Only Variables from Backend**: Frontend-only variables (specifically `NEXT_PUBLIC_API_URL`) are removed from `apps/api/.env.example` and `apps/api/.env.local`. The API backend does not call itself via client public URLs.
* **Resilient Env Bootstrapping**: `apps/api/src/env.ts` guarantees that environment variables from `apps/api/.env.local` are loaded before any application or database modules evaluate, with automatic fallback to `apps/web/.env.local`.

### 4. Purge of Scratch and Temporary Scripts
* All one-off database migration and debugging scripts (`apps/api/src/scripts/seed-archive-permissions.ts`, `apps/api/src/debug-draft-update.ts`, `apps/api/src/debug-draft.ts`, `apps/api/seed-types.ts`) are permanently deleted. Permanent schema seeds reside strictly within `packages/db/src/seed-permissions.ts` and `packages/db/src/org-initializer.ts`.

---

## Consequences

### Positive
* **Zero Cognitive Overhead**: Running `pnpm dev` starts only Next.js on port 5002, matching standard team workflow and preventing port conflict errors.
* **Clean File Tree**: No lingering scratch scripts, and a predictable `.env.example` / `.env.local` convention across all workspaces.
* **Future-Proof**: The standalone runner remains fully operational in the codebase and Docker image whenever native mobile or containerization needs arise.

### Tradeoffs & Guardrails
* Developers testing standalone API features must remember to use the dedicated flag (`pnpm --filter @starter/api dev:standalone`) rather than expecting it to spin up automatically via root `pnpm dev`.
