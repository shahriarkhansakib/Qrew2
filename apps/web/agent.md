# Frontend AI Agent Directives: Enterprise B2B SaaS

## App Context & Purpose
This is an Enterprise B2B SaaS application serving as a central operating system for organizations to manage staff, clients, and projects. 
- **Workspaces/Organizations:** The fundamental tenant boundary.
- **Dynamic Custom Fields:** Clients and Projects utilize a robust custom fields architecture driven by the backend. The frontend must parse these field definitions dynamically and render strict `react-hook-form` controls (Shadcn DatePickers, Selects, etc.).
- **PBAC:** UI elements must be strictly gate-kept by the granular `usePermissions()` logic.
## Core Stack
* Next.js 15 (App Router)
* React (latest)
* Tailwind CSS + Shadcn UI
* Zustand (Global Client State)
* TanStack Query (Server State)
* Better Auth (Client SDK)

## Architectural Principles
1. **Server Components by Default:** Assume all components are Server Components. Push `"use client"` directives as far down the render tree to the leaf nodes as possible.
2. **PBAC UI Enforcement:** Never assume access. Use the granular permission engine (e.g., `<Can I="finance:request_funds">`) with strongly-typed `AppPermission` from `@starter/db/permissions-registry` to conditionally render UI elements. Magic strings outside `PERMISSIONS_CATALOG` are banned.

3. **Zero Layout Shift:** UI must be minimalist, premium, and strictly avoid layout jumps. **Absolutely NO layout shifting is permitted anywhere.** Use CSS `visibility: hidden` or `opacity-0 pointer-events-none`, fixed heights, or min-heights instead of conditionally rendering elements that alter the document flow. Use blur-background modals instead of expanding cards when requesting secondary input (like 2FA or passwords).
4. **State Separation:** Zustand is ONLY for ephemeral client state (e.g., sidebar toggles, active tenant ID mirroring). TanStack Query is the exclusive owner of server data caching and invalidation.

## Code Quality & Standards
1. **No Dummy Code:** Never draft "shortcut" or placeholder logic. Write production-ready, ES6+ compliant code from the first iteration.
2. **Type Safety:** Enforce advanced TypeScript. No `any` types. Define interfaces for all component props and API payloads.
3. **Guard Clauses:** Use early returns to prevent deep nesting and improve readability.
4. **Error Handling & Telemetry:** All async operations must use strict `try/catch` blocks. Integrate toast notifications (e.g., Sonner) for user feedback on mutations. Never dump raw errors to `console.log` or `console.error` in production. Instead, utilize the central error boundary or a telemetry SDK wrapper (like Sentry) to trace client-side exceptions silently.
5. **Explain the WHY:** When writing complex logic or using newer React 19/Next.js 15 syntax, add comments explaining *why* this architectural decision was made.

## UI Component Consistency (STRICT)
1. **Reuse Existing Components — Never Drift:** If a UI pattern (button, nav link, tab, card, input) already has a dedicated component in `components/ui/`, you MUST use it. Never create ad-hoc styled `<Link>`, `<button>`, or `<div>` elements that duplicate the visual behavior of an existing component. Example: All navigational links — whether in the sidebar, horizontal tabs, or sub-navigation — MUST use `<SidebarNavLink>` to guarantee identical hover states, active indicators, font sizes, and spacing.
2. **Layout Patterns Must Match Siblings:** When creating a new layout file (`layout.tsx`), always inspect how the sibling layouts in the same route group are structured. Copy the exact same pattern (e.g., `"use client"` + `useSession()` hook, not `async` + `authClient.getSession()`). Never invent a new pattern when an established one exists.
3. **No Phantom Width Constraints:** Never add `max-w-*` or `mx-auto` constraints to layout wrappers unless the design explicitly calls for a narrow content column. Settings and admin pages should fill the available content area defined by the parent `AppShell`.
4. **Feature Constitutions:** When building or refactoring UI for specific domains, always consult the feature's localized `agent.md` file:
   - Invoice Templates Builder: `apps/web/components/features/invoice-templates/agent.md`
   - Invoice Generator & Viewer: `apps/web/components/features/invoices/agent.md`

