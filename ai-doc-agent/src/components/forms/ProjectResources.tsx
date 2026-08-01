"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  deleteProjectLlmConnectorAction,
  deleteProjectRepositoryGroupAction,
  saveProjectRepositoryGroupAction,
} from "@/actions/projectResourceActions";
import { createProjectDocumentActionAction } from "@/actions/projectActionActions";
import {
  listRepositoryBranchesAction,
  listRepositoryContentsAction,
} from "@/actions/repositoryActions";
import { AgentsPanel } from "@/components/forms/AgentsPanel";
import { ActionsPanel } from "@/components/forms/ActionsPanel";
import { PipelinePanel } from "@/components/forms/PipelinePanel";
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";
import {
  emptyConnectorDrafts,
  LlmConnectorStep,
  type ConnectorDrafts,
} from "@/components/forms/LlmConnectorStep";
import { RepositoryManager } from "@/components/forms/RepositoryManager";
import {
  ArrowIcon,
  CheckIcon,
  DocumentIcon,
  GitHubIcon,
  LayersIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XIcon,
} from "@/components/ui/Icons";
import {
  ModuleListControls,
  type ModuleListView,
} from "@/components/ui/ModuleListControls";
import { UiDropdown } from "@/components/ui/UiDropdown";
import type { LlmConnectorSummary, LlmConnectorType } from "@/types/llmConnector";
import type { ProjectAgent } from "@/types/agent";
import type { ProjectDocumentAction } from "@/types/projectAction";
import type {
  ProjectLlmConnector,
  ProjectRepositoryGroup,
  ProjectRepositoryGroupInput,
} from "@/types/projectResource";
import type { ProjectPipeline, ProjectUpload } from "@/types/pipeline";
import type {
  ProjectRepository,
  RepositoryContentEntry,
} from "@/types/repository";

type ProjectTab =
  | "repositories"
  | "groups"
  | "connectors"
  | "agents"
  | "pipelines"
  | "actions";

function BranchSelect({
  repository,
  value,
  onChange,
}: {
  repository: ProjectRepository | undefined;
  value: string;
  onChange: (branch: string) => void;
}) {
  const [branches, setBranches] = useState(
    repository ? [repository.defaultBranch] : [],
  );
  const [loadedRepositoryId, setLoadedRepositoryId] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!repository || loadedRepositoryId === repository.id) return;
    setLoading(true);
    const result = await listRepositoryBranchesAction(repository.id);
    setLoading(false);
    if (result.status === "success") {
      setBranches(result.branches);
      setLoadedRepositoryId(repository.id);
    }
  };

  const availableBranches = Array.from(new Set([value, ...branches])).filter(
    Boolean,
  );

  return (
    <UiDropdown
      ariaLabel={`Branch for ${repository?.name ?? "repository"}`}
      disabled={!repository}
      loading={loading}
      onChange={onChange}
      onOpen={() => void load()}
      options={availableBranches.map((branch) => ({
        value: branch,
        label: branch,
        meta:
          branch === repository?.defaultBranch ? "Default branch" : "Branch",
      }))}
      value={value}
    />
  );
}

