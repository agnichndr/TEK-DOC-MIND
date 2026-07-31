"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import {
  addRepositoryAction,
  deleteRepositoryAction,
  updateRepositoryAction,
} from "@/actions/repositoryActions";
import { deleteProjectAction } from "@/actions/projectActions";
import {
  ArrowIcon,
  CheckIcon,
  EyeIcon,
  GitHubIcon,
  InfoIcon,
  LockIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XIcon,
} from "@/components/ui/Icons";
import {
  ModuleListControls,
  type ModuleListView,
} from "@/components/ui/ModuleListControls";
import type {
  AddRepositoryActionState,
  DeleteRepositoryActionState,
  ProjectRepository,
} from "@/types/repository";
import type { DeleteProjectActionState } from "@/types/project";

const initialAddState: AddRepositoryActionState = { status: "idle" };
const initialDeleteRepositoryState: DeleteRepositoryActionState = {
  status: "idle",
};
const initialDeleteProjectState: DeleteProjectActionState = { status: "idle" };

function SubmitButton({
  children,
  className = "",
  pendingLabel,
}: {
  children: ReactNode;
  className?: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`button-primary ${className}`}
      disabled={pending}
      type="submit"
    >
      <span>{pending ? pendingLabel : children}</span>
      <ArrowIcon />
    </button>
  );
}

function DeleteRepositoryDialog({
  repository,
  onClose,
  onDeleted,
}: {
  repository: ProjectRepository;
  onClose: () => void;
  onDeleted?: (repositoryId: string) => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(
    deleteRepositoryAction,
    initialDeleteRepositoryState,
  );

  useEffect(() => {
    if (state.status === "success") {
      onDeleted?.(state.repositoryId);
      onClose();
      router.refresh();
    }
  }, [onClose, onDeleted, router, state]);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby={`delete-repository-${repository.id}`}
        aria-modal="true"
        className="confirmation-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="Close delete confirmation"
          className="dialog-close"
          onClick={onClose}
          type="button"
        >
          <XIcon />
        </button>
        <span className="form-icon danger-icon">
          <TrashIcon />
        </span>
        <p className="eyebrow">Permanent action</p>
        <h2 id={`delete-repository-${repository.id}`}>Delete repository?</h2>
        <p>
          This removes the source and its encrypted credential from this
          project. It does not change anything on GitHub.
        </p>
        <form action={action}>
          <input name="repositoryId" type="hidden" value={repository.id} />
          <input name="repositoryName" type="hidden" value={repository.name} />
          <label className="field-group">
            <span className="field-label">
              Type <strong>{repository.name}</strong> to confirm
            </span>
            <input
              autoComplete="off"
              autoFocus
              className="field"
              name="confirmation"
              required
            />
          </label>
          {state.status === "error" ? (
            <p className="form-message" role="alert">
              {state.message}
            </p>
          ) : null}
          <div className="dialog-actions">
            <button className="button-secondary" onClick={onClose} type="button">
              Cancel
            </button>
            <SubmitButton
              className="button-danger"
              pendingLabel="Deleting repository…"
            >
              Delete repository
            </SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}

function RepositoryCard({
  repository,
  index,
  onEdit,
}: {
  repository: ProjectRepository;
  index: number;
  onEdit: (repository: ProjectRepository) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <>
      <article className="repository-card">
        <div className="repository-card-index">
          {String(index + 1).padStart(2, "0")}
        </div>
        <div className="repository-card-content">
          <button
            aria-label={`Edit ${repository.owner}/${repository.name}`}
            className="module-card-body repository-card-open"
            onClick={() => onEdit(repository)}
            type="button"
          >
          <div className="repository-card-heading">
            <div>
              <p className="eyebrow repository-provider">
                <GitHubIcon width={13} height={13} />
                GitHub repository
              </p>
              <h3>
                <span>{repository.owner}/</span>
                {repository.name}
              </h3>
            </div>
            <span
              className={`repository-visibility ${repository.visibility}`}
            >
              {repository.visibility === "private" ? (
                <LockIcon width={12} height={12} />
              ) : (
                <CheckIcon width={12} height={12} />
              )}
              {repository.visibility}
            </span>
          </div>
          <p className="repository-purpose">
            {repository.purpose || "No purpose added."}
          </p>
          <div className="repository-meta">
            <span>Branch: {repository.defaultBranch}</span>
            {repository.hasStoredToken ? (
              <span>Encrypted credential</span>
            ) : null}
          </div>
          </button>
          <div className="repository-card-actions">
            <button
              onClick={() => onEdit(repository)}
              type="button"
            >
              <PencilIcon width={14} height={14} />
              Edit repository
            </button>
            <a
              href={repository.url}
              target="_blank"
              rel="noreferrer"
            >
              Open on GitHub
              <ArrowIcon width={14} height={14} />
            </a>
            <button
              className="danger-link"
              onClick={() => setConfirmingDelete(true)}
              type="button"
            >
              <TrashIcon width={14} height={14} />
              Delete
            </button>
          </div>
        </div>
      </article>
      {confirmingDelete ? (
        <DeleteRepositoryDialog
          repository={repository}
          onClose={() => setConfirmingDelete(false)}
        />
      ) : null}
    </>
  );
}

function EditRepositoryDialog({
  onClose,
  onSaved,
  repository,
}: {
  onClose: () => void;
  onSaved: (repository: ProjectRepository) => void;
  repository: ProjectRepository;
}) {
  const [purpose, setPurpose] = useState(repository.purpose);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setMessage("");
    const result = await updateRepositoryAction({
      repositoryId: repository.id,
      purpose,
    });
    setSaving(false);
    if (result.status === "error") {
      setMessage(result.fields?.purpose ?? result.message);
      return;
    }
    onSaved(result.repository);
    onClose();
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="edit-repository-title"
        aria-modal="true"
        className="confirmation-dialog repository-edit-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="Close repository editor"
          className="dialog-close"
          onClick={onClose}
          type="button"
        >
          <XIcon />
        </button>
        <span className="form-icon">
          <PencilIcon />
        </span>
        <p className="eyebrow">GitHub source</p>
        <h2 id="edit-repository-title">Edit {repository.name}</h2>
        <p>
          Update the purpose shown throughout this project. Repository identity
          and access stay unchanged.
        </p>
        <label className="field-group" htmlFor="edit-repository-purpose">
          <span className="field-label">Comment / purpose</span>
          <textarea
            autoFocus
            className="field textarea"
            id="edit-repository-purpose"
            maxLength={500}
            onChange={(event) => setPurpose(event.target.value)}
            rows={4}
            value={purpose}
          />
        </label>
        {message ? <p className="form-message" role="alert">{message}</p> : null}
        <div className="dialog-actions">
          <button className="button-secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="button-primary"
            disabled={saving}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </section>
    </div>
  );
}

