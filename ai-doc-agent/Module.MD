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
  that depend on that connector. Migration
  `202608010005_create_project_pipelines.sql` adds forced-RLS pipeline, node,
  and edge tables with session-scoped CRUD RPCs, project-agent validation,
  acyclic/reachability graph constraints, multi-input links, and unreachable
  branch cleanup. Migration
  `202608010006_add_pipeline_yaml_defaults_and_anchors.sql` adds the pipeline
  default connector/model, canonical bounded YAML definition, persisted edge
  source anchors, project-connector enforcement, and updated session-scoped
  list/save RPCs. Pipeline node output configuration is stored as validated
  JSONB in normalized node rows and included in the canonical YAML definition.
  It can include a bounded, unique, ordered `sourceNodeIds` list for deterministic
  multi-agent output-file assembly; every ID must belong to the submitted graph
  while any individual mapping can be removed. Optional `sourceHeaders` are
  keyed by mapped node ID and provide bounded per-contributor section labels;
  optional `position` coordinates persist a movable output target on the canvas.
  Migration `202608010007_persist_pipeline_uploads_in_azure.sql` adds the
  forced-RLS `project_uploads` metadata table, project-scoped upload listing,
  node media URL arrays, and an atomic pipeline-plus-upload-metadata save RPC.
  Azure stores the file bytes under
  `projectname_project_id/pipelinename_pipeline_id/uploads`; the database stores
  metadata and pipeline media URLs only.
  Migration `202608020008_enforce_pipeline_output_assembly.sql` adds deferred
  constraint triggers that require at least one agent and one output file in the
  final saved graph and validate ordered output sources and optional headers.
  Migration `202608020010_expand_pipeline_output_connections.sql` permits source
  and agent nodes to map independently to output targets, persists bounded target
  positions, and leaves GitHub-source-to-output mappings optional. Pipeline save
  still requires a source-connected agent flow and at least one output file.
  Migration `202608020011_make_github_output_link_optional.sql` reapplies that
  corrected guard for environments that previously ran migration `010` with a
  mandatory direct source-to-output mapping.
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
    create/update/delete. `src/actions/pipelineActions.ts` and
    `src/services/pipelineService.ts` validate, map, and persist project-scoped
    pipeline graphs and bounded multipart uploads. `src/services/azureBlobService.ts`
    performs server-authenticated Azure Blob writes and compensating cleanup;
    `src/lib/azureBlobPath.ts` builds deterministic project/pipeline prefixes.
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
    `PipelinePanel.tsx` provides the Pipeline tab, project-agent
    picker, draggable node canvas, dummy GitHub Repository Group source,
    branching add controls, drag-to-connect existing-node links, searchable agents,
    inline persisted agent creation, default connector/model selection,
    project-bound versioned `.yml` import/download and pipeline
    create/edit/delete flows. Its pipeline library provides top and bottom
    create actions, full-card editing, explicit edit/delete actions, searchable
    card and table views, a no-results state, and a connector-aware first-item
    empty state. Automatic `+` edges persist a right-side anchor;
    manually drawn edges retain their selected top, bottom, or left anchor.
    Each node's `+` menu exposes Agent and Output actions; Output records a safe
    parent path, file name, and supported file type and creates a draggable linked
    target on the canvas. Source and agent nodes can map to targets through the
    picker or drawn links. Connected agent headers turn orange immediately, and
    every workflow or output link exposes a hover/focus delete affordance.
    Removing a workflow link prunes non-source nodes with no remaining source
    path. Each node has symmetric Inputs and Outputs dialogs; Outputs lists its
    downstream agent nodes and output files. Output targets retain explicit
    ordering controls plus an optional header for every file assembly input.
    Its node Inputs dialog combines upstream node links, reusable Azure-backed
    project uploads, and pending device files. Pending files remain in browser
    memory until Save Pipeline; selected files then upload once and their media
    URLs persist on every assigned node.
- **Cross-Module Dependencies:** Project Vault, Repository Sources, provider
  verification services, a server-only versioned encryption key, Supabase RPC
  transport, Azure Blob Storage with environment-specific account/container/key,
  Node cryptography, Zod, and `js-yaml`.

### Document Actions

- **Business Purpose:** Start document creation from a repository group by
  mapping it to an available pipeline, immediately analyzing the scoped source
  repositories, and exposing live progress plus reusable global context in the
  Actions workspace.
- **Data Contracts & Schemas:**
  `createProjectDocumentActionInputSchema`,
  `projectDocumentActionPageQuerySchema`, and the action, analysis,
  language-share, execution-context, and global-context schemas in
  `src/types/projectAction.ts` validate resource references, bounded paging,
  filters, sorting, provider results, and returned action detail. Migration
  `202608020009_create_project_actions.sql` adds the forced-RLS
  `project_actions` table and same-project foreign keys. Migration
  `202608020012_auto_start_repository_analysis.sql` adds database-assigned
  `RUNNING` lifecycle/stage values, immutable action snapshots, structured
  `global_context`, code-language composition, versioned Azure metadata, and
  restricted claim/complete/fail RPCs. The Repo Analyzer output contract lives
  in `src/agents/Repo_Analyzer.md`.
  Migration `202608030013_paginate_project_actions.sql` adds the bounded,
  session-scoped page RPC with database-side filtering and sorting.
  Together the migrations retain
  composite same-project foreign keys, and restricted session-scoped list and
  create RPCs.
- **Backend Layer:**
  - Services: `src/services/projectActionService.ts` hashes the opaque session
    token, calls the paginated list and typed lifecycle RPCs, and validates
    mapped rows;
    `repositoryAnalyzerService.ts` claims the action, resolves snapshot scopes,
    computes language shares, invokes the pipeline default connector/model,
    renders Markdown, uploads it, and persists global context.
    `githubService.ts` performs bounded path-scoped traversal and file reads;
    `llmGenerationService.ts` normalizes generation across the six supported
    providers; `azureBlobService.ts` persists the Markdown artifact.
  - API Routes / Actions: `src/actions/projectActionActions.ts` validates both
    the create mapping and bounded list/pagination queries, reads the HTTP-only
    project session, returns the running action, schedules the claimable
    repository stage after the response, and supports session-scoped progress
    polling.
- **Frontend Layer:**
  - Pages: `src/app/project/page.tsx` loads the first session-scoped action page
    with the other project resources.
  - Components: repository-group card/table actions and the pipeline-selection
    dialog live in `ProjectResources.tsx`; `ActionsPanel.tsx` provides the new
    Actions tab, server-backed repository-group and pipeline filters, sortable
    headers, 10/20/50-row pagination, responsive table rows, retryable loading
    failures, auto-expanded execution flow, repository/analyzer progress,
    sanitized failure state, completed overview, and language-percentage bars.
- **Cross-Module Dependencies:** Project Vault sessions, Repository Groups,
  Pipelines, GitHub REST, encrypted LLM connectors, Azure Blob Storage, the
  typed Supabase RPC adapter, Zod, and shared project UI primitives. Authored
  pipeline agent-node scheduling and output assembly remain pending.

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
