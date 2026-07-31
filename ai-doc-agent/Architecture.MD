# TEK-DOK-MIND Architecture

## System Overview & Core Domain

TEK-DOK-MIND is a technical-documentation agent built with the Next.js App
Router, React Server Components, strict TypeScript, and Tailwind CSS. Its initial
Project Vault capability lets anyone create and later access a private project
using two independent credentials: a high-entropy project ID and a password.
An authenticated project workspace connects one or more GitHub repositories as
source material, with a purpose recorded for each source.

Pages and layouts remain React Server Components. Interactive forms are isolated
client components, while validation, project ID generation, credential hashing,
GitHub access verification, token encryption, and persistence remain server-side
concerns.

The project workspace owns four resource collections: repositories, reusable
repository groups, verified LLM connectors, and project agents. A repository group can contain
any combination of repository entries. Each entry chooses a branch, then uses
custom GitHub-populated branch dropdown and an on-demand browser to select the
whole repository, a folder, one file, or multiple files. Groups can alternatively
use All project repositories mode, which dynamically resolves every current
repository at its default branch. Each selected scope can also carry logical
context that explains how downstream workflows should interpret that source.
Each project can store connections for multiple LLM providers, with exactly one
connection per provider. Provider credentials are encrypted at project scope;
credential-free summaries remain the only connector data returned to the
browser.
Project agents combine a name, description, one connector, a provider model or
deployment identifier, a single- or multiple-output behavior, a text, JSON, or
image output type, and a bounded Markdown skills document. Output configuration
and skills remain relational data because they are edited and versioned with the
agent as one transactional unit; object storage is reserved for future
multi-file or binary agent assets.

## Security & Trust Boundaries

`Auth.md` is the authoritative detailed specification for authentication,
authorization, project isolation, sessions, and credential handling. This
section summarizes those boundaries at the system level.

- The browser submits untrusted `FormData` to Server Actions.
- Server Actions are network-reachable POST operations even though they are not
  conventional REST routes. Supabase RPCs granted to `anon` are also publicly
  reachable. Neither source-code location nor a `server-only` import is an
  authorization boundary.
- Zod validates and normalizes every project creation and access field before
  the service layer is called. Equivalent constraints are repeated in
  PostgreSQL as defense in depth.
- A project ID contains 64 bits of cryptographic randomness. The plaintext ID
  is returned once after creation; only its SHA-256 digest is persisted.
- PostgreSQL `pgcrypto` hashes passwords with bcrypt and a unique salt. Neither
  credential is stored in plaintext or returned by an access request.
- Successful password verification creates a random 256-bit project session.
  Only its SHA-256 digest is stored; the browser receives the original in a
  12-hour, HTTP-only, SameSite cookie.
- Row Level Security is enabled and forced on `projects`, `project_sessions`,
  `repositories`, `project_repository_groups`, `project_llm_connectors`, and
  `project_agents`.
  The `anon` and `authenticated` roles have no direct table privileges or
  policies.
- Narrow `SECURITY DEFINER` RPC functions are the only public database surface.
  They use an empty `search_path`, validate inputs, and return only non-sensitive
  fields. Protected RPCs derive `project_id` from an unexpired project session;
  they never trust a caller-provided tenant identifier.
- Repository and project deletion RPCs require an unexpired project session and
  an exact server-checked resource-name confirmation. Project deletion relies on
  foreign-key cascades to remove its repositories, encrypted credentials,
  project resource configurations, and sessions atomically.
- Private GitHub tokens are accepted only after GitHub confirms both repository
  metadata and Contents read access. Tokens are encrypted in the application
  with AES-256-GCM and repository-bound authenticated data. Supabase stores only
  ciphertext, a unique nonce, authentication tag, and key version. The
  `GITHUB_TOKEN_ENCRYPTION_KEY_V1` key stays in the server/deployment secret
  manager and is never stored in Supabase or exposed to the browser.
