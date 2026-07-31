"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  deleteProjectAgentAction,
  saveProjectAgentAction,
} from "@/actions/agentActions";
import {
  LlmConnectorDropdown,
  type LlmConnectorDropdownStatus,
} from "@/components/forms/LlmConnectorDropdown";
import { connectorLabels } from "@/components/forms/LlmConnectorStep";
import { MarkdownCodeEditor } from "@/components/forms/MarkdownCodeEditor";
import { MarkdownViewer } from "@/components/forms/MarkdownViewer";
import {
  ArrowIcon,
  DocumentIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@/components/ui/Icons";
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";
import { LlmProviderLogo } from "@/components/ui/LlmProviderLogo";
import {
  ModuleListControls,
  type ModuleListView,
} from "@/components/ui/ModuleListControls";
import { UiDropdown } from "@/components/ui/UiDropdown";
import {
  MAX_SKILLS_MARKDOWN_LENGTH,
  type AgentOutputMode,
  type AgentOutputType,
  type ProjectAgent,
  type ProjectAgentInput,
} from "@/types/agent";
import type {
  DiscoverLlmModelsResult,
  LlmConnectorSummary,
  LlmConnectorType,
  LlmProviderModel,
} from "@/types/llmConnector";

type EditorMode = "write" | "preview";

const outputModeLabels: Record<AgentOutputMode, string> = {
  single: "Single output",
  multiple: "Multiple outputs",
};

const outputTypeLabels: Record<AgentOutputType, string> = {
  text: "Text",
  json: "JSON",
  html: "HTML",
  xml: "XML",
  image: "Image",
};

function emptyAgent(connectors: LlmConnectorSummary[]): ProjectAgentInput {
  return {
    name: "",
    description: "",
    connector: connectors[0]!.connector,
    model: connectors[0]!.defaultModel ?? "",
    outputMode: "single",
    outputType: "text",
    skillsMarkdown: "# Skills\n\nDescribe this agent's role, instructions, and constraints.",
  };
}

export function AgentsPanel({
  connectors,
  initialAgents,
  onNavigateConnectors,
}: {
  connectors: LlmConnectorSummary[];
  initialAgents: ProjectAgent[];
  onNavigateConnectors: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [agents, setAgents] = useState(initialAgents);
  const [draft, setDraft] = useState<ProjectAgentInput | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("write");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [deletingAgent, setDeletingAgent] = useState<ProjectAgent | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ModuleListView>("cards");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [modelsByConnector, setModelsByConnector] = useState<
    Partial<Record<LlmConnectorType, LlmProviderModel[]>>
  >({});
  const [loadingConnector, setLoadingConnector] =
    useState<LlmConnectorType | null>(null);
  const [modelMessage, setModelMessage] = useState("");
  const [modelRequestVersion, setModelRequestVersion] = useState(0);
  const [connectorErrors, setConnectorErrors] = useState<
    Partial<Record<LlmConnectorType, boolean>>
  >({});
  const selectedConnector = draft?.connector ?? null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleAgents = normalizedQuery
    ? agents.filter((agent) =>
        [
          agent.name,
          agent.description,
          agent.model,
          connectorLabels[agent.connector],
          outputModeLabels[agent.outputMode],
          outputTypeLabels[agent.outputType],
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
      )
    : agents;

  useEffect(() => {
    if (!selectedConnector) return;

    const controller = new AbortController();
    const connector = selectedConnector;

    void fetch("/api/agents/models", {
      body: JSON.stringify({ connector }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as DiscoverLlmModelsResult;
        if (result.status === "error") throw new Error(result.message);

        setModelsByConnector((current) => ({
          ...current,
          [connector]: result.models,
        }));
        setConnectorErrors((current) => ({
          ...current,
          [connector]: false,
        }));
        setDraft((current) => {
          if (!current || current.connector !== connector) return current;
          const currentAvailable = result.models.some(
            (model) => model.id === current.model,
          );
          return currentAvailable
            ? current
            : { ...current, model: result.models[0]?.id ?? "" };
        });
        setModelMessage(
          `${result.models.length.toLocaleString()} provider models available.`,
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setModelsByConnector((current) => ({
          ...current,
          [connector]: [],
        }));
        setConnectorErrors((current) => ({
          ...current,
          [connector]: true,
        }));
        setModelMessage(
          error instanceof Error
            ? error.message
            : "Models could not be loaded from this connector.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingConnector(null);
      });

    return () => controller.abort();
  }, [modelRequestVersion, selectedConnector]);

  const update = (changes: Partial<ProjectAgentInput>) => {
    if (!draft) return;
    setDraft({ ...draft, ...changes });
    setMessage("");
    setFields((current) => {
      const next = { ...current };
      for (const key of Object.keys(changes)) delete next[key];
      return next;
    });
  };

  const openEditor = (agent: ProjectAgentInput) => {
    setLoadingConnector(agent.connector);
    setModelMessage("");
    setDraft(agent);
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setMessage("");
    setFields({});
    const result = await saveProjectAgentAction(draft);
    setSaving(false);
    if (result.status === "error") {
      setMessage(result.message);
      setFields(result.fields ?? {});
      return;
    }

    setAgents((current) =>
      [...current.filter((agent) => agent.id !== result.resource.id), result.resource]
        .sort((left, right) => left.name.localeCompare(right.name)),
    );
    setDraft(null);
    setEditorMode("write");
    router.refresh();
  };

  const remove = async (agent: ProjectAgent) => {
    setMessage("");
    const result = await deleteProjectAgentAction(agent.id);
    if (result.status === "error") {
      return result.message;
    }
    setAgents((current) => current.filter((item) => item.id !== agent.id));
    router.refresh();
    return null;
  };

  const importMarkdown = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".md")) {
      setMessage("Choose a Markdown file ending in .md.");
      return;
    }
    if (file.size > 512_000) {
      setMessage("The Markdown file is too large.");
      return;
    }

    try {
      const markdown = await file.text();
      if (!markdown.trim() || markdown.length > MAX_SKILLS_MARKDOWN_LENGTH) {
        setMessage(
          "The Markdown file must contain text and cannot exceed 200,000 characters.",
        );
        return;
      }
      update({ skillsMarkdown: markdown });
      setEditorMode("write");
    } catch {
      setMessage("The Markdown file could not be read.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (draft) {
    return (
      <section className="project-resource-editor agent-editor">
        <header className="compact-editor-header">
          <div>
            <p className="eyebrow">Project agent</p>
            <h2>{draft.id ? "Edit agent" : "New agent"}</h2>
            <p>Choose its model and write the complete skills context in Markdown.</p>
          </div>
          <button
            aria-label="Close agent editor"
            className="dialog-close"
            onClick={() => setDraft(null)}
            type="button"
          >
            <XIcon />
          </button>
        </header>

        <div className="agent-identity-grid">
          <label className="field-group">
            <span className="field-label">Agent name</span>
            <input
              aria-invalid={Boolean(fields.name)}
              className="field"
              maxLength={120}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="Documentation reviewer"
              value={draft.name}
            />
            {fields.name ? <span className="field-error">{fields.name}</span> : null}
          </label>
          <label className="field-group">
            <span className="field-label">Description</span>
            <input
              aria-invalid={Boolean(fields.description)}
              className="field"
              maxLength={800}
              onChange={(event) => update({ description: event.target.value })}
              placeholder="Reviews technical documents for accuracy and clarity"
              value={draft.description}
            />
            {fields.description ? (
              <span className="field-error">{fields.description}</span>
            ) : null}
          </label>
          <div className="field-group">
            <span className="field-label">LLM connector</span>
            <LlmConnectorDropdown
              ariaInvalid={Boolean(fields.connector)}
              onChange={(connector) => {
                setLoadingConnector(connector);
                setModelMessage("");
                update({
                  connector,
                  model:
                    connectors.find((item) => item.connector === connector)
                      ?.defaultModel ?? "",
                });
              }}
              options={connectors.map((connector) => ({
                value: connector.connector,
                label: connectorLabels[connector.connector],
                meta: connector.defaultModel
                  ? `Default model: ${connector.defaultModel}`
                  : "No default model",
                status: (
                  loadingConnector === connector.connector
                    ? "checking"
                    : connectorErrors[connector.connector]
                      ? "connection_error"
                      : "connected"
                ) satisfies LlmConnectorDropdownStatus,
              }))}
              value={draft.connector}
            />
            {fields.connector ? (
              <span className="field-error">{fields.connector}</span>
            ) : null}
          </div>
          <div className="field-group">
            <span className="field-label">Model</span>
            <UiDropdown
              ariaInvalid={Boolean(fields.model)}
              ariaLabel="Model"
              emptyText="No models returned by this connector."
              loading={loadingConnector === draft.connector}
              loadingText={`Loading ${connectorLabels[draft.connector]} models…`}
              onChange={(model) => update({ model })}
              options={(modelsByConnector[draft.connector] ?? []).map((model) => ({
                value: model.id,
                label: model.displayName,
                meta: model.id,
              }))}
              placeholder="Select a provider model"
              value={draft.model}
            />
            {modelMessage ? (
              <span
                className={
                  (modelsByConnector[draft.connector]?.length ?? 0) > 0
                    ? "agent-model-status"
                    : "field-error"
                }
              >
                {modelMessage}
                {(modelsByConnector[draft.connector]?.length ?? 0) === 0 &&
                loadingConnector !== draft.connector ? (
                  <button
                    className="agent-model-retry"
                    onClick={() => {
                      setLoadingConnector(draft.connector);
                      setModelMessage("");
                      setModelRequestVersion((current) => current + 1);
                    }}
                    type="button"
                  >
                    Retry
                  </button>
                ) : null}
              </span>
            ) : null}
            {fields.model ? <span className="field-error">{fields.model}</span> : null}
          </div>
          <div className="field-group">
            <span className="field-label">Output behavior</span>
            <UiDropdown
              ariaInvalid={Boolean(fields.outputMode)}
              ariaLabel="Output behavior"
              onChange={(outputMode) =>
                update({ outputMode: outputMode as AgentOutputMode })
              }
              options={[
                {
                  value: "single",
                  label: "Single output",
                  meta: "Returns one result per run",
                },
                {
                  value: "multiple",
                  label: "Multiple outputs",
                  meta: "Returns a collection of results per run",
                },
              ]}
              value={draft.outputMode}
            />
            {fields.outputMode ? (
              <span className="field-error">{fields.outputMode}</span>
            ) : null}
          </div>
          <div className="field-group">
            <span className="field-label">Output type</span>
            <UiDropdown
              ariaInvalid={Boolean(fields.outputType)}
              ariaLabel="Output type"
              onChange={(outputType) =>
                update({ outputType: outputType as AgentOutputType })
              }
              options={[
                {
                  value: "text",
                  label: "Text",
                  meta: "Plain or Markdown text",
                },
                {
                  value: "json",
                  label: "JSON",
                  meta: "Structured machine-readable data",
                },
                {
                  value: "html",
                  label: "HTML",
                  meta: "Structured web markup",
                },
                {
                  value: "xml",
                  label: "XML",
                  meta: "Structured extensible markup",
                },
                {
                  value: "image",
                  label: "Image",
                  meta: "Generated image output",
                },
              ]}
              value={draft.outputType}
            />
            {fields.outputType ? (
              <span className="field-error">{fields.outputType}</span>
            ) : null}
          </div>
        </div>

        <div className="markdown-editor">
          <div className="markdown-editor-toolbar">
            <div role="tablist" aria-label="Skills Markdown view">
              <button
                aria-selected={editorMode === "write"}
                className={editorMode === "write" ? "active" : ""}
                onClick={() => setEditorMode("write")}
                role="tab"
                type="button"
              >
                Write
              </button>
              <button
                aria-selected={editorMode === "preview"}
                className={editorMode === "preview" ? "active" : ""}
                onClick={() => setEditorMode("preview")}
                role="tab"
                type="button"
              >
                Preview
              </button>
            </div>
            <label className="markdown-upload-button">
              <DocumentIcon width={14} height={14} /> Import .md
              <input
                accept=".md,text/markdown,text/plain"
                onChange={(event) => void importMarkdown(event.target.files?.[0])}
                ref={fileInputRef}
                type="file"
              />
            </label>
          </div>
          {editorMode === "write" ? (
            <MarkdownCodeEditor
              ariaInvalid={Boolean(fields.skillsMarkdown)}
              maxLength={MAX_SKILLS_MARKDOWN_LENGTH}
              onChange={(skillsMarkdown) => update({ skillsMarkdown })}
              value={draft.skillsMarkdown}
            />
          ) : (
            <MarkdownViewer markdown={draft.skillsMarkdown} />
          )}
          <div className="markdown-editor-meta">
            <span className={fields.skillsMarkdown ? "error" : ""}>
              {fields.skillsMarkdown ?? "Markdown stored with this agent"}
            </span>
            <span>
              {draft.skillsMarkdown.length.toLocaleString()} /{" "}
              {MAX_SKILLS_MARKDOWN_LENGTH.toLocaleString()}
            </span>
          </div>
        </div>

        {message ? <p className="form-message">{message}</p> : null}
        <footer className="compact-editor-actions">
          <button
            className="button-secondary"
            onClick={() => setDraft(null)}
            type="button"
          >
            Cancel
          </button>
          <button
            className="button-primary"
            disabled={
              saving || loadingConnector === draft.connector || !draft.model
            }
            onClick={() => void save()}
            type="button"
          >
            {saving ? "Saving…" : "Save agent"}
          </button>
        </footer>
      </section>
    );
  }

  return (
    <section className="repository-list-section agent-list-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Project AI workforce</p>
          <h2>Agents</h2>
        </div>
        <div className="repository-heading-actions">
          <button
            className="button-primary resource-compact-action"
            disabled={!connectors.length}
            onClick={() => connectors.length && openEditor(emptyAgent(connectors))}
            type="button"
          >
            <PlusIcon width={14} height={14} /> New agent
          </button>
        </div>
      </div>
      <p className="form-intro">
        Agents combine one project connector, a model, an output contract, and a
        complete Markdown skills document stored transactionally with the agent.
      </p>
      {message ? <p className="form-message">{message}</p> : null}

      <div>
        {agents.length ? (
          <ModuleListControls
            itemLabel="agents"
            onQueryChange={setQuery}
            onViewChange={setView}
            query={query}
            resultCount={visibleAgents.length}
            view={view}
          />
      ) : null}

      {agents.length ? (
        visibleAgents.length ? (
          <>
            {view === "cards" ? (
            <div className="agent-card-grid">
              {visibleAgents.map((agent) => (
                <article className="agent-card" key={agent.id}>
                  <button
                    className="module-card-body"
                    onClick={() => openEditor(agent)}
                    type="button"
                  >
                    <header>
                      <LlmProviderLogo connector={agent.connector} />
                      <span>
                        <small>LLM connector</small>
                        <strong>{connectorLabels[agent.connector]}</strong>
                      </span>
                    </header>
                    <h3>{agent.name}</h3>
                    <p>{agent.description || "No description."}</p>
                    <dl>
                      <div>
                        <dt>Model</dt>
                        <dd>{agent.model}</dd>
                      </div>
                      <div>
                        <dt>Output</dt>
                        <dd>
                          {outputModeLabels[agent.outputMode]} ·{" "}
                          {outputTypeLabels[agent.outputType]}
                        </dd>
                      </div>
                    </dl>
                  </button>
                  <footer>
                    <button onClick={() => openEditor(agent)} type="button">
                      <PencilIcon width={12} height={12} /> Edit agent
                    </button>
                    <button
                      aria-label={`Delete ${agent.name}`}
                      className="danger-link"
                      onClick={() => setDeletingAgent(agent)}
                      type="button"
                    >
                      <TrashIcon width={13} height={13} />
                      Delete
                    </button>
                  </footer>
                </article>
              ))}
            </div>
            ) : (
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead><tr><th>Agent</th><th>Connector</th><th>Model</th><th>Output</th><th><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {visibleAgents.map((agent) => (
                      <tr key={agent.id}>
                        <td><button className="module-table-open" onClick={() => openEditor(agent)} type="button"><LlmProviderLogo connector={agent.connector} /><span><strong>{agent.name}</strong><small>{agent.description || "No description."}</small></span></button></td>
                        <td>{connectorLabels[agent.connector]}</td>
                        <td>{agent.model}</td>
                        <td>{outputModeLabels[agent.outputMode]} · {outputTypeLabels[agent.outputType]}</td>
                        <td><div className="module-table-actions"><button onClick={() => openEditor(agent)} type="button"><PencilIcon width={13} height={13} /> Edit</button><button aria-label={`Delete ${agent.name}`} className="danger-link" onClick={() => setDeletingAgent(agent)} type="button"><TrashIcon width={13} height={13} /> Delete</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="agent-bottom-action">
              <button
                className="button-primary resource-compact-action"
                disabled={!connectors.length}
                onClick={() =>
                  connectors.length && openEditor(emptyAgent(connectors))
                }
                type="button"
              >
                <PlusIcon width={14} height={14} /> New agent
              </button>
            </div>
          </>
        ) : (
          <div className="repository-empty agent-search-empty">
            <h3>No matching agents</h3>
            <p>Try a different name, provider, model, or output type.</p>
            <button
              className="empty-add-button"
              onClick={() => setQuery("")}
              type="button"
            >
              Clear search
            </button>
          </div>
        )
      ) : (
        <div className="repository-empty">
          <span className="form-icon">
            <DocumentIcon width={21} height={21} />
          </span>
          <h3>No agents yet</h3>
          <p>
            {connectors.length
              ? "Create an agent and define its complete skills context."
              : "Connect an LLM provider before creating an agent."}
          </p>
          <button
            className="empty-add-button"
            onClick={() =>
              connectors.length
                ? openEditor(emptyAgent(connectors))
                : onNavigateConnectors()
            }
            type="button"
          >
            {connectors.length ? "Create your first agent" : "Open LLM connectors"}
            <ArrowIcon width={14} height={14} />
          </button>
        </div>
        )}
      </div>
      {deletingAgent ? (
        <DeleteConfirmationDialog
          confirmLabel="Delete agent"
          confirmationText={deletingAgent.name}
          description="This permanently removes the agent and its stored skills configuration from this project."
          onClose={() => setDeletingAgent(null)}
          onConfirm={() => remove(deletingAgent)}
          pendingLabel="Deleting agent…"
          title="Delete agent?"
        />
      ) : null}
    </section>
  );
}
