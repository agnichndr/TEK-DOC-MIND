# Project Standards: TEK-DOC-MIND (Full-Stack Next.js)

## 1. Tech Stack & Architecture
- **Framework:** Next.js (App Router, React Compiler enabled, `src/` directory)
- **Language:** TypeScript (Strict mode enabled)
- **Styling:** Tailwind CSS
- **Database & Auth:** Supabase PostgreSQL and Row Level Security; the current
  accountless Project Vault uses the project-session model documented in
  `Auth.md`. Supabase Auth is reserved for future individual user identity.
- **Frontend Paradigm:** React Server Components (RSC) by default. Add `'use client'` at the top of files ONLY when state, hooks, or event listeners are required.
- **Backend Paradigm:** Next.js Route Handlers (`src/app/api/.../route.ts`), Server Actions (`src/actions/`), and Supabase Client (`@supabase/ssr`).
- **Data Layer:** Business logic and database operations MUST live in `src/services/`. Keep Route Handlers and Server Actions lean.

## 2. Directory Layout & Boundaries
- `src/app/` -> App Router (Pages, layouts, and backend API endpoints).
- `src/actions/` -> Server Actions (Backend mutation layer).
- `src/components/` -> Frontend UI (`ui/` for primitives, `forms/` for user inputs).
- `src/services/` -> Business logic & Supabase database queries (Backend).
- `src/types/` -> Zod schemas, DB table types (`database.types.ts`), and TypeScript interfaces.
- `src/lib/supabase/` -> Supabase SSR client initializers (`client.ts`, `server.ts`, `middleware.ts`).
- `src/lib/` -> Validated env configs (`env.ts`) and shared utility functions.
- `src/__tests__/` -> Unit, integration, and security/RLS test suites.

## 3. Security-First Design Guardrails (CRITICAL)
1. **Row Level Security (RLS) Always On:** EVERY PostgreSQL table created in Supabase MUST have Row Level Security enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`). Never create public tables without explicit policy definitions.
2. **Never Expose Service Role Key:**
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` is for public/client operations (restricted by RLS).
   - `SUPABASE_SERVICE_ROLE_KEY` is for administrative tasks ONLY and MUST never be used in client components or sent to the browser.
3. **Input Sanitization & Validation:** Validate ALL incoming data (API Route parameters, request bodies, Server Action inputs) using **Zod schemas** in `src/types/` before passing data to Supabase queries or services.
4. **Authentication & Authorization Verification:**
   - Treat every exported Server Action and Route Handler as an
     internet-reachable endpoint. UI visibility, React Server Components, and
     `server-only` imports are not authorization controls.
   - For the current accountless Project Vault, read the opaque project session
     from the HTTP-only cookie, verify it on the server, and derive `project_id`
     from the matching unexpired database session.
   - If individual user authentication is introduced, verify identity with
     `supabase.auth.getUser()` on the server and load membership/roles from
     trusted database state.
   - Never trust client-provided `userId`, `projectId`, tenant, role, or
     ownership claims. Resource identifiers must also be constrained to the
     verified session's project.
   - Enforce project or tenant scope again inside every protected database RPC;
     a service-layer pre-check is not sufficient.
5. **Environment Variable Security:** Never access raw `process.env`. Access environment variables strictly through validated `@/lib/env`.
6. **Error Leakage Prevention:** Catch internal database or system errors and return sanitized generic error messages to the client. Log detailed traces only on the server.

## 4. Coding & Architecture Guardrails
1. **Zero Type Guessing:** Regenerate Supabase TypeScript types (`database.types.ts`) whenever the schema changes. Use typed Supabase clients everywhere.
2. **Absolute Imports:** Always use `@/` path aliases (`@/components/...`, `@/lib/...`, `@/services/...`).
3. **No Legacy Patterns:** Do NOT use Pages Router (`pages/`), `getServerSideProps`, or `getStaticProps`.

## 5. Living Documentation & Domain Tracking Protocol (MANDATORY)

