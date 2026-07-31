# TEK-DOK-MIND Modules

### Project Vault

- **Business Purpose:** Create and reopen a private project workspace without a
  user account, using a one-time project ID plus a password.
- **Data Contracts & Schemas:** `createProjectSchema` and
  `accessProjectSchema` in `src/types/project.ts`; generated database types in
  `src/types/database.types.ts`; `deleteProjectSchema` requires an exact project
  name confirmation; `projects` and `project_sessions` tables, forced RLS,
  timestamp trigger, bcrypt hashing, short-lived session RPCs, cascading
  confirmed deletion, and restricted RPC functions in `supabase/migrations/`.
- **Backend Layer:**
  - Services: `src/services/projectService.ts` generates and hashes project IDs
    and opaque session tokens, and maps typed RPC results.
  - API Routes / Actions: `src/actions/projectActions.ts` validates form data,
    invokes the service, validates destructive confirmations, and sanitizes
    errors.
- **Frontend Layer:**
  - Pages: `src/app/page.tsx` and protected `src/app/project/page.tsx`.
  - Components: `src/components/forms/WorkspacePanel.tsx` and
    `src/components/ui/Icons.tsx`.
- **Cross-Module Dependencies:** Validated Supabase environment configuration,
  the server-only REST RPC adapter, Node cryptography, PostgreSQL `pgcrypto`,
  global monochrome theme primitives in `src/app/globals.css`, and Zod.

### Repository Sources

- **Business Purpose:** Connect validated public or private GitHub repositories
  to a project as future technical-documentation sources, with an optional
  comment or purpose for each repository, update that purpose, and remove
  sources that are no longer needed.
- **Data Contracts & Schemas:** `addRepositorySchema`,
  `updateRepositorySchema`, and repository action states in
  `src/types/repository.ts`; `deleteRepositorySchema` requires an exact
  repository name confirmation; `repositories` table, forced RLS,
  encrypted-token constraints, unique project/repository indexes, and
    session-authorized create/update/delete RPCs in `supabase/migrations/`.
- **Backend Layer:**
  - Services: `src/services/githubService.ts` verifies repository access;
    `src/services/tokenEncryptionService.ts` performs AES-256-GCM encryption;
    `src/services/repositoryService.ts` persists and retrieves repository data.
  - API Routes / Actions: `src/actions/repositoryActions.ts` validates input,
    verifies the project session, maps sanitized GitHub errors, validates
    destructive confirmations, and revalidates the protected page.
- **Frontend Layer:**
  - Pages: repository configuration within `src/app/project/page.tsx`.
  - Components: `src/components/forms/RepositoryManager.tsx` presents repository
    searchable card/table views, clickable edit surfaces, an on-demand creation
    drawer, collapsed read-only PAT instructions, and typed deletion dialogs.
- **Cross-Module Dependencies:** Project Vault sessions, GitHub REST API,
  server-only versioned encryption key, Supabase RPC transport, Node
  cryptography, Zod, and global UI primitives.

### Project AI and Repository Context

- **Business Purpose:** Define reusable project-wide repository groups and LLM
  connectors and configurable agents for project-level source organization and
  future AI workflows.
- **Data Contracts & Schemas:** `projectRepositoryGroupInputSchema` validates
  selected/all repository mode, branch, bounded typed file/directory
  selections, and per-entry logical context in `src/types/projectResource.ts`.
  All mode resolves current project repositories and trusted default branches
  inside database RPCs. `listRepositoryContentsSchema`
  validates project repository, branch, and relative browse path.
  `project_repository_groups` and
  `project_llm_connectors` have forced RLS, revoked direct access, and
  session-scoped RPCs in migrations `202607310004` through `202607310009`.
  The connector table stores an AES-256-GCM ciphertext envelope and enforces one
  row per project/provider while permitting several different providers.
  Migration `202607310010_require_llm_default_model.sql` requires new OpenAI and
  Anthropic summaries to include a validated default-model identifier while
  preserving session-derived project scope and restricted RPC grants.
  Migration `202607310011_fix_llm_connector_save_ambiguity.sql` repairs the
  encrypted connector upsert by targeting the named primary-key constraint.
  Migration `202607310012_require_default_model_all_connectors.sql` extends the
  validated default-model contract to Gemini, Azure OpenAI, Bedrock, and Vertex
  AI while retaining the scoped named-constraint upsert.
  `projectAgentInputSchema` in `src/types/agent.ts` validates names,
  descriptions, project connector types, model identifiers, single/multiple
  output behavior, text/JSON/HTML/XML/image output type, and bounded skills
  Markdown.
  Migration `202607310013_create_project_agents.sql` creates the
  forced-RLS `project_agents` table, composite project/connector reference, and
  session-scoped CRUD RPCs. Migration
  `202608010001_add_agent_output_configuration.sql` adds output configuration
  constraints and replaces the list/save RPC contracts without changing their
  session-derived project scope. Migration
  `202608010002_expand_agent_output_types.sql` extends the validated output
  contract and database constraint with HTML and XML while retaining that
  project scope. Migration
  `202608010004_cascade_agents_on_connector_delete.sql` allows a saved LLM
  connector to be removed atomically by cascading deletion to project agents
  that depend on that connector.
  Repository-group upserts target the named primary-key constraint to avoid
  collisions between PL/pgSQL output variables and table column names.