function PatGuidance({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="pat-help">
      <button
        aria-expanded={expanded}
        className="pat-help-toggle"
        onClick={onToggle}
        type="button"
      >
        <InfoIcon width={16} height={16} />
        Private repository? PAT setup
      </button>
      {expanded ? (
        <div className="token-guidance">
          <LockIcon width={16} height={16} />
          <div>
            <strong>Create a read-only fine-grained PAT</strong>
            <ol>
              <li>Choose the repository owner and set an expiration date.</li>
              <li>
                Under repository access, choose only the repositories you want
                TEK-DOK-MIND to read.
              </li>
              <li>
                Set <b>Contents</b> to read-only for files, branches, and commit
                history.
              </li>
              <li>
                Keep <b>Metadata</b> read-only for repository details. Set{" "}
                <b>Pull requests</b> to read-only if PR context is needed.
              </li>
              <li>Do not grant any write permission.</li>
            </ol>
            <a
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer"
            >
              Generate a fine-grained PAT on GitHub
              <ArrowIcon width={13} height={13} />
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RepositoryDrawer({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [state, action] = useActionState(addRepositoryAction, initialAddState);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [patHelpExpanded, setPatHelpExpanded] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const showToken =
    state.status === "token_required" ||
    (state.status === "error" && state.showToken);

  useEffect(() => {
    if (state.status !== "success") {
      return;
    }

    formRef.current?.reset();
    router.refresh();
    onClose();
  }, [onClose, router, state]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const retainedValues =
    state.status === "token_required" || state.status === "error"
      ? state.values
      : { url: "", purpose: "" };
  const fields = state.status === "error" ? state.fields : undefined;

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        aria-labelledby="repository-drawer-title"
        aria-modal="true"
        className="repository-drawer"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="drawer-header">
          <div className="form-heading">
            <span className="form-icon">
              <GitHubIcon width={21} height={21} />
            </span>
            <div>
              <p className="eyebrow">GitHub source</p>
              <h2 id="repository-drawer-title">Add repository</h2>
            </div>
          </div>
          <button
            aria-label="Close repository form"
            className="dialog-close"
            onClick={onClose}
            type="button"
          >
            <XIcon />
          </button>
        </div>
        <p className="form-intro">
          Public repositories connect without a credential. If GitHub reports
          private access, you will be asked for a read-only token.
        </p>

        <form ref={formRef} action={action} noValidate>
          <label className="field-group" htmlFor="repository-url">
            <span className="field-label">GitHub URL</span>
            <input
              autoFocus
              id="repository-url"
              name="url"
              className="field"
              type="url"
              placeholder="https://github.com/owner/repository"
              defaultValue={retainedValues.url}
              aria-invalid={Boolean(fields?.url)}
              required
            />
            {fields?.url ? (
              <span className="field-error">{fields.url}</span>
            ) : null}
          </label>

          <label className="field-group" htmlFor="repository-purpose">
            <span className="field-label">
              Comment / purpose <small>Optional</small>
            </span>
            <textarea
              id="repository-purpose"
              name="purpose"
              className="field textarea repository-purpose-field"
              placeholder="How this repository supports the documentation…"
              defaultValue={retainedValues.purpose}
              maxLength={500}
              rows={3}
              aria-invalid={Boolean(fields?.purpose)}
            />
            {fields?.purpose ? (
              <span className="field-error">{fields.purpose}</span>
            ) : null}
          </label>

          <PatGuidance
            expanded={patHelpExpanded}
            onToggle={() => setPatHelpExpanded((current) => !current)}
          />

          {showToken ? (
            <div className="token-section">
              <label className="field-group" htmlFor="repository-token">
                <span className="field-label">Fine-grained access token</span>
                <span className="password-wrap">
                  <input
                    id="repository-token"
                    name="accessToken"
                    className="field field-password"
                    type={tokenVisible ? "text" : "password"}
                    placeholder="github_pat_…"
                    autoComplete="off"
                    aria-invalid={Boolean(fields?.accessToken)}
                    required
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    onClick={() => setTokenVisible((current) => !current)}
                    aria-label={
                      tokenVisible ? "Hide access token" : "Show access token"
                    }
                  >
                    <EyeIcon hidden={tokenVisible} />
                  </button>
                </span>
                {fields?.accessToken ? (
                  <span className="field-error">{fields.accessToken}</span>
                ) : (
                  <span className="field-hint">
                    Verified before encrypted storage. Never shown again.
                  </span>
                )}
              </label>
            </div>
          ) : (
            <input type="hidden" name="accessToken" value="" />
          )}

          {state.status === "error" ||
          state.status === "token_required" ? (
            <p className="form-message" role="alert">
              {state.message}
            </p>
          ) : null}

          <SubmitButton
            className="repository-submit"
            pendingLabel="Checking GitHub…"
          >
            {showToken ? "Verify & connect" : "Check & connect"}
          </SubmitButton>
          <p className="form-security">
            <LockIcon width={15} height={15} />
            Read-only tokens use authenticated encryption at rest
          </p>
        </form>
      </aside>
    </div>
  );
}

function DeleteProjectDialog({
  projectName,
  onClose,
}: {
  projectName: string;
  onClose: () => void;
}) {
  const [state, action] = useActionState(
    deleteProjectAction,
    initialDeleteProjectState,
  );

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="delete-project-title"
        aria-modal="true"
        className="confirmation-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="Close delete confirmation"
          className="dialog-close"
          onClick={onClose}
          type="button"
        >
          <XIcon />
        </button>
        <span className="form-icon danger-icon">
          <TrashIcon />
        </span>
        <p className="eyebrow">Permanent action</p>
        <h2 id="delete-project-title">Delete entire project?</h2>
        <p>
          This permanently removes the project, repositories, repository
          groups, LLM connector summaries, encrypted credentials, and active
          sessions.
        </p>
        <form action={action}>
          <input name="projectName" type="hidden" value={projectName} />
          <label className="field-group">
            <span className="field-label">
              Type <strong>{projectName}</strong> to confirm
            </span>
            <input
              autoComplete="off"
              autoFocus
              className="field"
              name="confirmation"
              required
            />
          </label>
          {state.status === "error" ? (
            <p className="form-message" role="alert">
              {state.message}
            </p>
          ) : null}
          <div className="dialog-actions">
            <button className="button-secondary" onClick={onClose} type="button">
              Cancel
            </button>
            <SubmitButton
              className="button-danger"
              pendingLabel="Deleting project…"
            >
              Delete project
            </SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}

export function RepositoryManager({
  initialRepositories,
  projectName,
}: {
  initialRepositories: ProjectRepository[];
  projectName: string;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [repositoryUpdates, setRepositoryUpdates] = useState<
    Record<string, ProjectRepository>
  >({});
  const [deletedRepositoryIds, setDeletedRepositoryIds] = useState<string[]>([]);
  const [editingRepository, setEditingRepository] =
    useState<ProjectRepository | null>(null);
  const [deletingRepository, setDeletingRepository] =
    useState<ProjectRepository | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ModuleListView>("cards");
  const [confirmingProjectDelete, setConfirmingProjectDelete] = useState(false);
  const repositories = initialRepositories
    .filter((repository) => !deletedRepositoryIds.includes(repository.id))
    .map((repository) => repositoryUpdates[repository.id] ?? repository);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleRepositories = normalizedQuery
    ? repositories.filter((repository) =>
        [
          repository.owner,
          repository.name,
          repository.purpose,
          repository.defaultBranch,
          repository.visibility,
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
      )
    : repositories;

  return (
    <>
      <div className="repository-layout">
        <section className="repository-list-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow repository-section-provider">
                <GitHubIcon width={15} height={15} />
                GitHub sources
              </p>
              <h2>Repositories</h2>
            </div>
            <div className="repository-heading-actions">
              <span className="repository-count">
                {repositories.length} connected
              </span>
              <button
                className="button-primary add-repository-button resource-compact-action"
                onClick={() => setDrawerOpen(true)}
                type="button"
              >
                <PlusIcon width={15} height={15} />
                Add new repository
              </button>
            </div>
          </div>

          <div>
            {repositories.length ? (
              <>
                <ModuleListControls
                  itemLabel="repositories"
                  onQueryChange={setQuery}
                  onViewChange={setView}
                  query={query}
                  resultCount={visibleRepositories.length}
                  view={view}
                />
                {visibleRepositories.length ? (
                  view === "cards" ? (
              <div className="repository-list">
                {visibleRepositories.map((repository, index) => (
                  <RepositoryCard
                    key={repository.id}
                    repository={repository}
                    index={index}
                    onEdit={setEditingRepository}
                  />
                ))}
              </div>
                  ) : (
                    <div className="module-table-wrap">
                      <table className="module-table">
                        <thead>
                          <tr>
                            <th>Repository</th>
                            <th>Visibility</th>
                            <th>Default branch</th>
                            <th>Purpose</th>
                            <th><span className="sr-only">Actions</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRepositories.map((repository) => (
                            <tr key={repository.id}>
                              <td>
                                <button
                                  className="module-table-open"
                                  onClick={() => setEditingRepository(repository)}
                                  type="button"
                                >
                                  <GitHubIcon width={15} height={15} />
                                  <span><strong>{repository.owner}/{repository.name}</strong><small>{repository.url}</small></span>
                                </button>
                              </td>
                              <td>{repository.visibility}</td>
                              <td>{repository.defaultBranch}</td>
                              <td>{repository.purpose || "No purpose added."}</td>
                              <td>
                                <div className="module-table-actions">
                                  <button onClick={() => setEditingRepository(repository)} type="button"><PencilIcon width={13} height={13} /> Edit</button>
                                  <button className="danger-link" onClick={() => setDeletingRepository(repository)} type="button"><TrashIcon width={13} height={13} /> Delete</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : (
                  <div className="repository-empty module-search-empty">
                    <h3>No matching repositories</h3>
                    <p>Try a different owner, name, purpose, or branch.</p>
                    <button className="empty-add-button" onClick={() => setQuery("")} type="button">Clear search</button>
                  </div>
                )}
                <div className="resource-list-footer">
                  <button
                    className="button-primary add-repository-button resource-compact-action"
                    onClick={() => setDrawerOpen(true)}
                    type="button"
                  >
                    <PlusIcon width={13} height={13} />
                    Add repository
                  </button>
                </div>
              </>
            ) : (
              <div className="repository-empty">
                <span className="form-icon">
                  <GitHubIcon width={21} height={21} />
                </span>
                <h3>No repositories yet</h3>
                <p>
                  Add a public or private GitHub repository when you are ready.
                </p>
                <button
                  className="empty-add-button"
                  onClick={() => setDrawerOpen(true)}
                  type="button"
                >
                  Add your first repository
                  <ArrowIcon width={14} height={14} />
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="project-danger-zone">
          <div>
            <p className="eyebrow">Danger zone</p>
            <h2>Delete this project</h2>
            <p>
              Permanently remove this project and all of its configuration,
              sources, and credentials.
            </p>
          </div>
          <button
            className="danger-outline-button"
            onClick={() => setConfirmingProjectDelete(true)}
            type="button"
          >
            <TrashIcon width={15} height={15} />
            Delete project
          </button>
        </section>
      </div>

      {drawerOpen ? (
        <RepositoryDrawer onClose={() => setDrawerOpen(false)} />
      ) : null}
      {editingRepository ? (
        <EditRepositoryDialog
          onClose={() => setEditingRepository(null)}
          onSaved={(repository) =>
            setRepositoryUpdates((current) => ({
              ...current,
              [repository.id]: repository,
            }))
          }
          repository={editingRepository}
        />
      ) : null}
      {deletingRepository ? (
        <DeleteRepositoryDialog
          onClose={() => setDeletingRepository(null)}
          onDeleted={(repositoryId) =>
            setDeletedRepositoryIds((current) => [
              ...current,
              repositoryId,
            ])
          }
          repository={deletingRepository}
        />
      ) : null}
      {confirmingProjectDelete ? (
        <DeleteProjectDialog
          projectName={projectName}
          onClose={() => setConfirmingProjectDelete(false)}
        />
      ) : null}
    </>
  );
}
