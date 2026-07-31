"use client";

import { useEffect, useRef, useState } from "react";

import {
  checkSavedLlmConnectorsAction,
} from "@/actions/llmConnectorActions";
import {
  CheckIcon,
} from "@/components/ui/Icons";
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";
import { LlmProviderLogo } from "@/components/ui/LlmProviderLogo";
import {
  ModuleListControls,
  type ModuleListView,
} from "@/components/ui/ModuleListControls";
import { UiDropdown } from "@/components/ui/UiDropdown";
import {
  addConnectedConnector,
  removeConnectedConnector,
} from "@/lib/llmConnectorSelection";
import {
  getConnectorCardConnectionStatus,
  isConnectorDraftComplete,
  type ConnectorCardConnectionStatus,
} from "@/lib/llmConnectorStatus";
import type {
  DiscoverLlmModelsResult,
  LlmConnectorInput,
  LlmConnectorSummary,
  LlmConnectorType,
  LlmModelDiscoveryInput,
  LlmProviderModel,
  VerifyLlmConnectorResult,
  VerifyLlmModelResult,
} from "@/types/llmConnector";

export type ConnectorDraft = {
  connector: LlmConnectorType;
  authenticationMethod: string;
  credential: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  projectId: string;
  location: string;
  defaultModel: string;
};

export type ConnectorDrafts = Partial<
  Record<LlmConnectorType, ConnectorDraft>
>;

export const emptyConnectorDrafts: ConnectorDrafts = {};

export const connectorLabels: Record<LlmConnectorType, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic Claude",
  gemini: "Google Gemini",
  azure_openai: "Azure OpenAI",
  bedrock: "Amazon Bedrock",
  vertex_ai: "Google Vertex AI",
};

export const authenticationLabels: Record<string, string> = {
  api_key: "API key",
  access_token: "Workload-identity access token",
  bearer_token: "Short-lived bearer token",
  standard_api_key: "Standard API key",
  authorization_api_key: "Authorization API key",
  entra_token: "Entra access token",
  aws_access_keys: "AWS access keys",
  oauth_access_token: "OAuth access token",
};

const connectors: Array<{
  connector: LlmConnectorType;
  description: string;
  defaultAuthenticationMethod: string;
}> = [
  {
    connector: "openai",
    description: "OpenAI platform models",
    defaultAuthenticationMethod: "api_key",
  },
  {
    connector: "anthropic",
    description: "Claude model access",
    defaultAuthenticationMethod: "api_key",
  },
  {
    connector: "gemini",
    description: "Gemini developer API",
    defaultAuthenticationMethod: "standard_api_key",
  },
  {
    connector: "azure_openai",
    description: "Azure-hosted OpenAI",
    defaultAuthenticationMethod: "api_key",
  },
  {
    connector: "bedrock",
    description: "AWS foundation models",
    defaultAuthenticationMethod: "aws_access_keys",
  },
  {
    connector: "vertex_ai",
    description: "Google Cloud models",
    defaultAuthenticationMethod: "oauth_access_token",
  },
];

function createConnectorDraft(
  connector: LlmConnectorType,
  authenticationMethod: string,
): ConnectorDraft {
  return {
    connector,
    authenticationMethod,
    credential: "",
    endpoint: "",
    region: "",
    accessKeyId: "",
    secretAccessKey: "",
    sessionToken: "",
    projectId: "",
    location: "",
    defaultModel: "",
  };
}

function createConnectorDraftFromSummary(
  summary: LlmConnectorSummary,
): ConnectorDraft {
  const draft = createConnectorDraft(
    summary.connector,
    summary.authenticationMethod,
  );

  switch (summary.connector) {
    case "openai":
    case "anthropic":
      return { ...draft, defaultModel: summary.defaultModel ?? "" };
    case "azure_openai":
      return {
        ...draft,
        endpoint: summary.endpoint,
        defaultModel: summary.defaultModel ?? "",
      };
    case "bedrock":
      return {
        ...draft,
        region: summary.region,
        defaultModel: summary.defaultModel ?? "",
      };
    case "vertex_ai":
      return {
        ...draft,
        projectId: summary.projectId,
        location: summary.location,
        defaultModel: summary.defaultModel ?? "",
      };
    default:
      return { ...draft, defaultModel: summary.defaultModel ?? "" };
  }
}