function SourcePathPicker({
  repository,
  branch,
  selectedPaths,
  onChange,
}: {
  repository: ProjectRepository | undefined;
  branch: string;
  selectedPaths: ProjectRepositoryGroupInput["repositories"][number]["selectedPaths"];
  onChange: (
    paths: ProjectRepositoryGroupInput["repositories"][number]["selectedPaths"],
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState("");
  const [entries, setEntries] = useState<RepositoryContentEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (path: string) => {
    if (!repository || !branch || loading) return;
    setLoading(true);
    setError("");
    const result = await listRepositoryContentsAction({
      repositoryId: repository.id,
      branch,
      path,
    });
    setLoading(false);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    setCurrentPath(path);
    setEntries(result.entries);
  };

  const toggle = (entry: { path: string; type: "file" | "directory" }) => {
    const selected = selectedPaths.some((item) => item.path === entry.path);
    if (selected) {
      onChange(selectedPaths.filter((item) => item.path !== entry.path));
      return;
    }
    if (!entry.path) {
      onChange([entry]);
      return;
    }
    const next = selectedPaths.filter(
      (item) =>
        item.path &&
        !(
          entry.type === "directory" &&
          item.path.startsWith(`${entry.path}/`)
        ),
    );
    onChange([...next, entry]);
  };

  const segments = currentPath ? currentPath.split("/") : [];

  return (
    <div className="source-path-picker">
      <div className="source-selection-summary">
        <div>
          <span className="field-label">Selected content</span>
          <small>
            {selectedPaths.length}{" "}
            {selectedPaths.length === 1 ? "path" : "paths"}
          </small>
        </div>
        <button
          className="button-secondary source-browse-button resource-compact-action"
          disabled={!repository || !branch}
          onClick={() => {
            const nextOpen = !open;
            setOpen(nextOpen);
            if (nextOpen && !entries.length) void load("");
          }}
          type="button"
        >
          <GitHubIcon width={14} height={14} />
          {open ? "Close browser" : "Browse GitHub"}
        </button>
      </div>

      {selectedPaths.length ? (
        <div className="selected-path-list">
          {selectedPaths.map((item) => (
            <span key={item.path || "__root__"}>
              {item.type === "directory" ? (
                <LayersIcon width={12} height={12} />
              ) : (
                <DocumentIcon width={12} height={12} />
              )}
              <span>{item.path || "Entire repository"}</span>
              <button
                aria-label={`Remove ${item.path || "entire repository"}`}
                onClick={() => toggle(item)}
                type="button"
              >
                <XIcon width={11} height={11} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="source-selection-empty">
          Select a folder, a file, or several files from one folder.
        </p>
      )}

      {open ? (
        <div className="github-tree-browser">
          <div className="tree-browser-toolbar">
            <nav aria-label="Repository path">
              <button onClick={() => void load("")} type="button">
                {repository?.name ?? "Repository"}
              </button>
              {segments.map((segment, index) => {
                const path = segments.slice(0, index + 1).join("/");
                return (
                  <span key={path}>
                    /
                    <button onClick={() => void load(path)} type="button">
                      {segment}
                    </button>
                  </span>
                );
              })}
            </nav>
            <button
              className={`tree-select-current ${
                selectedPaths.some((item) => item.path === currentPath)
                  ? "selected"
                  : ""
              }`}
              onClick={() =>
                toggle({ path: currentPath, type: "directory" })
              }
              type="button"
            >
              <CheckIcon width={12} height={12} />
              {currentPath ? "Select this folder" : "Select entire repository"}
            </button>
          </div>

          {loading ? (
            <p className="tree-browser-state">Loading GitHub contents…</p>
          ) : error ? (
            <p className="tree-browser-state error">{error}</p>
          ) : entries.length ? (
            <div className="tree-entry-list">
              {entries.map((entry) => {
                const selected = selectedPaths.some(
                  (item) => item.path === entry.path,
                );
                return (
                  <div className={selected ? "selected" : ""} key={entry.path}>
                    <button
                      aria-label={`${selected ? "Deselect" : "Select"} ${entry.name}`}
                      className="tree-entry-check"
                      onClick={() =>
                        toggle({ path: entry.path, type: entry.type })
                      }
                      type="button"
                    >
                      {selected ? <CheckIcon width={12} height={12} /> : null}
                    </button>
                    {entry.type === "directory" ? (
                      <LayersIcon width={15} height={15} />
                    ) : (
                      <DocumentIcon width={15} height={15} />
                    )}
                    <span>{entry.name}</span>
                    {entry.type === "directory" ? (
                      <button
                        aria-label={`Open ${entry.name}`}
                        className="tree-entry-open"
                        onClick={() => void load(entry.path)}
                        type="button"
                      >
                        Open <ArrowIcon width={12} height={12} />
                      </button>
                    ) : (
                      <small>
                        {entry.size
                          ? `${Math.max(1, Math.ceil(entry.size / 1024))} KB`
                          : "File"}
                      </small>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="tree-browser-state">This folder is empty.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function emptyGroup(
  repositories: ProjectRepository[],
): ProjectRepositoryGroupInput {
  return {
    name: "",
    description: "",
    repositoryMode: "selected",
    repositories: repositories[0]
      ? [
          {
          repositoryId: repositories[0].id,
          branch: repositories[0].defaultBranch,
          selectedPaths: [{ path: "", type: "directory" }],
          logicalContext: "",
          },
        ]
      : [],
  };
}

function allRepositoryEntries(
  repositories: ProjectRepository[],
): ProjectRepositoryGroupInput["repositories"] {
  return repositories.map((repository) => ({
    repositoryId: repository.id,
    branch: repository.defaultBranch,
    selectedPaths: [{ path: "", type: "directory" }],
    logicalContext: "",
  }));
}

function CreateDocumentActionDialog({
  group,
  onCancel,
  onCreated,
  onNavigatePipelines,
  pipelines,
}: {
  group: ProjectRepositoryGroup;
  onCancel: () => void;
  onCreated: (action: ProjectDocumentAction) => void;
  onNavigatePipelines: () => void;
  pipelines: ProjectPipeline[];
}) {
  const router = useRouter();
  const [pipelineId, setPipelineId] = useState(pipelines[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const createAction = async () => {
    if (!pipelineId || saving) return;
    setSaving(true);
    setMessage("");
    const result = await createProjectDocumentActionAction({
      repositoryGroupId: group.id,
      pipelineId,
    });
    setSaving(false);
    if (result.status === "error") {
      setMessage(result.message);
      return;
    }
    router.refresh();
    onCreated(result.resource);
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="create-document-action-title"
        aria-modal="true"
        className="confirmation-dialog document-action-dialog"
        role="dialog"
      >
        <button
          aria-label="Close create document dialog"
          className="dialog-close"
          disabled={saving}
          onClick={onCancel}
          type="button"
        >
          <XIcon />
        </button>
        <span className="form-icon document-action-icon">
          <DocumentIcon height={20} width={20} />
        </span>
        <p className="eyebrow">New document action</p>
        <h2 id="create-document-action-title">Choose a pipeline</h2>
        <p>
          Map <strong>{group.name}</strong> to the pipeline that should create
          the document.
        </p>

        <div className="document-action-mapping" aria-label="Action mapping">
          <div>
            <small>Repository group</small>
            <strong>{group.name}</strong>
          </div>
          <ArrowIcon height={16} width={16} />
          <div>
            <small>Action</small>
            <strong>CREATE · NEW</strong>
          </div>
        </div>

        <div className="field-group">
          <span className="field-label">Available pipeline</span>
          <UiDropdown
            ariaLabel="Pipeline for document creation"
            disabled={!pipelines.length || saving}
            emptyText="No pipelines are available."
            onChange={(value) => {
              setPipelineId(value);
              setMessage("");
            }}
            options={pipelines.map((pipeline) => ({
              value: pipeline.id,
              label: pipeline.name,
              meta: pipeline.description || `${pipeline.nodes.length} pipeline nodes`,
            }))}
            placeholder="Select a pipeline"
            value={pipelineId}
          />
        </div>

        {!pipelines.length ? (
          <p className="document-action-empty-note">
            Create a pipeline before starting a document action.
          </p>
        ) : null}
        {message ? (
          <p className="form-message" role="alert">
            {message}
          </p>
        ) : null}

        <div className="dialog-actions">
          <button
            className="button-secondary"
            disabled={saving}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          {pipelines.length ? (
            <button
              className="button-primary"
              disabled={saving || !pipelineId}
              onClick={() => void createAction()}
              type="button"
            >
              {saving ? "Creating action…" : "Create document"}
            </button>
          ) : (
            <button
              className="button-primary"
              onClick={onNavigatePipelines}
              type="button"
            >
              Open pipelines
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function RepositoryGroupsPanel({
  initialGroups,
  onActionCreated,
  onNavigatePipelines,
  onNavigateRepositories,
  pipelines,
  repositories,
}: {
  initialGroups: ProjectRepositoryGroup[];
  onActionCreated: (action: ProjectDocumentAction) => void;
  onNavigatePipelines: () => void;
  onNavigateRepositories: () => void;
  pipelines: ProjectPipeline[];
  repositories: ProjectRepository[];
}) {
  const router = useRouter();
  const [groups, setGroups] = useState(initialGroups);
  const [draft, setDraft] = useState<ProjectRepositoryGroupInput | null>(null);
  const [message, setMessage] = useState("");
  const [removingGroup, setRemovingGroup] =
    useState<ProjectRepositoryGroup | null>(null);
  const [creatingActionFor, setCreatingActionFor] =
    useState<ProjectRepositoryGroup | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ModuleListView>("cards");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleGroups = normalizedQuery
    ? groups.filter((group) =>
        [
          group.name,
          group.description,
          group.repositoryMode,
          ...group.repositories.map((item) => item.branch),
          ...group.repositories.map(
            (item) =>
              repositories.find(
                (repository) => repository.id === item.repositoryId,
              )?.name ?? "",
          ),
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
      )
    : groups;

  const updateRepository = (
    index: number,
    update: Partial<ProjectRepositoryGroupInput["repositories"][number]>,
  ) => {
    if (!draft) return;
    setDraft({
      ...draft,
      repositories: draft.repositories.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...update } : item,
      ),
    });
  };

  const addEntry = () => {
    if (!draft || !repositories[0]) return;
    setDraft({
      ...draft,
      repositories: [
        ...draft.repositories,
        {
          repositoryId: repositories[0].id,
          branch: repositories[0].defaultBranch,
          selectedPaths: [{ path: "", type: "directory" }],
          logicalContext: "",
        },
      ],
    });
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setMessage("");
    const result = await saveProjectRepositoryGroupAction(draft);
    setSaving(false);
    if (result.status === "error") {
      setMessage(result.message);
      return;
    }
    setGroups((current) => [
      ...current.filter((group) => group.id !== result.resource.id),
      result.resource,
    ]);
    setDraft(null);
    router.refresh();
  };

  const remove = async (id: string) => {
    const result = await deleteProjectRepositoryGroupAction(id);
    if (result.status === "error") {
      return result.message;
    }
    setGroups((current) => current.filter((group) => group.id !== id));
    setMessage("");
    router.refresh();
    return null;
  };

  if (draft) {
    return (
      <section className="project-resource-editor repository-group-editor-compact">
        <header className="compact-editor-header">
          <div>
            <p className="eyebrow">Project context</p>
            <h2>{draft.id ? "Edit repository group" : "New repository group"}</h2>
            <p>Combine branch-specific folders and files into reusable context.</p>
          </div>
          <button
            aria-label="Close repository group editor"
            className="dialog-close"
            onClick={() => setDraft(null)}
            type="button"
          >
            <XIcon />
          </button>
        </header>

        <div className="compact-group-identity">
          <label className="field-group">
            <span className="field-label">Group name</span>
            <input
              className="field"
              maxLength={100}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              placeholder="Architecture sources"
              value={draft.name}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Description</span>
            <input
              className="field"
              maxLength={500}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
              placeholder="Shared context for architecture documentation"
              value={draft.description}
            />
          </label>
        </div>

        <div className="repository-mode-selector" role="group" aria-label="Repository coverage">
          <button
            className={draft.repositoryMode === "all" ? "selected" : ""}
            onClick={() =>
              setDraft({
                ...draft,
                repositoryMode: "all",
                repositories: allRepositoryEntries(repositories),
              })
            }
            type="button"
          >
            <LayersIcon width={17} height={17} />
            <span>
              <strong>All project repositories</strong>
              <small>Every repository at its default branch</small>
            </span>
            {draft.repositoryMode === "all" ? (
              <CheckIcon width={15} height={15} />
            ) : null}
          </button>
          <button
            className={draft.repositoryMode === "selected" ? "selected" : ""}
            onClick={() =>
              setDraft({
                ...draft,
                repositoryMode: "selected",
                repositories:
                  draft.repositories.length > 0
                    ? draft.repositories
                    : allRepositoryEntries(repositories).slice(0, 1),
              })
            }
            type="button"
          >
            <DocumentIcon width={17} height={17} />
            <span>
              <strong>Selected repositories</strong>
              <small>Choose branches, folders, and files</small>
            </span>
            {draft.repositoryMode === "selected" ? (
              <CheckIcon width={15} height={15} />
            ) : null}
          </button>
        </div>

        <div className="compact-source-heading">
          <div>
            <strong>
              {draft.repositoryMode === "all"
                ? "Automatic repository coverage"
                : "Source scopes"}
            </strong>
            <span>{draft.repositories.length} repositories</span>
          </div>
          {draft.repositoryMode === "selected" ? (
            <button
              className="button-secondary resource-compact-action source-add-scope-button"
              disabled={!repositories.length}
              onClick={addEntry}
              type="button"
            >
              <PlusIcon width={14} height={14} /> Add repository scope
            </button>
          ) : null}
        </div>

        {draft.repositoryMode === "all" ? (
          <div className="all-repositories-summary">
            <LayersIcon width={22} height={22} />
            <div>
              <strong>{repositories.length} repositories included</strong>
              <p>
                This group automatically resolves every project repository at
                its current default branch. Additions remain included.
              </p>
            </div>
            <div>
              {repositories.map((repository) => (
                <span key={repository.id}>
                  {repository.owner}/{repository.name}
                  <small>{repository.defaultBranch}</small>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="compact-source-list">
        {draft.repositories.map((item, index) => {
          const repository = repositories.find(
            (candidate) => candidate.id === item.repositoryId,
          );
          return (
            <article className="source-scope-card" key={`${index}-${item.repositoryId}`}>
              <header>
                <span className="source-scope-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong>
                    {repository
                      ? `${repository.owner}/${repository.name}`
                      : "Repository source"}
                  </strong>
                  <small>{item.branch}</small>
                </div>
                <button
                  aria-label="Remove repository scope"
                  className="danger-link"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      repositories: draft.repositories.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    })
                  }
                  type="button"
                >
                  <TrashIcon width={13} height={13} /> Remove
                </button>
              </header>

              <div className="scope-repository-grid">
                <label className="field-group">
                  <span className="field-label">Repository</span>
                  <UiDropdown
                    ariaLabel={`Repository for source scope ${index + 1}`}
                    onChange={(repositoryId) => {
                      const selected = repositories.find(
                        (candidate) => candidate.id === repositoryId,
                      );
                      updateRepository(index, {
                        repositoryId,
                        branch: selected?.defaultBranch ?? "",
                        selectedPaths: [{ path: "", type: "directory" }],
                      });
                    }}
                    options={repositories.map((candidate) => ({
                      value: candidate.id,
                      label: `${candidate.owner}/${candidate.name}`,
                      meta: `${candidate.visibility} · ${candidate.defaultBranch}`,
                    }))}
                    value={item.repositoryId}
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Branch</span>
                  <BranchSelect
                    onChange={(branch) =>
                      updateRepository(index, {
                        branch,
                        selectedPaths: [{ path: "", type: "directory" }],
                      })
                    }
                    repository={repository}
                    value={item.branch}
                  />
                </label>
              </div>

              <SourcePathPicker
                branch={item.branch}
                key={`${item.repositoryId}:${item.branch}`}
                onChange={(selectedPaths) =>
                  updateRepository(index, { selectedPaths })
                }
                repository={repository}
                selectedPaths={item.selectedPaths}
              />

              <label className="field-group">
                <span className="field-label">
                  Logical context <small>Optional</small>
                </span>
                <textarea
                  className="field textarea"
                  maxLength={1000}
                  onChange={(event) =>
                    updateRepository(index, {
                      logicalContext: event.target.value,
                    })
                  }
                  placeholder="What this source represents and how the agent should interpret it…"
                  value={item.logicalContext}
                />
              </label>
            </article>
          );
        })}
          </div>
        )}
        {message ? <p className="form-message">{message}</p> : null}
        <footer className="compact-editor-actions">
          <button className="button-secondary" onClick={() => setDraft(null)} type="button">
            Cancel
          </button>
          <button className="button-primary" disabled={saving} onClick={() => void save()} type="button">
            {saving ? "Saving…" : "Save repository group"}
          </button>
        </footer>
      </section>
    );
  }

  return (
    <section className="repository-list-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Reusable project context</p>
          <h2>Repository groups</h2>
        </div>
        <div className="repository-heading-actions">
          <button
            className="button-primary resource-compact-action"
            disabled={!repositories.length}
            onClick={() => setDraft(emptyGroup(repositories))}
            type="button"
          >
            <PlusIcon width={14} height={14} /> New group
          </button>
        </div>
      </div>
      {message ? <p className="form-message">{message}</p> : null}
      <div>
      {groups.length ? (
        <ModuleListControls
          itemLabel="repository groups"
          onQueryChange={setQuery}
          onViewChange={setView}
          query={query}
          resultCount={visibleGroups.length}
          view={view}
        />
      ) : null}
      {visibleGroups.length && view === "cards" ? (
      <div className="repository-group-card-grid">
        {visibleGroups.map((group) => (
          <article className="repository-group-card" key={group.id}>
            <button
              className="module-card-body"
              onClick={() => setDraft(group)}
              type="button"
            >
              <header>
                <LayersIcon width={18} height={18} />
                <span>
                  {group.repositoryMode === "all"
                    ? "All repositories"
                    : `${group.repositories.length} scopes`}
                </span>
              </header>
              <h3>{group.name}</h3>
              <p>{group.description || "No description."}</p>
              <div className="group-card-sources">
              {group.repositories.slice(0, 3).map((item) => {
                const repository = repositories.find(
                  (candidate) => candidate.id === item.repositoryId,
                );
                return (
                  <span key={`${item.repositoryId}:${item.branch}`}>
                    <strong>{repository?.name ?? "Repository"}</strong>
                    <small>
                      {item.branch} · {item.selectedPaths.length} paths
                    </small>
                  </span>
                );
              })}
              {group.repositories.length > 3 ? (
                <small>+{group.repositories.length - 3} more scopes</small>
              ) : null}
              </div>
            </button>
            <footer>
              <button
                className="repository-group-create-action"
                onClick={() => setCreatingActionFor(group)}
                type="button"
              >
                <DocumentIcon height={13} width={13} /> Create document
              </button>
              <div className="repository-group-secondary-actions">
                <button onClick={() => setDraft(group)} type="button">
                  <PencilIcon width={12} height={12} /> Edit
                </button>
                <button
                  aria-label={`Delete ${group.name}`}
                  className="danger-link"
                  onClick={() => setRemovingGroup(group)}
                  type="button"
                >
                  <TrashIcon width={13} height={13} />
                  Delete
                </button>
              </div>
            </footer>
          </article>
        ))}
      </div>
      ) : visibleGroups.length && view === "table" ? (
        <div className="module-table-wrap">
          <table className="module-table">
            <thead><tr><th>Group</th><th>Coverage</th><th>Sources</th><th>Description</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {visibleGroups.map((group) => (
                <tr key={group.id}>
                  <td><button className="module-table-open" onClick={() => setDraft(group)} type="button"><LayersIcon width={15} height={15} /><span><strong>{group.name}</strong><small>Repository group</small></span></button></td>
                  <td>{group.repositoryMode === "all" ? "All repositories" : "Selected repositories"}</td>
                  <td>{group.repositories.length}</td>
                  <td>{group.description || "No description."}</td>
                  <td><div className="module-table-actions"><button className="module-create-document-action" onClick={() => setCreatingActionFor(group)} type="button"><DocumentIcon height={13} width={13} /> Create document</button><button onClick={() => setDraft(group)} type="button"><PencilIcon width={13} height={13} /> Edit</button><button aria-label={`Delete ${group.name}`} className="danger-link" onClick={() => setRemovingGroup(group)} type="button"><TrashIcon width={13} height={13} /> Delete</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : groups.length ? (
        <div className="repository-empty module-search-empty">
          <h3>No matching repository groups</h3>
          <p>Try a different name, description, repository, or branch.</p>
          <button className="empty-add-button" onClick={() => setQuery("")} type="button">Clear search</button>
        </div>
      ) : (
        <div className="repository-empty">
          <span className="form-icon">
            <LayersIcon width={21} height={21} />
          </span>
          <h3>No repository groups yet</h3>
          <p>Create reusable source scopes for project workflows.</p>
          <button
            className="empty-add-button"
            onClick={
              repositories.length
                ? () => setDraft(emptyGroup(repositories))
                : onNavigateRepositories
            }
            type="button"
          >
            {repositories.length
              ? "Create your first group"
              : "Add a repository first"}
            <ArrowIcon width={14} height={14} />
          </button>
        </div>
      )}
      {groups.length ? (
        <div className="resource-list-footer">
          <button
            className="button-primary resource-compact-action"
            disabled={!repositories.length}
            onClick={() => setDraft(emptyGroup(repositories))}
            type="button"
          >
            <PlusIcon width={13} height={13} /> New group
          </button>
        </div>
      ) : null}
      </div>
      {removingGroup ? (
        <DeleteConfirmationDialog
          confirmLabel="Delete group"
          description={`This permanently deletes the ${removingGroup.name} repository group and its saved source configuration.`}
          onClose={() => setRemovingGroup(null)}
          onConfirm={() => remove(removingGroup.id)}
          pendingLabel="Deleting group…"
          title="Delete repository group?"
        />
      ) : null}
      {creatingActionFor ? (
        <CreateDocumentActionDialog
          group={creatingActionFor}
          onCancel={() => setCreatingActionFor(null)}
          onCreated={(action) => {
            setCreatingActionFor(null);
            onActionCreated(action);
          }}
          onNavigatePipelines={() => {
            setCreatingActionFor(null);
            onNavigatePipelines();
          }}
          pipelines={pipelines}
        />
      ) : null}
    </section>
  );
}

function ConnectorsPanel({
  initialConnectors,
}: {
  initialConnectors: ProjectLlmConnector[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<ConnectorDrafts>({
    ...emptyConnectorDrafts,
  });
  const [summaries, setSummaries] = useState<LlmConnectorSummary[]>(
    initialConnectors.map((connector) => {
      const { createdAt, updatedAt, credentialStored, ...summary } = connector;
      void createdAt;
      void updatedAt;
      void credentialStored;
      return summary;
    }),
  );
  const [defaultConnector, setDefaultConnector] =
    useState<LlmConnectorType | null>(summaries[0]?.connector ?? null);
  const [message, setMessage] = useState("");

  const updateSummaries = (next: LlmConnectorSummary[]) => {
    setSummaries(next);
    setMessage("");
    router.refresh();
  };

  const removeConnection = async (connector: LlmConnectorType) => {
    const result = await deleteProjectLlmConnectorAction(connector);
    if (result.status === "error") return result.message;
    setSummaries((current) =>
      current.filter((summary) => summary.connector !== connector),
    );
    setMessage("");
    router.refresh();
    return null;
  };

  return (
    <section className="repository-list-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Project AI access</p>
          <h2>LLM connectors</h2>
        </div>
      </div>
      <p className="form-intro">
        Connections are encrypted, scoped to this project, and checked whenever
        you open this tab. Each provider can have one saved connection; only a
        successfully established replacement overwrites it.
      </p>
      {message ? <p className="form-message">{message}</p> : null}
      <div>
        <LlmConnectorStep
          defaultConnector={defaultConnector}
          drafts={drafts}
          manageDefault={false}
          onDefaultConnectorChange={setDefaultConnector}
          onDraftsChange={setDrafts}
          onRemoveConnection={removeConnection}
          onSummariesChange={updateSummaries}
          summaries={summaries}
        />
      </div>
    </section>
  );
}

export function ProjectResources({
  actions,
  agents,
  connectors,
  groups,
  pipelines,
  uploads,
  projectId,
  projectName,
  repositories,
}: {
  actions: ProjectDocumentAction[];
  agents: ProjectAgent[];
  connectors: ProjectLlmConnector[];
  groups: ProjectRepositoryGroup[];
  pipelines: ProjectPipeline[];
  uploads: ProjectUpload[];
  projectId: string;
  projectName: string;
  repositories: ProjectRepository[];
}) {
  const [tab, setTab] = useState<ProjectTab>("repositories");
  const [projectActions, setProjectActions] = useState(actions);
  const connectorSummaries = connectors.map((connector) => {
    const { createdAt, updatedAt, credentialStored, ...summary } = connector;
    void createdAt;
    void updatedAt;
    void credentialStored;
    return summary;
  });

  return (
    <div className="project-resources">
      <div className="project-resource-tabs" role="tablist" aria-label="Project resources">
        <button className={tab === "repositories" ? "active" : ""} onClick={() => setTab("repositories")} role="tab" type="button">
          Repositories <span>{repositories.length}</span>
        </button>
        <button className={tab === "groups" ? "active" : ""} onClick={() => setTab("groups")} role="tab" type="button">
          Repository groups <span>{groups.length}</span>
        </button>
        <button className={tab === "connectors" ? "active" : ""} onClick={() => setTab("connectors")} role="tab" type="button">
          LLM connectors <span>{connectors.length}</span>
        </button>
        <button className={tab === "agents" ? "active" : ""} onClick={() => setTab("agents")} role="tab" type="button">
          Agents <span>{agents.length}</span>
        </button>
        <button className={tab === "pipelines" ? "active" : ""} onClick={() => setTab("pipelines")} role="tab" type="button">
          Pipelines <span>{pipelines.length}</span>
        </button>
        <button className={tab === "actions" ? "active" : ""} onClick={() => setTab("actions")} role="tab" type="button">
          Actions <span>{projectActions.length}</span>
        </button>
      </div>
      {tab === "repositories" ? (
        <RepositoryManager initialRepositories={repositories} projectName={projectName} />
      ) : null}
      {tab === "groups" ? (
        <RepositoryGroupsPanel
          initialGroups={groups}
          onActionCreated={(action) => {
            setProjectActions((current) => [
              action,
              ...current.filter((item) => item.id !== action.id),
            ]);
            setTab("actions");
          }}
          onNavigatePipelines={() => setTab("pipelines")}
          onNavigateRepositories={() => setTab("repositories")}
          pipelines={pipelines}
          repositories={repositories}
        />
      ) : null}
      {tab === "connectors" ? (
        <ConnectorsPanel initialConnectors={connectors} />
      ) : null}
      {tab === "agents" ? (
        <AgentsPanel
          connectors={connectorSummaries}
          initialAgents={agents}
          onNavigateConnectors={() => setTab("connectors")}
        />
      ) : null}
      {tab === "pipelines" ? (
        <PipelinePanel
          connectors={connectorSummaries}
          initialAgents={agents}
          initialPipelines={pipelines}
          initialUploads={uploads}
          onNavigateConnectors={() => setTab("connectors")}
          projectId={projectId}
          projectName={projectName}
        />
      ) : null}
      {tab === "actions" ? (
        <ActionsPanel
          actions={projectActions}
          onNavigateGroups={() => setTab("groups")}
        />
      ) : null}
    </div>
  );
}
