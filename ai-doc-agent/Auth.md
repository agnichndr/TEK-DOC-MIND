# TEK-DOK-MIND Authentication and Authorization

## Purpose and Authority

This document is the source of truth for the application's authentication,
authorization, session, tenant-isolation, and credential-handling model. It
describes the protections that exist today, the invariants future backend
features must preserve, and the known limitations of the current accountless
Project Vault.

`Architecture.MD` summarizes the system-wide trust boundaries. This document
owns the detailed security contract. Any authentication or authorization change
must update both files in the same change.

## Current Identity and Access Model

TEK-DOK-MIND does not currently have individual user accounts, Supabase Auth
users, project memberships, or roles. A project ID and project password are
shared project credentials:

- **Authentication:** proving knowledge of both credentials creates a project
  session.
- **Authorization:** a valid, unexpired project session grants access to the
  single project bound to that session.
- **Authority level:** every holder of the shared credentials has the same
  project-wide authority, including connecting repositories and deleting
  project resources.

The project ID is a high-entropy identifier as well as one half of the shared
credential pair. It is not a substitute for authorization. Database row UUIDs,
repository IDs, project names, and other client-provided identifiers never
establish access.

## Exposed Surfaces and Trust Boundaries

The browser and every value it submits are untrusted. Code placement does not
make a backend operation private:

- Exported Next.js Server Actions are network-reachable POST operations even
  though they are not conventional `/api/...` REST routes.
- Future Next.js Route Handlers are also network-reachable.
- Supabase REST RPC functions granted to `anon` or `authenticated` are
  reachable from the public internet using the public anon key.
- The Supabase anon key identifies the application role; it is not an
  authorization secret and does not identify a project.
- Service and database modules marked `server-only` prevent accidental client
  bundling, but callers still require explicit authorization at the network and
  database boundaries.

The application therefore uses defense in depth:

```text
Untrusted browser
  -> Server Action or Route Handler
  -> schema validation
  -> server-only service
  -> session-authorized Supabase RPC
  -> project_id derived from the session
  -> forced-RLS table
```

No custom `src/app/api/**/route.ts` endpoints exist at present.

## Credential and Session Lifecycle

### Project creation

1. The Server Action validates the name, description, and password with Zod.
2. The service generates a project ID containing 64 bits of cryptographic
   randomness.
3. Only the SHA-256 digest of the project ID is sent for persistence.
4. PostgreSQL hashes the password with bcrypt and a unique salt through
   `pgcrypto`.
5. The plaintext project ID is returned once to the creating browser. It is not
   stored in a URL or browser persistence by the application.

Project creation is intentionally public and does not create a logged-in
session.

### Project access

1. The Server Action validates the project ID and password.
2. The service generates a random 256-bit opaque session token before calling
   the credential-verification RPC.
3. The RPC verifies the project ID digest and bcrypt password.
4. On success, PostgreSQL stores only the SHA-256 digest of the session token,
   associates it with the matched project UUID, and sets a 12-hour expiry.