- Public repositories do not persist a GitHub credential.
- LLM credentials cross the network only in same-origin protected JSON Route
  Handler requests, avoiding Next.js development Server Action argument logs.
  Each handler validates connector input and the active project session before
  any outbound request. Every provider credential first discovers visible
  models, then verifies the chosen model, and is persisted only after an explicit
  establishment request repeats that verification. AES-256-GCM encrypts the
  validated connection and default model as one authenticated payload. Supabase
  stores only its ciphertext, nonce, authentication tag, and key version beside
  a safe summary containing the selected model.
  `LLM_CONNECTOR_ENCRYPTION_KEY_V1` stays server-side. The table primary key
  `(project_id, connector)` permits multiple providers per project and only one
  connection for each provider.
- Connector checks use a 10-second timeout and no retries. Fixed provider hosts
  plus strict Azure endpoint, AWS region, and Google identifier validation
  prevent user-controlled outbound destinations. Results expose only safe
  connector and non-secret cloud metadata.
- The Supabase anon key is used only by server-side code through validated
  `@/lib/env`; the service-role key is neither required nor used.
- Invalid credentials deliberately produce one generic message to prevent
  revealing whether a project exists. Detailed integration failures are logged
  only on the server.
- Project resource updates pass through protected Server Actions and
  session-authorized `SECURITY DEFINER` RPCs. Each RPC derives the project from
  the live session, and group entries are constrained to repositories in that
  project.
- Agent writes use the same protected action and RPC boundary. PostgreSQL
  derives the project from the session and requires the chosen connector to be
  present in that project through a composite foreign key. Removing a connector
  atomically cascades to agents that depend on it, preventing invalid agent
  references from blocking credential deletion or surviving it. Agent Markdown
  is bounded to 200,000 characters, and output behavior/type are constrained
  to explicit enums, in both Zod and PostgreSQL.

The project-password and short-lived project-session flow is the domain
authentication mechanism for this accountless module, so it does not rely on a
Supabase Auth user session. It provides project isolation, not individual user
identity, membership, or roles.

## Data Flow Topology

All flows begin at an internet-reachable boundary. Authorization is enforced by
the project session and repeated in project-scoped database RPCs, not by keeping
the action in the same Next.js application.

### Create

`Client form -> Server Action -> Zod -> Project service -> random project ID +
SHA-256 -> typed Supabase RPC -> PostgreSQL bcrypt hash -> RLS-protected table`

After insertion, the action returns the plaintext project ID only to the
originating browser state. It is presented in a dismissible, one-time dialog and
is not placed in a URL or persistent browser storage.

### Access

`Client form -> Server Action -> Zod -> Project service -> SHA-256 project ID +
random session -> typed Supabase RPC -> constant credential checks -> HTTP-only
session cookie -> protected project page`

### Add GitHub Repository

`Protected client form -> Server Action -> Zod -> project-session verification
-> unauthenticated GitHub lookup -> optional fine-grained token -> authenticated
metadata + Contents check -> AES-256-GCM -> session-authorized Supabase RPC ->
forced-RLS repositories table`

Repository credentials are never included in action state, logs, URLs, or
repository list responses. A dedicated server-only service can retrieve and
decrypt a repository credential for later documentation ingestion.

### Update or Delete Repository or Project

`Repository card/table edit action -> Server Action -> Zod -> live project
session -> session-authorized update RPC -> project-scoped row match -> updated
non-secret repository summary`

Repository edits currently change only the optional purpose. Repository
identity, GitHub metadata, and encrypted credentials remain unchanged. The RPC
derives the project from the unexpired session and requires the repository UUID
to belong to that project.

`Typed confirmation -> Server Action -> Zod -> exact name comparison ->
session-authorized service -> narrow Supabase RPC -> project-scoped row match ->
delete`

Repository deletion removes only the matching source inside the active project.
Project deletion removes the project root and lets PostgreSQL cascade to all
associated repositories and sessions. Both operations return only a boolean
result and expose no database details to the browser.

### Configure Project Resources

`Protected project page -> project-session verification -> project resource
tabs -> Zod Server Action -> project-resource service -> session-authorized RPC
-> forced-RLS project resource table`

Repository-group writes validate branch, typed file/directory paths, and logical
context.
PostgreSQL independently checks every repository UUID against the
session-derived project. LLM verification occurs only after session validation;
the encrypted connection and non-secret summary are atomically upserted into
the project connector registry. The connector upsert targets the table's named
primary-key constraint so PL/pgSQL output columns cannot make the conflict
target ambiguous. Opening the Connectors tab asks a protected
Server Action to decrypt and recheck every saved connection, returning only
Connected or a sanitized connection error.
Repository-group upserts use the table's named primary-key constraint, keeping
the SQL target unambiguous from the RPC's returned `id` field.