function SecretField({
  id,
  label,
  value,
  optional = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  optional?: boolean;
  onChange: (value: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);

  return (
    <label className="field-group" htmlFor={id}>
      <span className="field-label">
        {label} {optional ? <small>(optional)</small> : null}
      </span>
      <span className="connector-secret-wrap">
        <input
          autoComplete="off"
          className="field field-password"
          id={id}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          type={revealed ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={`${revealed ? "Hide" : "Reveal"} ${label}`}
          className="connector-reveal"
          onClick={() => setRevealed((current) => !current)}
          type="button"
        >
          {revealed ? "Hide" : "Show"}
        </button>
      </span>
    </label>
  );
}

function buildInput(draft: ConnectorDraft): LlmConnectorInput | null {
  switch (draft.connector) {
    case "openai":
      return {
        connector: draft.connector,
        authenticationMethod:
          draft.authenticationMethod === "access_token"
            ? "access_token"
            : "api_key",
        credential: draft.credential,
        defaultModel: draft.defaultModel,
      };
    case "anthropic":
      return {
        connector: draft.connector,
        authenticationMethod:
          draft.authenticationMethod === "bearer_token"
            ? "bearer_token"
            : "api_key",
        credential: draft.credential,
        defaultModel: draft.defaultModel,
      };
    case "gemini":
      return {
        connector: draft.connector,
        authenticationMethod:
          draft.authenticationMethod === "authorization_api_key"
            ? "authorization_api_key"
            : "standard_api_key",
        credential: draft.credential,
        defaultModel: draft.defaultModel,
      };
    case "azure_openai":
      return {
        connector: draft.connector,
        authenticationMethod:
          draft.authenticationMethod === "entra_token"
            ? "entra_token"
            : "api_key",
        endpoint: draft.endpoint,
        credential: draft.credential,
        defaultModel: draft.defaultModel,
      };
    case "bedrock":
      return {
        connector: draft.connector,
        authenticationMethod: "aws_access_keys",
        region: draft.region,
        accessKeyId: draft.accessKeyId,
        secretAccessKey: draft.secretAccessKey,
        sessionToken: draft.sessionToken,
        defaultModel: draft.defaultModel,
      };
    case "vertex_ai":
      return {
        connector: draft.connector,
        authenticationMethod: "oauth_access_token",
        projectId: draft.projectId,
        location: draft.location,
        credential: draft.credential,
        defaultModel: draft.defaultModel,
      };
    default:
      return null;
  }
}

function buildDiscoveryInput(
  draft: ConnectorDraft,
): LlmModelDiscoveryInput | null {
  const input = buildInput(draft);
  if (!input) return null;
  const { defaultModel: _defaultModel, ...discoveryInput } = input;
  void _defaultModel;
  return discoveryInput as LlmModelDiscoveryInput;
}

async function postConnectorRequest<TResult>(url: string, body: unknown) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await response.json()) as TResult;
  } catch {
    return null;
  }
}

const connectionStatusLabels: Record<ConnectorCardConnectionStatus, string> = {
  not_connected: "Not Connected",
  checking: "Checking",
  connection_error: "Error",
  connected: "Connected",
};