- **Backend Layer:**
  - Services: `src/services/projectResourceService.ts`,
    `src/services/llmConnectorService.ts`, and
    `src/services/llmCredentialEncryptionService.ts`; `src/services/agentService.ts`
    maps project-scoped agent RPCs.
  - API Routes / Actions: `src/actions/projectResourceActions.ts`,
    `listRepositoryContentsAction`, `checkSavedLlmConnectorsAction`, and the
    same-origin credential routes under `src/app/api/llm-connectors/` for model
    discovery, exact-model access checks, and encrypted establishment.
    `src/app/api/agents/models/route.ts` resolves a selected saved connector,
    decrypts it server-side, and fetches its provider model catalog without
    exposing credentials. `src/actions/agentActions.ts` provides validated agent
    create/update/delete.
- **Frontend Layer:**
  - Pages: the protected project page.
  - Components: `ProjectResources.tsx` provides Repositories, Repository groups,
    LLM connectors, and Agents tabs, compact three-column group cards, custom
    GitHub-populated repository/branch dropdowns, an all-repositories selector,
    an on-demand GitHub folder/file picker, and automatic saved-connection
    checks with not-connected, checking, connected, and error states. OpenAI
    and every provider adds credential validation, fetched model selection,
    model-access verification, and explicit establishment stages.
    `AgentsPanel.tsx` provides searchable agent cards with branded connector
    logos, top/bottom create actions, create/edit/delete, themed connector,
    provider-populated model, output behavior, and output type dropdowns, plus a
    Monaco-powered VS Code-style Markdown skills editor, preview, and local
    `.md` import. `MarkdownCodeEditor.tsx` provides Markdown tokenization, line
    numbers, folding, minimap, word wrapping, a project-aligned dark theme, and
    a bounded textarea fallback. `MarkdownViewer.tsx` renders sanitized
    CommonMark/GFM including tables, task lists, images, alignment, nested
    blocks, and syntax-highlighted fenced code or JSON. Agent cards omit skills
    content and display the persisted output contract instead.
    `LlmConnectorDropdown.tsx` provides the
    provider-logo and connection-status connector menu, while
    `src/components/ui/UiDropdown.tsx` supplies the searchable non-native model
    dropdown and shared project-resource dropdown presentation.
- **Cross-Module Dependencies:** Project Vault, Repository Sources, provider
  verification services, a server-only versioned encryption key, Supabase RPC
  transport, Node cryptography, and Zod.

### Product Tour Onboarding

- **Business Purpose:** Guide first-time visitors through the landing page with a contextual product tour that highlights key UI surfaces and supports a skip option.
- **Data Contracts & Schemas:** No persistent data contract; the onboarding state is stored in browser session and local storage so the tour is shown only once per browser session and once for an authenticated project session.
- **Backend Layer:** None.
- **Frontend Layer:**
  - Pages: `src/app/page.tsx` injects tour anchors into the header, hero, and workspace panel.
  - Components: `src/components/ui/ProductTour.tsx` renders the overlay, spotlight, tooltip, progress bar, hotspot, and action buttons; `src/app/globals.css` provides the visual treatment.
- **Cross-Module Dependencies:** Application Shell layout, workspace panel, and the shared monochrome design tokens.

### Application Shell

- **Business Purpose:** Present a consistent, responsive black, white, and gray
  product interface for TEK-DOK-MIND capabilities.
- **Data Contracts & Schemas:** No persistent data contract.
- **Backend Layer:**
  - Services: None.
  - API Routes / Actions: None.
- **Frontend Layer:**
  - Pages: metadata and root structure in `src/app/layout.tsx`.
  - Components: global semantic theme classes and tokens in
    `src/app/globals.css`.
- **Cross-Module Dependencies:** Next.js App Router, React Server Components,
  and Tailwind CSS.