### A. Smart Update Triggers (Delta Update Rules)
Do NOT rewrite or bloat documentation for trivial edits.
- **MUST UPDATE Docs when:**
  - Creating a new feature module or business capability.
  - Adding or modifying database schemas, Supabase RLS policies, or migrations.
  - Changing API contracts (Zod schemas, Route Handlers, Server Actions).
  - Changing authentication or authorization architecture, identity providers,
    project tenancy, memberships, roles, session cookies, credential handling,
    protected Server Actions or Route Handlers, RLS policies, database
    privileges, or `SECURITY DEFINER` RPCs. These changes MUST update both
    `Architecture.MD` and `Auth.md` in the same change.
  - Introducing third-party services, global providers, middleware, or state stores.
- **SKIP Docs update when:**
  - Refactoring internal logic without changing public signatures or contracts.
  - Fixing minor bugs, styling with Tailwind, or adjusting copy/UI layout.

---

### B. `Architecture.MD` Maintenance Rules (System & Domain Level)
- **Initialization:** If `Architecture.MD` is missing in the root directory, create it immediately.
- **Domain Context:** Always anchor updates to the project's core business domain (e.g., Document Management, AI Workflows, Workspace Auth).
- **Required Sections to Maintain:**
  1. **System Overview & Core Domain:** High-level purpose and key architectural paradigms (RSC, Supabase SSR).
  2. **Security & Trust Boundaries:** RLS enforcement model, Auth session lifecycle, sensitive key handling.
  3. **Data Flow Topology:** How requests flow (Client -> Server Action / Route Handler -> Zod -> Service -> Supabase).
  4. **External Integrations:** List of third-party APIs, AI providers, or cloud services.

---

### C. `Auth.md` Maintenance Rules (Authentication & Authorization)
- **Initialization:** If `Auth.md` is missing in the application root, create it
  immediately.
- **Authority:** Treat `Auth.md` as the detailed source of truth for identity,
  authentication, authorization, sessions, tenant isolation, exposed backend
  surfaces, database enforcement, credential handling, security invariants,
  known limitations, and required negative tests.
- **Coordinated Updates:** Any change to authentication or authorization MUST
  update both `Auth.md` and the Security & Trust Boundaries/Data Flow sections
  of `Architecture.MD`. Update affected module documentation when its contract
  also changes.
- **No Aspirational Claims:** Clearly separate current protections, known gaps,
  and future migration designs. Never document a proposed control as already
  implemented.

---

### D. `Module.MD` Maintenance Rules (Functional & Bounded Context Level)
- **Initialization:** If `Module.MD` is missing in the root directory, create it immediately.
- **Domain Mapping:** Organize code into clear **Bounded Contexts / Functional Modules** (e.g., `Auth Module`, `Document Engine Module`, `Billing Module`).
- **Required Structure for Each Module:**
  ```markdown
  ### [Module Name] (e.g., Document Management)
  - **Business Purpose:** High-level functional goal of this module.
  - **Data Contracts & Schemas:** Zod schemas in `src/types/` and Supabase DB tables/RLS policies.
  - **Backend Layer:**
    - Services: `src/services/...`
    - API Routes / Actions: `src/app/api/...` or `src/actions/...`
  - **Frontend Layer:**
    - Pages: `src/app/...`
    - Components: `src/components/...`
  - **Cross-Module Dependencies:** Other modules or shared utilities this feature relies on.

## 6. Quality Control, Testing & Verification
- **Type Safety Check:** Run `npx tsc --noEmit` to verify type compliance across server and client code.
- **Linting:** Run `npm run lint` before completing multi-file modifications.
- **Testing Standard:**
  - Write unit and service tests in `src/__tests__/`.
  - Validate that unauthorized requests to Route Handlers or Server Actions return `401 Unauthorized` or `403 Forbidden`.
- **Self-Correction Rule:** After completing code or architectural changes,
  verify that `Architecture.MD`, `Auth.md`, and `Module.MD` exist and that every
  document triggered by the change has been updated.