### Configure a Project Agent

`Agents tab -> Zod Server Action -> project-session cookie -> agent service ->
session-authorized RPC -> connector ownership check -> forced-RLS project_agents`

Selecting an agent connector calls the same-origin `/api/agents/models` route.
The route validates the provider identifier, verifies the live project session,
loads only that project's saved connector record, decrypts its credential on the
server, and asks the provider for its current model catalog. Only sanitized model
identifiers and display names return to the custom client dropdown; decrypted
credentials never cross the server boundary.

The browser can write skills directly or import a local `.md` file. Importing
reads text in browser memory; the file itself is not uploaded to a public bucket.
The validated Markdown and output contract are stored with the agent row, so
name, connector, model, output behavior, output type, and skills update
atomically. Output types are constrained consistently in Zod and PostgreSQL to
text, JSON, HTML, XML, or image. The `(project_id, connector)` foreign key prevents cross-project
connector selection and blocks removal of a connector that an agent still uses.

When a user opens a branch or content picker, the client sends a validated
repository UUID plus the selected branch and repository-relative directory path
to a Server Action. The server resolves that UUID against repositories visible
to the active project session, retrieves and decrypts a private-repository PAT
only when one exists, and requests GitHub metadata. Branches are fetched in
paginated batches; directory contents are fetched on demand through the GitHub
Contents API. Only sanitized names, paths, types, and sizes return to the
browser. Credentials and GitHub error details remain inside the server trust
boundary.

### Verify an LLM Connector

`Client credential form -> same-origin JSON Route Handler -> Zod discriminated
union -> project-session verification -> provider model discovery -> default
model selection -> exact model access check -> explicit establishment -> repeat
model check -> AES-256-GCM -> session-authorized upsert -> sanitized connector
summary`

OpenAI, Anthropic, Gemini, Azure OpenAI, and Vertex AI list every model visible
to the submitted credential through bounded pagination where supported. The
chosen model is then retrieved through a fixed-host provider metadata endpoint.
Bedrock lists foundation models and checks the exact choice with
`GetFoundationModelAvailability`, including authorization, entitlement,
agreement, and region availability. Establishment repeats the exact check and
stores the default model with the encrypted credential. These metadata checks
do not make billable inference requests, so inference quota is not claimed. On
later tab visits, saved ciphertext is loaded only server-side, decrypted,
validated again, and passed through the same provider check.

## External Integrations

- **Supabase:** Hosted PostgreSQL and REST RPC transport.
- **PostgreSQL pgcrypto:** bcrypt password hashing and verification.
- **GitHub REST API:** Public/private repository detection, canonical metadata,
  token capability verification, paginated branch discovery, and on-demand
  branch-specific directory browsing through the Contents API. Requests pin API
  version `2026-03-10`.
- **OpenAI, Anthropic Claude, and Google Gemini:** Fixed-host model-list access
  checks using submitted API keys or short-lived tokens.
- **Azure OpenAI:** Model-list access against a validated Azure resource
  hostname using an API key or Entra access token.
- **Amazon Bedrock:** Signed `ListFoundationModels` through the AWS SDK using a
  validated region and encrypted project-scoped AWS credentials.
- **Google Vertex AI:** Project/location model listing against a fixed,
  location-derived Google API hostname using an OAuth access token.
- **LobeHub Icons:** Provider SVGs are vendored from
  `@lobehub/icons-static-svg` 1.94.0. No runtime icon-library request is made.
- **Monaco Editor:** The official VS Code editor engine is bundled into the
  client for local Markdown tokenization and editing. It makes no external
  runtime request and falls back to a bounded textarea if initialization fails.
- **React Markdown / unified:** Skills previews use CommonMark plus GFM tables,
  task lists, strikethrough, and autolinks. Raw HTML is parsed, passed through a
  restricted sanitization schema, and then code blocks are highlighted locally;
  no Markdown rendering service receives project content.

AI credentials are stored only as authenticated ciphertext, and no service-role
credential is required.