5. The browser receives the plaintext session token in a cookie configured as
   `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production.

Invalid project IDs and passwords return the same generic response. The
plaintext password and session token must never be logged, returned in action
state, placed in URLs, or stored in client-readable persistence.

### Session use

Protected application operations read the opaque token from the HTTP-only
cookie. Services hash it before sending it to Supabase. A database RPC must:

1. Find an unexpired `project_sessions` row by token digest.
2. Derive the authoritative `project_id` from that row.
3. read or mutate only rows joined or constrained to that `project_id`.

A caller-supplied project UUID must never replace this derivation. A resource
UUID supplied by the caller is only a lookup value and must also be constrained
to the session-derived project.

### Logout, expiry, and revocation

Logging out deletes the matching server-side session and then removes the
browser cookie. An expired session cannot authorize an RPC even if the browser
still sends its cookie. Sessions expire after 12 hours and are not refreshed or
rotated automatically.

Deleting a project cascades to its sessions, repositories, repository groups,
and LLM connector summaries. Logout revokes only the current session; there is
currently no
interface to list or revoke all other sessions without deleting the project.

## Authorization Rules by Operation

| Operation | Required authority | Database scope |
| --- | --- | --- |
| Create project | Public, validated input | Creates a new project only |
| Create project session | Correct project ID and password | Session is bound to the matched project |
| Read workspace | Live project session | Project joined through the session |
| List repositories | Live project session | Repositories joined through the session project |
| Add repository | Live project session | Insert uses the session-derived project |
| Update repository purpose | Live project session and validated repository ID/purpose | Repository ID must belong to the session-derived project; identity and credential columns are not writable through this RPC |
| Retrieve repository secret | Live project session | Repository ID must belong to the session project |
| Delete repository | Live project session and exact-name confirmation | Repository ID and name must match inside the session project; deletion is blocked while a project repository group references it |
| Delete project | Live project session and exact-name confirmation | Only the session project can be deleted |
| Browse repository branches/content | Live project session and validated repository, branch, and relative path | Repository is resolved inside the session project; stored PAT is decrypted only server-side |
| List/save/delete repository groups | Live project session and validated group input | Group, every repository entry, and bounded typed path selection must belong to the session project; all-repositories mode is resolved from current project repositories and their trusted default branches |
| Discover/verify/save/recheck LLM connector | Live project session and valid connector input, or an existing encrypted connection | Same-origin credential routes verify the session before outbound access; ciphertext, selected default model, and a non-secret summary are scoped to the session project and upserted once per provider |
| Delete LLM connector | Live project session and validated connector type | The RPC derives the project from the session and deletes only that project's matching connector; dependent project agents are deleted atomically by the composite foreign-key cascade |
| Discover models for an agent | Live project session and a validated connector identifier | The same-origin route resolves the connector inside the session-derived project, decrypts its credential only on the server, and returns only sanitized provider model metadata |
| List/save/delete project agents | Live project session and validated agent input | Agent rows are joined or mutated only through the session-derived project; connector/model references must use a connector saved in that project, and output behavior/type must match database-enforced values |
| Logout | Current session token, when present | Deletes only the matching session |

Exact-name confirmation reduces accidental destructive actions; it is not an
authorization control. The live project session remains mandatory.

## Database Enforcement

The database is the final project-isolation boundary:

- Row Level Security is enabled and forced on `projects`, `project_sessions`,
  `repositories`, `project_repository_groups`, `project_llm_connectors`, and
  `project_agents`.
- Direct table privileges are revoked from `anon` and `authenticated`.
- No permissive client table policies provide an alternate data path.
- Narrow `SECURITY DEFINER` functions are the intended public database
  interface.
- Security-definer functions set an empty `search_path` and fully qualify
  referenced objects.
- Function execution is revoked from `public` and granted only for the explicit
  signatures required by the application.
- Protected functions validate session expiry and bind all resource access to
  the session's project.
- Validation constraints are repeated in PostgreSQL where practical.

RLS alone does not authorize these operations because security-definer
functions can execute with their owner's privileges. The project checks inside
every protected function are mandatory and must be tested directly.

## Repository Credential Protection

Private GitHub personal access tokens are separate from project authentication:

- GitHub must confirm repository access and Contents read permission before a
  token is accepted.
- Tokens are encrypted server-side with AES-256-GCM.
- Repository identity is authenticated as additional data, binding ciphertext
  to the repository UUID.
- Supabase stores ciphertext, nonce, authentication tag, and key version, never
  the plaintext token.
- `GITHUB_TOKEN_ENCRYPTION_KEY_V1` remains in the server or deployment secret
  manager and is never exposed to the browser or stored in Supabase.
- Secret retrieval requires both a live project session and a repository that
  belongs to that project. Decryption occurs only in a server-only service.
- Public repositories do not persist a GitHub credential.

The Supabase anon key is public configuration. A Supabase service-role key is
not currently required and must never be shipped to the client.

## Project LLM Connector Credential Boundary

Project connector credentials are encrypted independently from repository
credentials:

- A project can register multiple provider types. The
  `(project_id, connector)` primary key permits only one saved connection for a
  given provider, so a newly verified credential replaces that provider row.
- Secret fields use React memory only while being entered. Credential-bearing
  requests use JSON Route Handlers rather than Server Actions so Next.js
  development action tracing cannot print submitted arguments. Every mutation
  route rejects missing or cross-origin `Origin`/`Host` pairs before processing
  credentials.
- Every provider uses a staged flow: validate the credential and list its
  visible models, choose a default model, retrieve or query availability for
  that exact model, then explicitly establish the connection. Establishment
  repeats the model check before AES-256-GCM encryption and persistence, so a
  stale or client-tampered intermediate result cannot authorize a save.
- Supabase stores ciphertext, a unique nonce, authentication tag, key version,
  and a safe summary. `LLM_CONNECTOR_ENCRYPTION_KEY_V1` stays in the server or
  deployment secret manager and is never exposed to the browser or Supabase.
- The session-scoped save RPC upserts through the named
  `project_llm_connectors_pkey` constraint. This avoids collisions between the
  `connector` table column and the function's `RETURNS TABLE` output variable
  without weakening session-derived project scope or function grants.
- `/api/llm-connectors/models`, `/model-access`, and `/establish` validate their
  Zod contracts, read the HTTP-only project-session cookie, and call
  `getProjectWorkspace` before any provider request. Missing and expired
  sessions cannot initiate checks.
- Opening the Connectors tab invokes `checkSavedLlmConnectorsAction`. It
  verifies the session, loads only rows joined through that session's project,
  decrypts and revalidates each payload server-side, and repeats the provider
  check. The browser receives safe summaries or sanitized error messages only.
- The verification service applies a 10-second timeout and one attempt. Provider
  hosts are fixed, while Azure hostnames, AWS regions, and Google
  project/location identifiers are strictly validated before use.
- OpenAI, Anthropic, Gemini, Azure OpenAI, and Vertex use fixed-host model
  metadata endpoints. Bedrock uses signed control-plane model-list and
  availability commands. These checks do not submit inference prompts.
- Results contain only safe model metadata or connector type, authentication
  method, selected default model, connected status, verification time, and
  applicable non-secret cloud metadata. Provider bodies and submitted secrets
  are not logged or returned. Missing server encryption configuration returns a
  sanitized setup error and never falls through as a provider failure.
Editing connection fields does not overwrite the saved credential. Only a
successful establishment atomically replaces that provider's ciphertext and
summary; a failed replacement leaves the prior saved connection intact.
“Connected” proves credential validity and metadata access to the selected
model. It does not perform billable inference and therefore does not prove
inference quota or future availability.

## Project Agent Authorization and Skills Storage

- `saveProjectAgentAction` and `deleteProjectAgentAction` validate all input,
  read the HTTP-only project session, and pass only validated values to the
  server-only agent service.
- Agent RPCs derive `project_id` from the unexpired session. Client-provided
  project or tenant identifiers are not accepted.
- `project_agents` has forced RLS and no direct `anon` or `authenticated` table
  privileges. Narrow security-definer RPCs are its only public database surface.
- The composite `(project_id, connector)` foreign key requires the selected LLM
  connector to belong to the same project. Deleting a connector cascades only
  to agents with the same project/connector pair, so the credential row and its
  now-invalid dependent agents are removed in one database transaction.
- Skills Markdown is application content, not an authentication secret. It is
  stored as bounded PostgreSQL `text` so agent metadata and instructions commit
  atomically and inherit the same project authorization boundary.
- Agent output behavior (`single` or `multiple`) and output type (`text`, `json`,
  or `image`) are validated at the Server Action and repeated as PostgreSQL
  checks inside the session-scoped save RPC. Existing agents migrate to
  `single` plus `text`.
- `.md` import reads the selected local file in browser memory, enforces file
  type/size limits, and submits only text through the validated save action. No
  storage bucket, public object URL, or secondary storage policy is introduced.
- If skills later become multi-file packages, large reference collections, or
  binary assets, private object storage should hold those objects while the
  database retains project-scoped metadata, hashes, ordering, and ownership.

## Mandatory Rules for Future Changes

Every new or changed Server Action, Route Handler, service, table, or RPC must
preserve these invariants:

1. Treat the entry point and all input as public and attacker-controlled.
2. Validate external input with a schema before invoking business logic.
3. Read authentication credentials from trusted server request context, never
   from a client-provided `userId`, `projectId`, role, or ownership claim.
4. Verify the session before performing protected work. Do not rely on a page
   redirect, hidden UI, React Server Component, or `server-only` import for
   authorization.
5. Derive tenant scope from the verified identity or session and apply it in
   every read, insert, update, delete, and secret lookup.
6. Enforce tenant scope again in the database. A service-layer pre-check is not
   sufficient for a security-definer RPC.
7. Enable and force RLS on every new application table, revoke unintended table
   privileges, and explicitly review all policies and function grants.
8. Use an empty `search_path` and qualified object names in every
   security-definer function.
9. Return sanitized failures to clients and keep credentials and database
   details out of responses and logs.
10. Add negative authorization tests before exposing the operation.

If individual user authentication is introduced, protected server entry points
must verify the user with `supabase.auth.getUser()` or an equivalently
authoritative server-side identity check. Project membership and role must then
be loaded from trusted database state; neither replaces resource-to-project
scoping.

## Required Security Tests

For every protected operation, integration tests should create at least two
projects and verify:

- no cookie or token cannot read or mutate protected data;
- a random, malformed, revoked, or expired session cannot authorize access;
- a valid Project A session cannot read Project B workspace or repositories;
- a valid Project A session cannot mutate or delete a Project B resource even
  when given its real UUID and name;
- a caller-supplied project or user identifier cannot override session scope;
- direct `anon` table reads and writes remain denied;
- RPC overloads and grants expose only intended function signatures;
- secret-returning operations never include plaintext credentials in client
  responses, action state, or logs.

Static migration tests are useful guardrails but do not replace executing these
cross-project cases against PostgreSQL with the applied migrations.

## Known Limitations and Non-Guarantees

- Shared project credentials do not identify a person and provide no owner,
  editor, or viewer roles.
- Anyone who learns the project ID and password can create a new full-access
  session. Changing or centrally revoking the shared credentials is not
  currently supported.
- Login and project creation currently have no application rate limiting,
  progressive delay, lockout, or abuse monitoring.
- The 12-hour session is a bearer credential. Theft of the cookie grants the
  same authority until logout, expiry, or project deletion.
- `SameSite=Lax` and framework request protections reduce common cross-site
  request risks, but new deployment proxies, domains, and state-changing entry
  points still require an explicit CSRF review.
- Repository security tests currently inspect migration text rather than
  proving cross-project isolation against a running database.
- Repository files describe intended database state; deployed security also
  depends on every migration being applied and obsolete functions or grants
  being removed.
- Saved connector credentials are reusable server-side, but encryption-key
  rotation and provider-specific refresh-token flows are not yet implemented.

These limitations must not be described as implemented protections in product
copy or architecture documentation.

## Path to Individual User Authorization

If the product needs personal accountability or differentiated access, migrate
to Supabase Auth plus a project-membership model:

1. Authenticate a user and verify the server identity with
   `supabase.auth.getUser()`.
2. Store project membership and role in database tables protected by RLS.
3. Derive the user ID from the verified JWT and the project from trusted
   membership state.
4. Define explicit owner, editor, and viewer permissions for every operation.
5. Decide how existing shared project credentials are retired, converted into
   invitations, or supported during a bounded compatibility period.
6. Add audit events and user/session revocation appropriate to destructive and
   secret-accessing operations.

That migration changes the authentication and authorization architecture and
therefore requires coordinated updates to this document, `Architecture.MD`,
database policies, tests, and affected module documentation.