export function LlmConnectorStep({
  drafts,
  summaries,
  defaultConnector,
  onDraftsChange,
  onSummariesChange,
  onRemoveConnection,
  onDefaultConnectorChange,
  manageDefault = true,
}: {
  drafts: ConnectorDrafts;
  summaries: LlmConnectorSummary[];
  defaultConnector: LlmConnectorType | null;
  onDraftsChange: (drafts: ConnectorDrafts) => void;
  onSummariesChange: (summaries: LlmConnectorSummary[]) => void;
  onRemoveConnection: (connector: LlmConnectorType) => Promise<string | null>;
  onDefaultConnectorChange: (connector: LlmConnectorType | null) => void;
  manageDefault?: boolean;
}) {
  const initiallyLoadedConnector = connectors.find((item) =>
    isConnectorDraftComplete(drafts[item.connector]),
  );
  const [activeConnector, setActiveConnector] =
    useState<LlmConnectorType | null>(
      initiallyLoadedConnector?.connector ??
        defaultConnector ??
        summaries[0]?.connector ??
        null,
    );
  const [checking, setChecking] = useState<LlmConnectorType | null>(null);
  const [query, setQuery] = useState("");
  const [removingConnector, setRemovingConnector] =
    useState<LlmConnectorType | null>(null);
  const [view, setView] = useState<ModuleListView>("cards");
  const [checkingOperation, setCheckingOperation] = useState<
    "models" | "model" | "establish" | null
  >(null);
  const [errors, setErrors] = useState<
    Partial<Record<LlmConnectorType, string>>
  >({});
  const [verifiedThisSession, setVerifiedThisSession] = useState<
    Partial<Record<LlmConnectorType, boolean>>
  >({});
  const [modelsByConnector, setModelsByConnector] = useState<
    Partial<Record<LlmConnectorType, LlmProviderModel[]>>
  >({});
  const [modelAccessVerified, setModelAccessVerified] = useState<
    Partial<Record<LlmConnectorType, boolean>>
  >({});
  const [modelAccessErrors, setModelAccessErrors] = useState<
    Partial<Record<LlmConnectorType, string>>
  >({});
  const [savedStatuses, setSavedStatuses] = useState<
    Partial<Record<LlmConnectorType, ConnectorCardConnectionStatus>>
  >(
    Object.fromEntries(
      summaries.map((item) => [item.connector, "checking"]),
    ) as Partial<Record<LlmConnectorType, ConnectorCardConnectionStatus>>,
  );
  const autoCheckStarted = useRef(false);
  const connectorDefinition = connectors.find(
    (item) => item.connector === activeConnector,
  );
  const storedSummary = activeConnector
    ? summaries.find((item) => item.connector === activeConnector) ?? null
    : null;
  const draft =
    activeConnector && connectorDefinition
      ? drafts[activeConnector] ??
        (storedSummary
          ? createConnectorDraftFromSummary(storedSummary)
          : createConnectorDraft(
              activeConnector,
              connectorDefinition.defaultAuthenticationMethod,
            ))
      : null;
  const replacementPending =
    activeConnector &&
    !verifiedThisSession[activeConnector] &&
    isConnectorDraftComplete(draft ?? undefined);
  const summary =
    activeConnector &&
    (verifiedThisSession[activeConnector] ||
      (savedStatuses[activeConnector] === "connected" &&
        !replacementPending))
      ? storedSummary
      : null;
  const error = activeConnector ? errors[activeConnector] ?? "" : "";
  const usesModelFlow = Boolean(activeConnector);
  const availableModels = activeConnector
    ? modelsByConnector[activeConnector] ?? []
    : [];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleConnectors = normalizedQuery
    ? connectors.filter((item) =>
        [
          connectorLabels[item.connector],
          item.description,
          connectionStatusLabels[
            getConnectorCardConnectionStatus({
              draft: drafts[item.connector],
              checking: checking === item.connector,
              verifiedThisSession: Boolean(
                verifiedThisSession[item.connector],
              ),
              savedStatus: savedStatuses[item.connector],
            })
          ],
        ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
      )
    : connectors;

  const update = (changes: Partial<ConnectorDraft>) => {
    if (!draft || !activeConnector) return;

    setErrors((current) => ({ ...current, [activeConnector]: "" }));
    setVerifiedThisSession((current) => ({
      ...current,
      [activeConnector]: false,
    }));
    setModelAccessVerified((current) => ({
      ...current,
      [activeConnector]: false,
    }));
    setModelAccessErrors((current) => ({
      ...current,
      [activeConnector]: "",
    }));
    if ("credential" in changes || "authenticationMethod" in changes) {
      setModelsByConnector((current) => ({
        ...current,
        [activeConnector]: [],
      }));
      changes.defaultModel = "";
    }
    onDraftsChange({
      ...drafts,
      [activeConnector]: { ...draft, ...changes },
    });
  };

  const openConnector = (
    connector: LlmConnectorType,
    defaultAuthenticationMethod: string,
  ) => {
    setActiveConnector(connector);
    setErrors((current) => ({ ...current, [connector]: "" }));

    if (!drafts[connector]) {
      const saved = summaries.find((item) => item.connector === connector);
      onDraftsChange({
        ...drafts,
        [connector]: saved
          ? createConnectorDraftFromSummary(saved)
          : createConnectorDraft(connector, defaultAuthenticationMethod),
      });
    }
  };

  const establishDraft = async (
    connector: LlmConnectorType,
    connectorDraft: ConnectorDraft,
  ) => {
    const input = buildInput(connectorDraft);
    if (!input) return;

    setChecking(connector);
    setCheckingOperation("establish");
    setErrors((current) => ({ ...current, [connector]: "" }));
    const result = await postConnectorRequest<VerifyLlmConnectorResult>(
      "/api/llm-connectors/establish",
      input,
    );
    setChecking(null);
    setCheckingOperation(null);

    if (result?.status === "connected") {
      setVerifiedThisSession((current) => ({
        ...current,
        [connector]: true,
      }));
      setSavedStatuses((current) => ({
        ...current,
        [connector]: "connected",
      }));
      const nextState = addConnectedConnector(
        { summaries, defaultConnector },
        result.summary,
      );
      onDraftsChange({
        ...drafts,
        [connector]: createConnectorDraftFromSummary(result.summary),
      });
      onSummariesChange(nextState.summaries);
      onDefaultConnectorChange(nextState.defaultConnector);
    } else {
      setVerifiedThisSession((current) => ({
        ...current,
        [connector]: false,
      }));
      setSavedStatuses((current) => ({
        ...current,
        [connector]: "connection_error",
      }));
      setErrors((current) => ({
        ...current,
        [connector]:
          result?.message ?? "The connector service returned an invalid response.",
      }));
    }
  };

  const establish = async () => {
    if (!draft || checking || !activeConnector) return;
    await establishDraft(activeConnector, draft);
  };

  const discoverModels = async () => {
    if (!draft || checking || !activeConnector) return;
    const input = buildDiscoveryInput(draft);
    if (!input) return;

    setChecking(activeConnector);
    setCheckingOperation("models");
    setErrors((current) => ({ ...current, [activeConnector]: "" }));
    setModelAccessErrors((current) => ({
      ...current,
      [activeConnector]: "",
    }));
    const result = await postConnectorRequest<DiscoverLlmModelsResult>(
      "/api/llm-connectors/models",
      input,
    );
    setChecking(null);
    setCheckingOperation(null);

    if (result?.status === "success") {
      setModelsByConnector((current) => ({
        ...current,
        [activeConnector]: result.models,
      }));
      setModelAccessVerified((current) => ({
        ...current,
        [activeConnector]: false,
      }));
      update({ defaultModel: "" });
      return;
    }

    setErrors((current) => ({
      ...current,
      [activeConnector]:
        result?.message ?? "The connector service returned an invalid response.",
    }));
  };

  const verifyModel = async () => {
    if (!draft || checking || !activeConnector || !draft.defaultModel) return;
    const input = buildInput(draft);
    if (!input) return;

    setChecking(activeConnector);
    setCheckingOperation("model");
    setModelAccessErrors((current) => ({
      ...current,
      [activeConnector]: "",
    }));
    const result = await postConnectorRequest<VerifyLlmModelResult>(
      "/api/llm-connectors/model-access",
      input,
    );
    setChecking(null);
    setCheckingOperation(null);

    if (result?.status === "success") {
      setModelAccessVerified((current) => ({
        ...current,
        [activeConnector]: true,
      }));
      return;
    }

    setModelAccessVerified((current) => ({
      ...current,
      [activeConnector]: false,
    }));
    setModelAccessErrors((current) => ({
      ...current,
      [activeConnector]:
        result?.message ?? "The connector service returned an invalid response.",
    }));
  };

  useEffect(() => {
    if (autoCheckStarted.current) return;
    autoCheckStarted.current = true;
    if (!summaries.length) return;

    void checkSavedLlmConnectorsAction().then((result) => {
      if (result.status === "error") {
        setSavedStatuses(
          Object.fromEntries(
            summaries.map((item) => [item.connector, "connection_error"]),
          ) as Partial<Record<LlmConnectorType, ConnectorCardConnectionStatus>>,
        );
        setErrors(
          Object.fromEntries(
            summaries.map((item) => [item.connector, result.message]),
          ) as Partial<Record<LlmConnectorType, string>>,
        );
        return;
      }

      const nextStatuses: Partial<
        Record<LlmConnectorType, ConnectorCardConnectionStatus>
      > = {};
      const nextErrors: Partial<Record<LlmConnectorType, string>> = {};
      let nextSummaries = summaries;
      for (const connection of result.connections) {
        if (connection.status === "connected") {
          nextStatuses[connection.connector] = "connected";
          nextSummaries = addConnectedConnector(
            { summaries: nextSummaries, defaultConnector },
            connection.summary,
          ).summaries;
        } else {
          nextStatuses[connection.connector] = "connection_error";
          nextErrors[connection.connector] = connection.message;
        }
      }
      setSavedStatuses(nextStatuses);
      setErrors(nextErrors);
      onSummariesChange(nextSummaries);
    });
    // Saved credentials are checked once whenever the Connectors panel mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeConnection = async (connector: LlmConnectorType) => {
    const removalError = await onRemoveConnection(connector);
    if (removalError) return removalError;
    const nextState = removeConnectedConnector(
      { summaries, defaultConnector },
      connector,
    );
    onDraftsChange(
      Object.fromEntries(
        Object.entries(drafts).filter(([key]) => key !== connector),
      ) as ConnectorDrafts,
    );
    onDefaultConnectorChange(nextState.defaultConnector);
    setErrors((current) => ({ ...current, [connector]: "" }));
    setVerifiedThisSession((current) => ({
      ...current,
      [connector]: false,
    }));
    setSavedStatuses((current) => {
      const next = { ...current };
      delete next[connector];
      return next;
    });
    return null;
  };

  const authOptions =
    draft?.connector === "openai"
      ? [
          ["api_key", "API key"],
          ["access_token", "Workload-identity access token"],
        ]
      : draft?.connector === "anthropic"
        ? [
            ["api_key", "API key"],
            ["bearer_token", "Short-lived bearer token"],
          ]
        : draft?.connector === "gemini"
          ? [
              ["standard_api_key", "Standard API key"],
              ["authorization_api_key", "Authorization API key"],
            ]
          : draft?.connector === "azure_openai"
            ? [
                ["api_key", "API key"],
                ["entra_token", "Entra access token"],
              ]
            : [];

  return (
    <div className="connector-step">
      <ModuleListControls
        itemLabel="LLM connectors"
        onQueryChange={setQuery}
        onViewChange={setView}
        query={query}
        resultCount={visibleConnectors.length}
        view={view}
      />
      {visibleConnectors.length && view === "cards" ? (
      <div className="connector-grid" role="list" aria-label="LLM connectors">
        {visibleConnectors.map((item) => {
          const status = getConnectorCardConnectionStatus({
            draft: drafts[item.connector],
            checking: checking === item.connector,
            verifiedThisSession: Boolean(
              verifiedThisSession[item.connector],
            ),
            savedStatus: savedStatuses[item.connector],
          });
          const connected = status === "connected";
          const isDefault =
            connected &&
            manageDefault &&
            defaultConnector === item.connector;

          return (
          <article
            className={`connector-card connector-card-${item.connector} ${
              activeConnector === item.connector ? "selected" : ""
            } ${connected ? "connected" : ""} ${
              isDefault ? "default" : ""
            } connector-status-${status}`}
            key={item.connector}
            role="listitem"
          >
            <button
              aria-pressed={activeConnector === item.connector}
              className="connector-card-main"
              onClick={() =>
                openConnector(
                  item.connector,
                  item.defaultAuthenticationMethod,
                )
              }
              type="button"
            >
              <LlmProviderLogo connector={item.connector} />
              <span>
                <strong>{connectorLabels[item.connector]}</strong>
                <small>{item.description}</small>
              </span>
              {activeConnector === item.connector ? (
                <CheckIcon width={14} height={14} />
              ) : null}
            </button>
            <span
              aria-label={`Connection status: ${connectionStatusLabels[status]}`}
              className="connector-card-status"
              data-status={status}
            >
              {connectionStatusLabels[status]}
            </span>
          </article>
          );
        })}
      </div>
      ) : visibleConnectors.length ? (
        <div className="module-table-wrap connector-table-wrap">
          <table className="module-table">
            <thead><tr><th>Provider</th><th>Status</th><th>Description</th></tr></thead>
            <tbody>
              {visibleConnectors.map((item) => {
                const status = getConnectorCardConnectionStatus({
                  draft: drafts[item.connector],
                  checking: checking === item.connector,
                  verifiedThisSession: Boolean(verifiedThisSession[item.connector]),
                  savedStatus: savedStatuses[item.connector],
                });
                return (
                  <tr key={item.connector}>
                    <td><button className="module-table-open" onClick={() => openConnector(item.connector, item.defaultAuthenticationMethod)} type="button"><LlmProviderLogo connector={item.connector} /><span><strong>{connectorLabels[item.connector]}</strong><small>{item.connector}</small></span></button></td>
                    <td><span aria-label={`Connection status: ${connectionStatusLabels[status]}`} className="connector-card-status connector-table-status" data-status={status}>{connectionStatusLabels[status]}</span></td>
                    <td>{item.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="repository-empty module-search-empty">
          <h3>No matching connectors</h3>
          <p>Try a provider name, capability, or connection status.</p>
          <button className="empty-add-button" onClick={() => setQuery("")} type="button">Clear search</button>
        </div>
      )}

      {draft ? (
        <section className="connector-form" aria-label={`${connectorLabels[draft.connector]} credentials`}>
          <div className="connector-form-heading">
            <div>
              <p className="eyebrow">Connection details</p>
              <h3>{connectorLabels[draft.connector]}</h3>
            </div>
            {summary ? (
              <span className="connector-connected-badge">
                <CheckIcon width={13} height={13} />
                {manageDefault && defaultConnector === summary.connector
                  ? "Default connector"
                  : "Connected"}
              </span>
            ) : null}
          </div>

          {authOptions.length ? (
            <div className="field-group">
              <span className="field-label">Authentication method</span>
              <UiDropdown
                ariaLabel="Authentication method"
                onChange={(authenticationMethod) =>
                  update({
                    authenticationMethod,
                    credential: "",
                  })
                }
                options={authOptions.map(([value, label]) => ({ value, label }))}
                value={draft.authenticationMethod}
              />
            </div>
          ) : null}

          {draft.connector === "azure_openai" ? (
            <label className="field-group" htmlFor="azure-endpoint">
              <span className="field-label">Resource endpoint</span>
              <input
                className="field"
                id="azure-endpoint"
                onChange={(event) => update({ endpoint: event.target.value })}
                placeholder="https://resource.openai.azure.com"
                type="url"
                value={draft.endpoint}
              />
            </label>
          ) : null}

          {draft.connector === "bedrock" ? (
            <>
              <label className="field-group" htmlFor="bedrock-region">
                <span className="field-label">AWS region</span>
                <input
                  className="field"
                  id="bedrock-region"
                  onChange={(event) => update({ region: event.target.value })}
                  placeholder="us-east-1"
                  value={draft.region}
                />
              </label>
              <SecretField
                id="bedrock-access-key"
                label="AWS access-key ID"
                onChange={(accessKeyId) => update({ accessKeyId })}
                value={draft.accessKeyId}
              />
              <SecretField
                id="bedrock-secret-key"
                label="AWS secret-access key"
                onChange={(secretAccessKey) => update({ secretAccessKey })}
                value={draft.secretAccessKey}
              />
              <SecretField
                id="bedrock-session-token"
                label="AWS session token"
                onChange={(sessionToken) => update({ sessionToken })}
                optional
                value={draft.sessionToken}
              />
            </>
          ) : null}

          {draft.connector === "vertex_ai" ? (
            <div className="connector-cloud-fields">
              <label className="field-group" htmlFor="vertex-project">
                <span className="field-label">Project ID</span>
                <input
                  className="field"
                  id="vertex-project"
                  onChange={(event) => update({ projectId: event.target.value })}
                  placeholder="my-google-project"
                  value={draft.projectId}
                />
              </label>
              <label className="field-group" htmlFor="vertex-location">
                <span className="field-label">Location</span>
                <input
                  className="field"
                  id="vertex-location"
                  onChange={(event) => update({ location: event.target.value })}
                  placeholder="us-central1"
                  value={draft.location}
                />
              </label>
            </div>
          ) : null}

          {draft.connector !== "bedrock" ? (
            <SecretField
              id="connector-credential"
              label={
                draft.connector === "gemini"
                  ? "API key"
                  : draft.authenticationMethod.includes("token")
                    ? "Access token"
                    : "API key"
              }
              onChange={(credential) => update({ credential })}
              value={draft.credential}
            />
          ) : null}

          {usesModelFlow && availableModels.length ? (
            <div className="connector-model-access">
              <div className="connector-model-access-row">
                <div className="field-group">
                  <span className="field-label">Default model</span>
                  <UiDropdown
                    ariaLabel="Default model"
                    onChange={(defaultModel) => update({ defaultModel })}
                    options={availableModels.map((model) => ({
                      value: model.id,
                      label: model.displayName,
                      meta: model.id,
                    }))}
                    placeholder="Choose a model"
                    value={draft.defaultModel}
                  />
                  <small className="connector-model-count">
                    {availableModels.length} model
                    {availableModels.length === 1 ? "" : "s"} returned by this
                    provider
                  </small>
                </div>
                <button
                  className="connector-default-button connector-model-test-button"
                  disabled={
                    Boolean(checking) ||
                    !draft.defaultModel ||
                    Boolean(modelAccessVerified[activeConnector ?? "openai"])
                  }
                  onClick={() => void verifyModel()}
                  type="button"
                >
                  {checkingOperation === "model"
                    ? "Checking model…"
                    : modelAccessVerified[activeConnector ?? "openai"]
                      ? "Access verified"
                      : "Test model access"}
                </button>
              </div>
              {modelAccessVerified[activeConnector ?? "openai"] ? (
                <div className="connector-model-verified" role="status">
                  <CheckIcon width={14} height={14} />
                  Access to {draft.defaultModel} verified
                </div>
              ) : modelAccessErrors[activeConnector ?? "openai"] ? (
                <p className="connector-model-error" role="alert">
                  {modelAccessErrors[activeConnector ?? "openai"]}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="credential-discard-notice">
            <strong>Encrypted project credential</strong>
            <p>
              After a successful check, this credential is encrypted on the
              server and saved only for this project. Entering a new credential
              replaces this provider&apos;s existing connection.
            </p>
          </div>

          {error ? (
            <p className="connector-error" role="alert">
              {error}
            </p>
          ) : null}

          {summary ? (
            <>
              <div className="connector-success" role="status">
                <CheckIcon width={16} height={16} />
                <div>
                  <strong>Connected</strong>
                  <p>
                    Provider and selected-model access verified{" "}
                    {new Date(summary.verifiedAt).toLocaleString()}.
                    {"defaultModel" in summary && summary.defaultModel
                      ? ` Default model: ${summary.defaultModel}.`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="connector-management-actions">
                {manageDefault &&
                defaultConnector !== summary.connector ? (
                  <button
                    className="connector-default-button"
                    onClick={() =>
                      onDefaultConnectorChange(summary.connector)
                    }
                    type="button"
                  >
                    Set as default connector
                  </button>
                ) : manageDefault ? (
                  <span className="connector-current-default">
                    <CheckIcon width={13} height={13} />
                    Used as default
                  </span>
                ) : null}
                <button
                  className="connector-remove-button"
                  onClick={() => setRemovingConnector(summary.connector)}
                  type="button"
                >
                  Remove connection
                </button>
              </div>
            </>
          ) : (
            <div className="connector-unverified-actions">
              {usesModelFlow && !availableModels.length ? (
                <button
                  className="button-primary connector-check-button"
                  disabled={Boolean(checking) || !draft.credential.trim()}
                  onClick={() => void discoverModels()}
                  type="button"
                >
                  {checking === activeConnector ? (
                    <span className="connector-spinner" />
                  ) : null}
                  {checkingOperation === "models"
                    ? "Validating key…"
                    : "Validate key & fetch models"}
                </button>
              ) : null}
              {usesModelFlow && availableModels.length ? (
                <button
                  className="button-primary connector-check-button"
                  disabled={
                    Boolean(checking) ||
                    !modelAccessVerified[activeConnector ?? "openai"]
                  }
                  onClick={() => void establish()}
                  type="button"
                >
                  {checkingOperation === "establish" ? (
                    <span className="connector-spinner" />
                  ) : null}
                  {checkingOperation === "establish"
                    ? "Establishing…"
                    : "Establish connection"}
                </button>
              ) : null}
              {!usesModelFlow ? (
                <button
                  className="button-primary connector-check-button"
                  disabled={Boolean(checking)}
                  onClick={() => void establish()}
                  type="button"
                >
                  {checkingOperation === "establish" ? (
                    <span className="connector-spinner" />
                  ) : null}
                  {checkingOperation === "establish"
                    ? "Checking access…"
                    : "Check & establish connection"}
                </button>
              ) : null}
              {storedSummary ? (
                <button
                  className="connector-remove-button"
                  disabled={Boolean(checking)}
                  onClick={() => setRemovingConnector(storedSummary.connector)}
                  type="button"
                >
                  Remove saved connector
                </button>
              ) : null}
            </div>
          )}
        </section>
      ) : (
        <p className="connector-selection-hint">
          Choose a provider to add a project connection. You can connect
          multiple providers, with one saved connection per provider.
        </p>
      )}
      {removingConnector ? (
        <DeleteConfirmationDialog
          confirmLabel="Remove connection"
          description={`This permanently removes the ${connectorLabels[removingConnector]} connection, its encrypted credential, and any project agents that use it.`}
          onClose={() => setRemovingConnector(null)}
          onConfirm={() => removeConnection(removingConnector)}
          pendingLabel="Removing connection…"
          title="Remove connection?"
        />
      ) : null}
    </div>
  );
}
