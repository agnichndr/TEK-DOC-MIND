"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter } from "next/navigation";

import { saveProjectAgentAction } from "@/actions/agentActions";
import {
  deleteProjectPipelineAction,
  saveProjectPipelineAction,
} from "@/actions/pipelineActions";
import {
  LlmConnectorDropdown,
  type LlmConnectorDropdownStatus,
} from "@/components/forms/LlmConnectorDropdown";
import { connectorLabels } from "@/components/forms/LlmConnectorStep";
import { MarkdownCodeEditor } from "@/components/forms/MarkdownCodeEditor";
import { MarkdownViewer } from "@/components/forms/MarkdownViewer";
import { DeleteConfirmationDialog } from "@/components/ui/DeleteConfirmationDialog";
import {
  ArrowIcon,
  CheckIcon,
  DocumentIcon,
  GitHubIcon,
  LayersIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from "@/components/ui/Icons";
import { LlmProviderLogo } from "@/components/ui/LlmProviderLogo";
import {
  ModuleListControls,
  type ModuleListView,
} from "@/components/ui/ModuleListControls";
import {
  ModuleProductTour,
  type ModuleTourStep,
} from "@/components/ui/ModuleProductTour";
import { UiDropdown } from "@/components/ui/UiDropdown";
import {
  parsePipelineYaml,
  serializePipelineYaml,
} from "@/lib/pipelineYaml";
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
  LlmProviderModel,
} from "@/types/llmConnector";
import {
  MAX_PIPELINE_UPLOAD_BYTES,
  MAX_PIPELINE_UPLOAD_COUNT,
  MAX_PIPELINE_UPLOAD_TOTAL_BYTES,
  type ProjectUpload,
  type PipelineNode,
  type PipelineEdgeAnchor,
  type ProjectPipeline,
  type ProjectPipelineInput,
  type PipelineNodeOutput,
  type PipelineOutputFileType,
} from "@/types/pipeline";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 126;
const NODE_GAP = 290;
const OUTPUT_FILE_WIDTH = 230;
const OUTPUT_FILE_HEIGHT = 112;
const OUTPUT_FILE_GAP = 54;

const pipelineBuilderTourSteps: ModuleTourStep[] = [
  {
    selector: "#tour-pipeline-builder-intro",
    title: "Build the workflow",
    description:
      "This editor turns repository context into a connected sequence of agents and document outputs.",
    placement: "bottom",
  },
  {
    selector: "#tour-pipeline-identity",
    title: "Name the outcome",
    description:
      "Give the pipeline a clear name and describe the document workflow it is responsible for.",
    placement: "bottom",
  },
  {
    selector: "#tour-pipeline-defaults",
    title: "Choose sensible defaults",
    description:
      "Select the connector and model that new agents should inherit unless their own configuration overrides them.",
    placement: "bottom",
  },
  {
    selector: "#tour-pipeline-source",
    title: "Start with repository context",
    description:
      "Every run begins here. The selected GitHub Repository Group supplies the source material at runtime.",
    placement: "right",
  },
  {
    selector: "#tour-pipeline-add",
    title: "Extend the graph",
    description:
      "Use + to add an agent or define an output file. Drag a node port to connect additional branches and outputs.",
    placement: "right",
  },
  {
    selector: "#tour-pipeline-save",
    title: "Complete and save",
    description:
      "A valid pipeline needs an agent connected to the repository flow and at least one output file.",
    placement: "top",
  },
];

type LinkAnchor = Exclude<PipelineEdgeAnchor, "right">;
type EditorMode = "write" | "preview";

const linkAnchors: LinkAnchor[] = ["top", "bottom", "left"];

const outputFileTypes: Array<{ value: PipelineOutputFileType; label: string }> = [
  { value: "html", label: "HTML" },
  { value: "xml", label: "XML" },
  { value: "md", label: "Markdown (MD)" },
  { value: "txt", label: "Text (TXT)" },
  { value: "json", label: "JSON" },
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPEG" },
  { value: "mermaid", label: "Mermaid" },
  { value: "yml", label: "YML" },
  { value: "yaml", label: "YAML" },
  { value: "odt", label: "ODT" },
  { value: "rtf", label: "RTF" },
  { value: "docx", label: "DOCX" },
  { value: "pdf", label: "PDF" },
  { value: "csv", label: "CSV" },
  { value: "svg", label: "SVG" },
];

function anchorPoint(node: PipelineNode, anchor: PipelineEdgeAnchor) {
  if (anchor === "right") {
    return {
      x: node.position.x + NODE_WIDTH,
      y: node.position.y + NODE_HEIGHT / 2,
    };
  }
  if (anchor === "top") {
    return { x: node.position.x + NODE_WIDTH / 2, y: node.position.y };
  }
  if (anchor === "bottom") {
    return {
      x: node.position.x + NODE_WIDTH / 2,
      y: node.position.y + NODE_HEIGHT,
    };
  }
  return { x: node.position.x, y: node.position.y + NODE_HEIGHT / 2 };
}

function closestAnchor(from: PipelineNode, to: PipelineNode): LinkAnchor {
  const deltaX = to.position.x - from.position.x;
  const deltaY = to.position.y - from.position.y;
  if (deltaX < 0 && Math.abs(deltaX) >= Math.abs(deltaY)) return "left";
  return deltaY < 0 ? "top" : "bottom";
}

function anchorDirection(anchor: PipelineEdgeAnchor) {
  if (anchor === "right") return { x: 1, y: 0 };
  if (anchor === "top") return { x: 0, y: -1 };
  if (anchor === "bottom") return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

type MemoryUpload = {
  id: string;
  file: File;
};

function formatFileSize(size: number) {
  if (size < 1_024) return `${size} B`;
  if (size < 1_048_576) return `${Math.round(size / 1_024)} KB`;
  return `${(size / 1_048_576).toFixed(1)} MB`;
}

function outputSourceNodeIds(node: PipelineNode) {
  if (!node.output) return [];
  return node.output.sourceNodeIds ?? [node.id];
}

function outputFilePath(output: PipelineNodeOutput) {
  const parent = output.parentPath === "/"
    ? "/"
    : `${output.parentPath.replace(/\/$/, "")}/`;
  return `${parent}${output.fileName}.${output.fileType}`;
}

function pruneOutputMappings(nodes: PipelineNode[], remainingNodeIds: Set<string>) {
  return nodes.map((node) => {
    if (!node.output) return node;
    const sourceNodeIds = outputSourceNodeIds(node).filter((id) =>
      remainingNodeIds.has(id),
    );
    const sourceHeaders = Object.fromEntries(
      Object.entries(node.output.sourceHeaders ?? {}).filter(([sourceNodeId]) =>
        sourceNodeIds.includes(sourceNodeId),
      ),
    );
    return {
      ...node,
      output: {
        ...node.output,
        sourceNodeIds,
        sourceHeaders: Object.keys(sourceHeaders).length ? sourceHeaders : undefined,
      },
    };
  });
}

type PipelinePoint = { x: number; y: number };

function connectionCurve(
  start: PipelinePoint,
  end: PipelinePoint,
  startDirection: PipelinePoint,
  endDirection: PipelinePoint,
) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const curve = Math.max(60, distance * 0.32);
  const controlStart = {
    x: start.x + startDirection.x * curve,
    y: start.y + startDirection.y * curve,
  };
  const controlEnd = {
    x: end.x + endDirection.x * curve,
    y: end.y + endDirection.y * curve,
  };
  const midpoint = {
    x: (start.x + 3 * controlStart.x + 3 * controlEnd.x + end.x) / 8,
    y: (start.y + 3 * controlStart.y + 3 * controlEnd.y + end.y) / 8,
  };
  return {
    path: `M ${start.x} ${start.y} C ${controlStart.x} ${controlStart.y}, ${controlEnd.x} ${controlEnd.y}, ${end.x} ${end.y}`,
    midpoint,
  };
}

function outputConnectionGeometry(
  sourceNode: PipelineNode,
  outputPosition: PipelinePoint,
) {
  const sourceCenter = {
    x: sourceNode.position.x + NODE_WIDTH / 2,
    y: sourceNode.position.y + NODE_HEIGHT / 2,
  };
  const outputCenter = {
    x: outputPosition.x + OUTPUT_FILE_WIDTH / 2,
    y: outputPosition.y + OUTPUT_FILE_HEIGHT / 2,
  };
  const deltaX = outputCenter.x - sourceCenter.x;
  const deltaY = outputCenter.y - sourceCenter.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    const sourceAnchor: PipelineEdgeAnchor = deltaX >= 0 ? "right" : "left";
    const start = anchorPoint(sourceNode, sourceAnchor);
    const end = {
      x: deltaX >= 0 ? outputPosition.x : outputPosition.x + OUTPUT_FILE_WIDTH,
      y: outputCenter.y,
    };
    return connectionCurve(
      start,
      end,
      anchorDirection(sourceAnchor),
      { x: deltaX >= 0 ? -1 : 1, y: 0 },
    );
  }
  const sourceAnchor: PipelineEdgeAnchor = deltaY >= 0 ? "bottom" : "top";
  const start = anchorPoint(sourceNode, sourceAnchor);
  const end = {
    x: outputCenter.x,
    y: deltaY >= 0 ? outputPosition.y : outputPosition.y + OUTPUT_FILE_HEIGHT,
  };
  return connectionCurve(
    start,
    end,
    anchorDirection(sourceAnchor),
    { x: 0, y: deltaY >= 0 ? -1 : 1 },
  );
}

function PipelineConnection({
  ariaLabel,
  output = false,
  path,
  midpoint,
  onRemove,
}: {
  ariaLabel: string;
  output?: boolean;
  path: string;
  midpoint: PipelinePoint;
  onRemove: () => void;
}) {
  return (
    <g className={`pipeline-edge-interactive ${output ? "output" : "workflow"}`}>
      <path
        className={`pipeline-edge-visible ${output ? "pipeline-output-edge" : ""}`}
        d={path}
        markerEnd={output ? "url(#pipeline-output-arrow)" : "url(#pipeline-arrow)"}
      />
      <path className="pipeline-edge-hit" d={path} />
      <g
        aria-label={ariaLabel}
        className="pipeline-edge-remove-indicator"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onRemove();
        }}
        role="button"
        tabIndex={0}
        transform={`translate(${midpoint.x} ${midpoint.y})`}
      >
        <circle r="10" />
        <line x1="-3" x2="3" y1="-3" y2="3" />
        <line x1="3" x2="-3" y1="-3" y2="3" />
      </g>
    </g>
  );
}

function reachableNodeIds(
  nodes: PipelineNode[],
  edges: ProjectPipelineInput["edges"],
) {
  const source = nodes.find((node) => node.kind === "source");
  const reachable = new Set<string>();
  const pending = source ? [source.id] : [];
  while (pending.length) {
    const nodeId = pending.pop()!;
    if (reachable.has(nodeId)) continue;
    reachable.add(nodeId);
    pending.push(
      ...edges
        .filter((edge) => edge.fromNodeId === nodeId)
        .map((edge) => edge.toNodeId),
    );
  }
  return reachable;
}

function emptyPipeline(connectors: LlmConnectorSummary[]): ProjectPipelineInput {
  const connector = connectors[0];
  return {
    name: "",
    description: "",
    defaultConnector: connector?.connector ?? "openai",
    defaultModel: connector?.defaultModel ?? "",
    nodes: [
      {
        id: crypto.randomUUID(),
        kind: "source",
        position: { x: 48, y: 176 },
        inputMediaUrls: [],
      },
    ],
    edges: [],
  };
}

function emptyAgent(connectors: LlmConnectorSummary[]): ProjectAgentInput {
  return {
    name: "",
    description: "",
    connector: connectors[0]!.connector,
    model: connectors[0]!.defaultModel ?? "",
    outputMode: "single",
    outputType: "text",
    skillsMarkdown:
      "# Skills\n\nDescribe this agent's role in the pipeline, instructions, and constraints.",
  };
}

function PipelineAgentDialog({
  connectors,
  onCancel,
  onSaved,
}: {
  connectors: LlmConnectorSummary[];
  onCancel: () => void;
  onSaved: (agent: ProjectAgent) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() => emptyAgent(connectors));
  const [editorMode, setEditorMode] = useState<EditorMode>("write");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<LlmProviderModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [modelError, setModelError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const connector = draft.connector;
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
        setModels(result.models);
        setDraft((current) =>
          current.connector === connector &&
          !result.models.some((model) => model.id === current.model)
            ? { ...current, model: result.models[0]?.id ?? "" }
            : current,
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setModels([]);
          setModelError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [draft.connector]);

  const update = (changes: Partial<ProjectAgentInput>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setMessage("");
    setFields((current) => {
      const next = { ...current };
      for (const key of Object.keys(changes)) delete next[key];
      return next;
    });
  };

  const save = async () => {
    if (saving) return;
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
    onSaved(result.resource);
  };

  const importMarkdown = async (file: File | undefined) => {
    if (!file) return;

    try {
      if (!file.name.toLowerCase().endsWith(".md")) {
        setMessage("Choose a Markdown file ending in .md.");
        return;
      }
      if (file.size > 512_000) {
        setMessage("The Markdown file is too large.");
        return;
      }

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

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-label="Create an agent for this pipeline"
        aria-modal="true"
        className="confirmation-dialog pipeline-agent-dialog"
        role="dialog"
      >
        <button
          aria-label="Close agent creation"
          className="dialog-close"
          disabled={saving}
          onClick={onCancel}
          type="button"
        >
          <XIcon />
        </button>
        <p className="eyebrow">Create while editing</p>
        <h2>New pipeline agent</h2>
        <p>The agent is saved to this project before it is added to the canvas.</p>

        <div className="pipeline-agent-form-grid">
          <label className="field-group">
            <span className="field-label">Agent name</span>
            <input
              aria-invalid={Boolean(fields.name)}
              className="field"
              maxLength={120}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="Documentation writer"
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
              placeholder="Writes a technical document from repository context"
              value={draft.description}
            />
          </label>
          <div className="field-group">
            <span className="field-label">LLM connector</span>
            <LlmConnectorDropdown
              onChange={(connector) => {
                setLoading(true);
                setModelError(false);
                setModels([]);
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
                  loading && connector.connector === draft.connector
                    ? "checking"
                    : modelError && connector.connector === draft.connector
                      ? "connection_error"
                      : "connected"
                ) satisfies LlmConnectorDropdownStatus,
              }))}
              value={draft.connector}
            />
          </div>
          <div className="field-group">
            <span className="field-label">Model</span>
            <UiDropdown
              ariaInvalid={Boolean(fields.model)}
              ariaLabel="Pipeline agent model"
              emptyText="No models returned by this connector."
              loading={loading}
              loadingText="Loading provider models…"
              onChange={(model) => update({ model })}
              options={models.map((model) => ({
                value: model.id,
                label: model.displayName,
                meta: model.id,
              }))}
              placeholder="Select a model"
              value={draft.model}
            />
            {modelError ? (
              <span className="field-error">Models could not be loaded.</span>
            ) : null}
          </div>
          <div className="field-group">
            <span className="field-label">Output behavior</span>
            <UiDropdown
              ariaLabel="Pipeline agent output behavior"
              onChange={(outputMode) =>
                update({ outputMode: outputMode as AgentOutputMode })
              }
              options={[
                { value: "single", label: "Single output" },
                { value: "multiple", label: "Multiple outputs" },
              ]}
              value={draft.outputMode}
            />
          </div>
          <div className="field-group">
            <span className="field-label">Output type</span>
            <UiDropdown
              ariaLabel="Pipeline agent output type"
              onChange={(outputType) =>
                update({ outputType: outputType as AgentOutputType })
              }
              options={[
                { value: "text", label: "Text" },
                { value: "json", label: "JSON" },
                { value: "html", label: "HTML" },
                { value: "xml", label: "XML" },
                { value: "image", label: "Image" },
              ]}
              value={draft.outputType}
            />
          </div>
        </div>
        <div className="field-group pipeline-agent-skills-section">
          <span className="field-label">Skills instructions</span>
          <div className="markdown-editor pipeline-agent-markdown-editor">
            <div className="markdown-editor-toolbar">
              <div aria-label="Skills Markdown view" role="tablist">
                <button
                  aria-controls="pipeline-agent-skills-write"
                  aria-selected={editorMode === "write"}
                  className={editorMode === "write" ? "active" : ""}
                  id="pipeline-agent-skills-write-tab"
                  onClick={() => setEditorMode("write")}
                  role="tab"
                  type="button"
                >
                  Write
                </button>
                <button
                  aria-controls="pipeline-agent-skills-preview"
                  aria-selected={editorMode === "preview"}
                  className={editorMode === "preview" ? "active" : ""}
                  id="pipeline-agent-skills-preview-tab"
                  onClick={() => setEditorMode("preview")}
                  role="tab"
                  type="button"
                >
                  Preview
                </button>
              </div>
              <label className="markdown-upload-button">
                <DocumentIcon height={14} width={14} /> Import .md
                <input
                  accept=".md,text/markdown,text/plain"
                  onChange={(event) =>
                    void importMarkdown(event.target.files?.[0])
                  }
                  ref={fileInputRef}
                  type="file"
                />
              </label>
            </div>
            <div
              aria-labelledby={
                editorMode === "write"
                  ? "pipeline-agent-skills-write-tab"
                  : "pipeline-agent-skills-preview-tab"
              }
              id={
                editorMode === "write"
                  ? "pipeline-agent-skills-write"
                  : "pipeline-agent-skills-preview"
              }
              role="tabpanel"
            >
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
            </div>
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
        </div>
        {message ? <p className="form-message" role="alert">{message}</p> : null}
        <div className="dialog-actions">
          <button className="button-secondary" disabled={saving} onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className="button-primary"
            disabled={saving || loading || !draft.model}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "Saving agent…" : "Save & add agent"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function PipelinePanel({
  connectors,
  initialAgents,
  initialPipelines,
  initialUploads,
  onNavigateConnectors,
  projectId,
  projectName,
}: {
  connectors: LlmConnectorSummary[];
  initialAgents: ProjectAgent[];
  initialPipelines: ProjectPipeline[];
  initialUploads: ProjectUpload[];
  onNavigateConnectors: () => void;
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [pipelines, setPipelines] = useState(initialPipelines);
  const [pipelineQuery, setPipelineQuery] = useState("");
  const [pipelineView, setPipelineView] = useState<ModuleListView>("cards");
  const [projectUploads, setProjectUploads] = useState(initialUploads);
  const [agents, setAgents] = useState(initialAgents);
  const [draft, setDraft] = useState<ProjectPipelineInput | null>(null);
  const [addingFromNodeId, setAddingFromNodeId] = useState<string | null>(null);
  const [agentQuery, setAgentQuery] = useState("");
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const [editingOutputNodeId, setEditingOutputNodeId] = useState<string | null>(null);
  const [editingOutputMappingsNodeId, setEditingOutputMappingsNodeId] =
    useState<string | null>(null);
  const [editingOutputsNodeId, setEditingOutputsNodeId] = useState<string | null>(null);
  const [outputDraft, setOutputDraft] = useState<PipelineNodeOutput>({
    parentPath: "/",
    fileName: "",
    fileType: "md",
    sourceNodeIds: [],
    sourceHeaders: {},
  });
  const [outputMessage, setOutputMessage] = useState("");
  const [linkingFromNodeId, setLinkingFromNodeId] = useState<string | null>(null);
  const [linkingFromAnchor, setLinkingFromAnchor] =
    useState<PipelineEdgeAnchor>("bottom");
  const [linkDrag, setLinkDrag] = useState<{
    fromNodeId: string;
    anchor: LinkAnchor;
    originX: number;
    originY: number;
    x: number;
    y: number;
  } | null>(null);
  const [linkMessage, setLinkMessage] = useState("");
  const linkDragRef = useRef<typeof linkDrag>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [editingInputsNodeId, setEditingInputsNodeId] = useState<string | null>(null);
  const [memoryUploads, setMemoryUploads] = useState<MemoryUpload[]>([]);
  const [nodeUploadIds, setNodeUploadIds] = useState<Record<string, string[]>>({});
  const [uploadMessage, setUploadMessage] = useState("");
  const [deletingPipeline, setDeletingPipeline] =
    useState<ProjectPipeline | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pipelineModels, setPipelineModels] = useState<LlmProviderModel[]>([]);
  const [loadingPipelineModels, setLoadingPipelineModels] = useState(false);
  const [pipelineModelMessage, setPipelineModelMessage] = useState("");
  const [drag, setDrag] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    nodeX: number;
    nodeY: number;
  } | null>(null);
  const [outputDrag, setOutputDrag] = useState<{
    outputNodeId: string;
    startX: number;
    startY: number;
    outputX: number;
    outputY: number;
  } | null>(null);
  const normalizedPipelineQuery = pipelineQuery.trim().toLocaleLowerCase();
  const visiblePipelines = normalizedPipelineQuery
    ? pipelines.filter((pipeline) => {
        const searchableValues = [
          pipeline.name,
          pipeline.description,
          connectorLabels[pipeline.defaultConnector],
          pipeline.defaultModel,
          ...pipeline.nodes.flatMap((node) => {
            const nodeAgent = node.kind === "agent"
              ? agents.find((agent) => agent.id === node.agentId)
              : null;
            return [
              nodeAgent?.name ?? "",
              node.output ? outputFilePath(node.output) : "",
            ];
          }),
        ];
        return searchableValues.some((value) =>
          value.toLocaleLowerCase().includes(normalizedPipelineQuery),
        );
      })
    : pipelines;

  useEffect(() => {
    const connector = draft?.defaultConnector;
    if (!connector) return;
    const controller = new AbortController();
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
        setPipelineModels(result.models);
        setDraft((current) => {
          if (!current || current.defaultConnector !== connector) return current;
          if (result.models.some((model) => model.id === current.defaultModel)) {
            return current;
          }
          return { ...current, defaultModel: result.models[0]?.id ?? "" };
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPipelineModels([]);
          setPipelineModelMessage("Models could not be loaded for this connector.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPipelineModels(false);
      });
    return () => controller.abort();
  }, [draft?.defaultConnector]);

  const openEditor = (pipeline: ProjectPipelineInput) => {
    setDraft(pipeline);
    setMessage("");
    setFields({});
    setAddingFromNodeId(null);
    setExpandedNodeId(null);
    setEditingOutputNodeId(null);
    setEditingOutputMappingsNodeId(null);
    setEditingOutputsNodeId(null);
    setLinkingFromNodeId(null);
    setLinkDrag(null);
    setLinkMessage("");
    setOutputDrag(null);
    linkDragRef.current = null;
    setEditingInputsNodeId(null);
    setMemoryUploads([]);
    setNodeUploadIds({});
    setUploadMessage("");
    setLoadingPipelineModels(true);
    setPipelineModelMessage("");
  };

  const update = (changes: Partial<ProjectPipelineInput>) => {
    setDraft((current) => (current ? { ...current, ...changes } : current));
    setMessage("");
    setFields((current) => {
      const next = { ...current };
      for (const key of Object.keys(changes)) delete next[key];
      return next;
    });
  };

  const addAgentNode = (agent: ProjectAgent) => {
    if (!draft || !addingFromNodeId) return;
    const parent = draft.nodes.find((node) => node.id === addingFromNodeId);
    if (!parent) return;
    const siblingCount = draft.edges.filter(
      (edge) => edge.fromNodeId === parent.id,
    ).length;
    const x = parent.position.x + NODE_GAP;
    if (x > 4_000) {
      setMessage("Move this node left before extending the pipeline.");
      return;
    }
    const node: PipelineNode = {
      id: crypto.randomUUID(),
      kind: "agent",
      agentId: agent.id,
      position: {
        x,
        y: Math.min(4_000, parent.position.y + siblingCount * 156),
      },
      inputMediaUrls: [],
    };
    update({
      nodes: [...draft.nodes, node],
      edges: [
        ...draft.edges,
        {
          id: crypto.randomUUID(),
          fromNodeId: parent.id,
          toNodeId: node.id,
          sourceAnchor: "right",
        },
      ],
    });
    setAddingFromNodeId(null);
    setCreatingAgent(false);
    setAgentQuery("");
  };

  const openAgentPicker = (nodeId: string) => {
    setAgentQuery("");
    setAddingFromNodeId(nodeId);
    setLinkingFromNodeId(null);
    setExpandedNodeId(null);
  };

  const openOutputEditor = (node: PipelineNode) => {
    setOutputDraft(
      node.output
        ? { ...node.output, sourceNodeIds: outputSourceNodeIds(node) }
        : {
            parentPath: "/",
            fileName: "",
            fileType: "md",
            sourceNodeIds: [node.id],
            sourceHeaders: {},
          },
    );
    setOutputMessage("");
    setEditingOutputNodeId(node.id);
    setEditingOutputsNodeId(null);
    setExpandedNodeId(null);
  };

  const saveNodeOutput = () => {
    if (!draft || !editingOutputNodeId) return;
    const normalized: PipelineNodeOutput = {
      ...outputDraft,
      parentPath: outputDraft.parentPath.trim() || "/",
      fileName: outputDraft.fileName.trim(),
      sourceNodeIds: outputDraft.sourceNodeIds
        ? Array.from(new Set(outputDraft.sourceNodeIds))
        : [editingOutputNodeId],
    };
    if (!normalized.parentPath.startsWith("/")) {
      setOutputMessage("Output parent path must start with /.");
      return;
    }
    if (normalized.parentPath.split("/").includes("..")) {
      setOutputMessage("Output parent path cannot contain .. segments.");
      return;
    }
    if (!normalized.fileName || /[\\/]/.test(normalized.fileName)) {
      setOutputMessage("Enter a file name without slashes.");
      return;
    }
    update({
      nodes: draft.nodes.map((node) =>
        node.id === editingOutputNodeId ? { ...node, output: normalized } : node,
      ),
    });
    setEditingOutputNodeId(null);
  };

  const removeNodeOutput = () => {
    if (!draft || !editingOutputNodeId) return;
    update({
      nodes: draft.nodes.map((node) => {
        if (node.id !== editingOutputNodeId) return node;
        const { output: _output, ...withoutOutput } = node;
        void _output;
        return withoutOutput;
      }),
    });
    setEditingOutputNodeId(null);
    setEditingOutputMappingsNodeId(null);
  };

  const updateOutputSourceOrder = (
    outputNodeId: string,
    sourceNodeIds: string[],
  ) => {
    if (!draft) return;
    update({
      nodes: draft.nodes.map((node) =>
        node.id === outputNodeId && node.output
          ? {
              ...node,
              output: {
                ...node.output,
                sourceNodeIds,
                sourceHeaders: Object.fromEntries(
                  Object.entries(node.output.sourceHeaders ?? {}).filter(
                    ([sourceNodeId]) => sourceNodeIds.includes(sourceNodeId),
                  ),
                ),
              },
            }
          : node,
      ),
    });
  };

  const updateOutputSourceHeader = (
    outputNodeId: string,
    sourceNodeId: string,
    header: string,
  ) => {
    if (!draft) return;
    update({
      nodes: draft.nodes.map((node) => {
        if (node.id !== outputNodeId || !node.output) return node;
        const sourceNodeIds = outputSourceNodeIds(node);
        if (!sourceNodeIds.includes(sourceNodeId)) return node;
        const sourceHeaders = { ...(node.output.sourceHeaders ?? {}) };
        if (header) sourceHeaders[sourceNodeId] = header;
        else delete sourceHeaders[sourceNodeId];
        return {
          ...node,
          output: {
            ...node.output,
            sourceNodeIds,
            sourceHeaders: Object.keys(sourceHeaders).length
              ? sourceHeaders
              : undefined,
          },
        };
      }),
    });
  };

  const addOutputSource = (outputNodeId: string, sourceNodeId: string) => {
    const outputNode = draft?.nodes.find((node) => node.id === outputNodeId);
    if (!outputNode?.output) return;
    const current = outputSourceNodeIds(outputNode);
    if (current.includes(sourceNodeId) || current.length >= 50) return;
    updateOutputSourceOrder(outputNodeId, [...current, sourceNodeId]);
  };

  const removeOutputSource = (outputNodeId: string, sourceNodeId: string) => {
    const outputNode = draft?.nodes.find((node) => node.id === outputNodeId);
    if (!outputNode?.output) return;
    updateOutputSourceOrder(
      outputNodeId,
      outputSourceNodeIds(outputNode).filter((id) => id !== sourceNodeId),
    );
  };

  const moveOutputSource = (
    outputNodeId: string,
    sourceNodeId: string,
    direction: -1 | 1,
  ) => {
    const outputNode = draft?.nodes.find((node) => node.id === outputNodeId);
    if (!outputNode?.output) return;
    const sourceNodeIds = [...outputSourceNodeIds(outputNode)];
    const index = sourceNodeIds.indexOf(sourceNodeId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= sourceNodeIds.length) return;
    [sourceNodeIds[index], sourceNodeIds[targetIndex]] = [
      sourceNodeIds[targetIndex],
      sourceNodeIds[index],
    ];
    updateOutputSourceOrder(outputNodeId, sourceNodeIds);
  };

  const outputMappingIssue = (sourceNodeId: string, outputNodeId: string) => {
    if (!draft) return "The pipeline is not available.";
    const sourceNode = draft.nodes.find((node) => node.id === sourceNodeId);
    const outputNode = draft.nodes.find((node) => node.id === outputNodeId);
    if (!sourceNode) return "The selected source node is unavailable.";
    if (!outputNode?.output) return "The selected output file is unavailable.";
    if (outputSourceNodeIds(outputNode).includes(sourceNodeId)) {
      return "This node output is already mapped to that file.";
    }
    return null;
  };

  const connectNodeToOutput = (sourceNodeId: string, outputNodeId: string) => {
    const issue = outputMappingIssue(sourceNodeId, outputNodeId);
    if (issue) {
      setLinkMessage(issue);
      setLinkDrag(null);
      linkDragRef.current = null;
      return;
    }
    addOutputSource(outputNodeId, sourceNodeId);
    setLinkingFromNodeId(null);
    setLinkDrag(null);
    setLinkMessage("");
    linkDragRef.current = null;
  };

  const connectionIssue = (fromNodeId: string, toNodeId: string) => {
    if (!draft) return "The pipeline is not available.";
    if (fromNodeId === toNodeId) return "A node cannot link to itself.";
    const source = draft.nodes.find((node) => node.id === fromNodeId);
    const target = draft.nodes.find((node) => node.id === toNodeId);
    if (!source || !target) return "The selected pipeline node is unavailable.";
    if (target.kind === "source") {
      return "The GitHub source can only start a pipeline and cannot receive a link.";
    }
    if (
      draft.edges.some(
        (edge) =>
          edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId,
      )
    ) {
      return "These nodes are already connected.";
    }
    const pending = [toNodeId];
    const visited = new Set<string>();
    while (pending.length) {
      const nodeId = pending.pop()!;
      if (nodeId === fromNodeId) {
        return "Link blocked: this connection would create a circular dependency.";
      }
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      pending.push(
        ...draft.edges
          .filter((edge) => edge.fromNodeId === nodeId)
          .map((edge) => edge.toNodeId),
      );
    }
    return null;
  };

  const canConnectNodes = (fromNodeId: string, toNodeId: string) => {
    return connectionIssue(fromNodeId, toNodeId) === null;
  };

  const connectNodes = (
    fromNodeId: string,
    toNodeId: string,
    sourceAnchor: PipelineEdgeAnchor,
  ) => {
    if (!draft || !canConnectNodes(fromNodeId, toNodeId)) return;
    update({
      edges: [
        ...draft.edges,
        {
          id: crypto.randomUUID(),
          fromNodeId,
          toNodeId,
          sourceAnchor,
        },
      ],
    });
    setLinkingFromNodeId(null);
    setLinkDrag(null);
    setLinkMessage("");
    linkDragRef.current = null;
  };

  const pointOnCanvas = (clientX: number, clientY: number) => {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return { x: clientX - bounds.left, y: clientY - bounds.top };
  };

  const beginLinkDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    fromNode: PipelineNode,
    anchor: LinkAnchor,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const point = pointOnCanvas(event.clientX, event.clientY);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = anchorPoint(fromNode, anchor);
    const nextLinkDrag = {
      fromNodeId: fromNode.id,
      anchor,
      originX: origin.x,
      originY: origin.y,
      ...point,
    };
    linkDragRef.current = nextLinkDrag;
    setLinkDrag(nextLinkDrag);
    setLinkingFromNodeId(null);
    setLinkMessage("");
  };

  const moveLinkDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!linkDragRef.current) return;
    const point = pointOnCanvas(event.clientX, event.clientY);
    if (!point) return;
    const nextLinkDrag = { ...linkDragRef.current, ...point };
    linkDragRef.current = nextLinkDrag;
    setLinkDrag(nextLinkDrag);
  };

  const finishLinkDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const currentLinkDrag = linkDragRef.current;
    if (!currentLinkDrag) return;
    const hitTarget = document.elementFromPoint(event.clientX, event.clientY);
    const outputTarget = hitTarget?.closest<HTMLElement>(
      "[data-pipeline-output-node-id]",
    );
    const outputNodeId = outputTarget?.dataset.pipelineOutputNodeId;
    if (outputNodeId) {
      connectNodeToOutput(currentLinkDrag.fromNodeId, outputNodeId);
      return;
    }
    const target = hitTarget?.closest<HTMLElement>("[data-pipeline-node-id]");
    const toNodeId = target?.dataset.pipelineNodeId;
    if (toNodeId) {
      const issue = connectionIssue(currentLinkDrag.fromNodeId, toNodeId);
      if (issue) {
        setLinkMessage(issue);
        setLinkDrag(null);
        linkDragRef.current = null;
      } else {
        connectNodes(currentLinkDrag.fromNodeId, toNodeId, currentLinkDrag.anchor);
      }
    } else {
      setLinkDrag(null);
      linkDragRef.current = null;
    }
  };

  const cancelLinkDrag = () => {
    setLinkDrag(null);
    linkDragRef.current = null;
  };

  const validatePortablePipeline = (pipeline: ProjectPipelineInput) => {
    if (!connectors.some((item) => item.connector === pipeline.defaultConnector)) {
      throw new Error("The YAML default connector is not connected to this project.");
    }
    const agentIds = new Set(agents.map((agent) => agent.id));
    if (
      pipeline.nodes.some(
        (node) => node.kind === "agent" && !agentIds.has(node.agentId),
      )
    ) {
      throw new Error("The YAML references an agent that is not available in this project.");
    }
    return pipeline;
  };

  const importPipelineYaml = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 500_000) throw new Error("Pipeline YAML cannot exceed 500 KB.");
      const imported = parsePipelineYaml(await file.text());
      if (imported.projectId !== projectId) {
        throw new Error("This pipeline YAML belongs to a different project and cannot be imported here.");
      }
      const pipeline = validatePortablePipeline(imported.pipeline);
      openEditor(pipeline);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pipeline YAML could not be imported.");
    }
  };

  const downloadPipelineYaml = (pipeline: ProjectPipelineInput) => {
    const yaml = serializePipelineYaml(pipeline, projectId);
    const url = URL.createObjectURL(new Blob([yaml], { type: "application/yaml" }));
    const link = document.createElement("a");
    link.href = url;
    const filePart = (value: string, fallback: string) =>
      value.trim().replace(/[^A-Za-z0-9-]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
    link.download = `${filePart(projectName, "Project")}_${filePart(pipeline.name, "Pipeline")}.yml`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const removeEdgeAndPrune = (edgeId: string) => {
    if (!draft) return;
    const remainingEdges = draft.edges.filter((edge) => edge.id !== edgeId);
    const reachable = reachableNodeIds(draft.nodes, remainingEdges);
    const remainingNodes = draft.nodes.filter((node) => reachable.has(node.id));
    const remainingNodeIds = new Set(remainingNodes.map((node) => node.id));
    update({
      nodes: pruneOutputMappings(remainingNodes, remainingNodeIds),
      edges: remainingEdges.filter(
        (edge) =>
          remainingNodeIds.has(edge.fromNodeId) &&
          remainingNodeIds.has(edge.toNodeId),
      ),
    });
    setNodeUploadIds((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([nodeId]) => remainingNodeIds.has(nodeId)),
      ),
    );
  };

  const addMemoryFiles = (nodeId: string, files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const nextCount = memoryUploads.length + selectedFiles.length;
    const nextTotalBytes = [...memoryUploads.map((upload) => upload.file), ...selectedFiles]
      .reduce((total, file) => total + file.size, 0);
    if (nextCount > MAX_PIPELINE_UPLOAD_COUNT) {
      setUploadMessage("A pipeline can upload at most 20 new files per save.");
      return;
    }
    if (selectedFiles.some((file) => file.size < 1 || file.size > MAX_PIPELINE_UPLOAD_BYTES)) {
      setUploadMessage("Each uploaded file must be between 1 byte and 10 MB.");
      return;
    }
    if (nextTotalBytes > MAX_PIPELINE_UPLOAD_TOTAL_BYTES) {
      setUploadMessage("Pending pipeline uploads cannot exceed 50 MB in total.");
      return;
    }
    const node = draft?.nodes.find((item) => item.id === nodeId);
    if (
      (node?.inputMediaUrls.length ?? 0) +
        (nodeUploadIds[nodeId]?.length ?? 0) +
        selectedFiles.length >
      MAX_PIPELINE_UPLOAD_COUNT
    ) {
      setUploadMessage("A node can use at most 20 uploaded files.");
      return;
    }
    setUploadMessage("");
    const nextUploads = selectedFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
    }));
    setMemoryUploads((current) => [...current, ...nextUploads]);
    setNodeUploadIds((current) => ({
      ...current,
      [nodeId]: [
        ...(current[nodeId] ?? []),
        ...nextUploads.map((upload) => upload.id),
      ],
    }));
  };

  const toggleProjectUpload = (nodeId: string, mediaUrl: string) => {
    if (!draft) return;
    const targetNode = draft.nodes.find((node) => node.id === nodeId);
    if (!targetNode) return;
    const selected = targetNode.inputMediaUrls.includes(mediaUrl);
    if (
      !selected &&
      targetNode.inputMediaUrls.length + (nodeUploadIds[nodeId]?.length ?? 0) >=
        MAX_PIPELINE_UPLOAD_COUNT
    ) {
      setUploadMessage("A node can use at most 20 uploaded files.");
      return;
    }
    setUploadMessage("");
    update({
      nodes: draft.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          inputMediaUrls: selected
            ? node.inputMediaUrls.filter((url) => url !== mediaUrl)
            : [...node.inputMediaUrls, mediaUrl],
        };
      }),
    });
  };

  const toggleNodeUpload = (nodeId: string, uploadId: string) => {
    const selected = nodeUploadIds[nodeId] ?? [];
    const node = draft?.nodes.find((item) => item.id === nodeId);
    if (
      !selected.includes(uploadId) &&
      selected.length + (node?.inputMediaUrls.length ?? 0) >=
        MAX_PIPELINE_UPLOAD_COUNT
    ) {
      setUploadMessage("A node can use at most 20 uploaded files.");
      return;
    }
    setUploadMessage("");
    setNodeUploadIds((current) => {
      const currentSelection = current[nodeId] ?? [];
      return {
        ...current,
        [nodeId]: currentSelection.includes(uploadId)
          ? currentSelection.filter((id) => id !== uploadId)
          : [...currentSelection, uploadId],
      };
    });
  };

  const removeNode = (nodeId: string) => {
    if (!draft) return;
    const candidateNodes = draft.nodes.filter((node) => node.id !== nodeId);
    const candidateEdges = draft.edges.filter(
      (edge) => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId,
    );
    const reachable = reachableNodeIds(candidateNodes, candidateEdges);
    const remainingNodeIds = new Set(
      candidateNodes.filter((node) => reachable.has(node.id)).map((node) => node.id),
    );
    update({
      nodes: pruneOutputMappings(
        candidateNodes.filter((node) => remainingNodeIds.has(node.id)),
        remainingNodeIds,
      ),
      edges: candidateEdges.filter(
        (edge) =>
          remainingNodeIds.has(edge.fromNodeId) &&
          remainingNodeIds.has(edge.toNodeId),
      ),
    });
    setNodeUploadIds((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => remainingNodeIds.has(id)),
      ),
    );
  };

  const beginDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    node: PipelineNode,
  ) => {
    if (node.kind === "source") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      nodeX: node.position.x,
      nodeY: node.position.y,
    });
  };

  const moveNode = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draft || !drag) return;
    const x = Math.max(
      0,
      Math.min(4_000, Math.round(drag.nodeX + event.clientX - drag.startX)),
    );
    const y = Math.max(
      0,
      Math.min(4_000, Math.round(drag.nodeY + event.clientY - drag.startY)),
    );
    update({
      nodes: draft.nodes.map((node) =>
        node.id === drag.nodeId ? { ...node, position: { x, y } } : node,
      ),
    });
  };

  const beginOutputDrag = (
    event: ReactPointerEvent<HTMLElement>,
    outputNodeId: string,
    position: PipelinePoint,
  ) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setOutputDrag({
      outputNodeId,
      startX: event.clientX,
      startY: event.clientY,
      outputX: position.x,
      outputY: position.y,
    });
  };

  const moveOutputFile = (event: ReactPointerEvent<HTMLElement>) => {
    if (!draft || !outputDrag) return;
    const x = Math.max(
      0,
      Math.min(4_000, Math.round(outputDrag.outputX + event.clientX - outputDrag.startX)),
    );
    const y = Math.max(
      0,
      Math.min(4_000, Math.round(outputDrag.outputY + event.clientY - outputDrag.startY)),
    );
    update({
      nodes: draft.nodes.map((node) =>
        node.id === outputDrag.outputNodeId && node.output
          ? { ...node, output: { ...node.output, position: { x, y } } }
          : node,
      ),
    });
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setMessage("");
    setFields({});
    const uploadManifest = memoryUploads.flatMap((upload) => {
      const nodeIds = Object.entries(nodeUploadIds)
        .filter(([, uploadIds]) => uploadIds.includes(upload.id))
        .map(([nodeId]) => nodeId);
      return nodeIds.length ? [{ clientId: upload.id, nodeIds }] : [];
    });
    const formData = new FormData();
    formData.set("pipeline", JSON.stringify(draft));
    formData.set("uploadManifest", JSON.stringify(uploadManifest));
    for (const upload of memoryUploads) {
      if (uploadManifest.some((item) => item.clientId === upload.id)) {
        formData.set(`file:${upload.id}`, upload.file);
      }
    }
    const result = await saveProjectPipelineAction(formData);
    setSaving(false);
    if (result.status === "error") {
      setMessage(result.message);
      setFields(result.fields ?? {});
      return;
    }
    const savedPipeline = result.resource.pipeline;
    setPipelines((current) =>
      [
        ...current.filter((pipeline) => pipeline.id !== savedPipeline.id),
        savedPipeline,
      ].sort((left, right) => left.name.localeCompare(right.name)),
    );
    setProjectUploads((current) => [
      ...current,
      ...result.resource.uploads.filter(
        (upload) => !current.some((item) => item.id === upload.id),
      ),
    ]);
    setDraft(null);
    router.refresh();
  };

  const remove = async (pipeline: ProjectPipeline) => {
    const result = await deleteProjectPipelineAction(pipeline.id);
    if (result.status === "error") return result.message;
    setPipelines((current) =>
      current.filter((item) => item.id !== pipeline.id),
    );
    router.refresh();
    return null;
  };

  if (draft) {
    const normalizedAgentQuery = agentQuery.trim().toLocaleLowerCase();
    const filteredAgents = normalizedAgentQuery
      ? agents.filter((agent) =>
          [
            agent.name,
            agent.description,
            agent.model,
            connectorLabels[agent.connector],
          ].some((value) =>
            value.toLocaleLowerCase().includes(normalizedAgentQuery),
          ),
        )
      : agents;
    const inputNode = editingInputsNodeId
      ? draft.nodes.find((node) => node.id === editingInputsNodeId) ?? null
      : null;
    const inputNodeAgent =
      inputNode?.kind === "agent"
        ? agents.find((agent) => agent.id === inputNode.agentId) ?? null
        : null;
    const incomingInputEdges = inputNode
      ? draft.edges.filter((edge) => edge.toNodeId === inputNode.id)
      : [];
    const outputsNode = editingOutputsNodeId
      ? draft.nodes.find((node) => node.id === editingOutputsNodeId) ?? null
      : null;
    const outputsNodeAgent = outputsNode?.kind === "agent"
      ? agents.find((agent) => agent.id === outputsNode.agentId) ?? null
      : null;
    const outgoingOutputEdges = outputsNode
      ? draft.edges.filter((edge) => edge.fromNodeId === outputsNode.id)
      : [];
    const outputNode = editingOutputNodeId
      ? draft.nodes.find((node) => node.id === editingOutputNodeId) ?? null
      : null;
    const outputMappingsNode = editingOutputMappingsNodeId
      ? draft.nodes.find(
          (node) => node.id === editingOutputMappingsNodeId && node.output,
        ) ?? null
      : null;
    const pipelineNodeBottom = Math.max(
      420,
      ...draft.nodes.map((node) => node.position.y + NODE_HEIGHT),
    );
    const outputLaneY = pipelineNodeBottom + 96;
    const outputFiles = draft.nodes
      .filter((node): node is PipelineNode & { output: PipelineNodeOutput } =>
        Boolean(node.output),
      )
      .map((node, index) => ({
        ownerNode: node,
        output: node.output,
        sourceNodeIds: outputSourceNodeIds(node),
        x: node.output.position?.x ?? 48 + index * (OUTPUT_FILE_WIDTH + OUTPUT_FILE_GAP),
        y: node.output.position?.y ?? outputLaneY,
      }));
    const linkedOutputFiles = outputsNode
      ? outputFiles.filter((file) => file.sourceNodeIds.includes(outputsNode.id))
      : [];
    const canvasWidth = Math.max(
      980,
      ...draft.nodes.map((node) => node.position.x + NODE_WIDTH + 80),
      ...outputFiles.map((file) => file.x + OUTPUT_FILE_WIDTH + 80),
    );
    const canvasHeight = Math.max(
      520,
      ...draft.nodes.map((node) => node.position.y + NODE_HEIGHT + 100),
      ...outputFiles.map((file) => file.y + OUTPUT_FILE_HEIGHT + 80),
    );
    const hasAgentNode = draft.nodes.some((node) => node.kind === "agent");
    const sourceNode = draft.nodes.find((node) => node.kind === "source");
    const hasRepositoryAgentLink = Boolean(
      sourceNode && draft.edges.some((edge) => edge.fromNodeId === sourceNode.id),
    );
    const canSavePipeline =
      hasAgentNode && outputFiles.length > 0 && hasRepositoryAgentLink;
    const renderedConnectionCount =
      draft.edges.length + outputFiles.reduce(
        (count, file) => count + file.sourceNodeIds.length,
        0,
      );
    const activeLinkSourceId = linkDrag?.fromNodeId ?? linkingFromNodeId;
    return (
      <section className="project-resource-editor pipeline-editor">
        <header className="compact-editor-header" id="tour-pipeline-builder-intro">
          <div>
            <p className="eyebrow">Visual workflow</p>
            <h2>{draft.id ? "Edit pipeline" : "New pipeline"}</h2>
            <p>Build a connected agent flow from a GitHub Repository Group source.</p>
          </div>
          <button
            aria-label="Close pipeline editor"
            className="dialog-close"
            onClick={() => setDraft(null)}
            type="button"
          >
            <XIcon />
          </button>
        </header>

        <div className="pipeline-identity-grid" id="tour-pipeline-identity">
          <label className="field-group">
            <span className="field-label">Pipeline name</span>
            <input
              aria-invalid={Boolean(fields.name)}
              className="field"
              maxLength={120}
              onChange={(event) => update({ name: event.target.value })}
              placeholder="Documentation generation"
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
              placeholder="How repository context moves through this pipeline"
              value={draft.description}
            />
          </label>
        </div>

        <div className="pipeline-defaults-grid" id="tour-pipeline-defaults">
          <div className="field-group">
            <span className="field-label">Default LLM connector</span>
            <LlmConnectorDropdown
              ariaInvalid={Boolean(fields.defaultConnector)}
              onChange={(defaultConnector) => {
                const connector = connectors.find(
                  (item) => item.connector === defaultConnector,
                );
                setLoadingPipelineModels(true);
                setPipelineModelMessage("");
                update({
                  defaultConnector,
                  defaultModel: connector?.defaultModel ?? "",
                });
              }}
              options={connectors.map((connector) => ({
                value: connector.connector,
                label: connectorLabels[connector.connector],
                meta: connector.defaultModel
                  ? `Default model: ${connector.defaultModel}`
                  : "No default model",
                status: (
                  loadingPipelineModels &&
                  connector.connector === draft.defaultConnector
                    ? "checking"
                    : pipelineModelMessage &&
                        connector.connector === draft.defaultConnector
                      ? "connection_error"
                      : "connected"
                ) satisfies LlmConnectorDropdownStatus,
              }))}
              value={draft.defaultConnector}
            />
            {fields.defaultConnector ? (
              <span className="field-error">{fields.defaultConnector}</span>
            ) : null}
          </div>
          <div className="field-group">
            <span className="field-label">Default model</span>
            <UiDropdown
              ariaInvalid={Boolean(fields.defaultModel)}
              ariaLabel="Default pipeline model"
              emptyText="No models returned by this connector."
              loading={loadingPipelineModels}
              loadingText={`Loading ${connectorLabels[draft.defaultConnector]} models…`}
              onChange={(defaultModel) => update({ defaultModel })}
              options={(pipelineModels.length
                ? pipelineModels
                : draft.defaultModel
                  ? [{ id: draft.defaultModel, displayName: draft.defaultModel, createdAt: null }]
                  : []
              ).map((model) => ({
                value: model.id,
                label: model.displayName,
                meta: model.id,
              }))}
              placeholder="Select a default model"
              value={draft.defaultModel}
            />
            {pipelineModelMessage ? (
              <span className="field-error">{pipelineModelMessage}</span>
            ) : null}
            {fields.defaultModel ? (
              <span className="field-error">{fields.defaultModel}</span>
            ) : null}
          </div>
        </div>

        <div className="pipeline-canvas-heading">
          <div>
            <strong>Pipeline canvas</strong>
            <span>{draft.nodes.length} nodes · {renderedConnectionCount} connections</span>
          </div>
          <div className="pipeline-canvas-tools">
            <small>Use + to add an agent. Hover a node to draw additional links.</small>
            <ModuleProductTour
              moduleId="pipeline-builder"
              moduleName="Pipeline Builder"
              steps={pipelineBuilderTourSteps}
            />
            <button className="pipeline-yaml-download" onClick={() => downloadPipelineYaml(draft)} type="button">
              <DocumentIcon width={13} height={13} /> Download YAML
            </button>
          </div>
        </div>
        {activeLinkSourceId ? (
          <div className="pipeline-link-mode" role="status">
            <LinkIcon width={14} height={14} />
            <span>
              {linkDrag
                ? "Drag onto a highlighted node or output target and release to connect. Release elsewhere to cancel."
                : "Select a highlighted node or output target to complete the link."}
            </span>
            <button
              onClick={() => {
                setLinkingFromNodeId(null);
                cancelLinkDrag();
              }}
              type="button"
            >
              Cancel linking
            </button>
          </div>
        ) : null}
        {linkMessage ? (
          <div className="pipeline-link-error" role="alert">
            <span>{linkMessage}</span>
            <button onClick={() => setLinkMessage("")} type="button">
              Dismiss
            </button>
          </div>
        ) : null}
        <div className="pipeline-canvas-scroll">
          <div
            aria-label="Pipeline canvas"
            className="pipeline-canvas"
            ref={canvasRef}
            style={{ height: canvasHeight, width: canvasWidth }}
          >
            <svg aria-label="Pipeline connections" className="pipeline-edges" height={canvasHeight} width={canvasWidth}>
              <defs>
                <marker id="pipeline-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                  <path d="M0,0 L8,4 L0,8 Z" />
                </marker>
                <marker id="pipeline-output-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                  <path className="pipeline-output-arrow-head" d="M0,0 L8,4 L0,8 Z" />
                </marker>
              </defs>
              {draft.edges.map((edge) => {
                const from = draft.nodes.find((node) => node.id === edge.fromNodeId);
                const to = draft.nodes.find((node) => node.id === edge.toNodeId);
                if (!from || !to) return null;
                const fromAnchor = edge.sourceAnchor;
                const toAnchor = closestAnchor(to, from);
                const start = anchorPoint(from, fromAnchor);
                const end = anchorPoint(to, toAnchor);
                const startDirection = anchorDirection(fromAnchor);
                const endDirection = anchorDirection(toAnchor);
                const geometry = connectionCurve(
                  start,
                  end,
                  startDirection,
                  endDirection,
                );
                return (
                  <PipelineConnection
                    ariaLabel="Remove workflow connection"
                    key={edge.id}
                    midpoint={geometry.midpoint}
                    onRemove={() => removeEdgeAndPrune(edge.id)}
                    path={geometry.path}
                  />
                );
              })}
              {outputFiles.flatMap((file) =>
                file.sourceNodeIds.map((sourceNodeId) => {
                  const sourceNode = draft.nodes.find(
                    (node) => node.id === sourceNodeId,
                  );
                  if (!sourceNode) return null;
                  const geometry = outputConnectionGeometry(sourceNode, {
                    x: file.x,
                    y: file.y,
                  });
                  return (
                    <PipelineConnection
                      ariaLabel="Remove output-file connection"
                      key={`${file.ownerNode.id}:${sourceNodeId}`}
                      midpoint={geometry.midpoint}
                      onRemove={() => removeOutputSource(file.ownerNode.id, sourceNodeId)}
                      output
                      path={geometry.path}
                    />
                  );
                }),
              )}
              {linkDrag ? (() => {
                const distance = Math.hypot(
                  linkDrag.x - linkDrag.originX,
                  linkDrag.y - linkDrag.originY,
                );
                const curve = Math.max(60, distance * 0.32);
                const direction = anchorDirection(linkDrag.anchor);
                return (
                  <path
                    className="pipeline-edge-preview"
                    d={`M ${linkDrag.originX} ${linkDrag.originY} C ${linkDrag.originX + direction.x * curve} ${linkDrag.originY + direction.y * curve}, ${linkDrag.x} ${linkDrag.y}, ${linkDrag.x} ${linkDrag.y}`}
                    style={{ strokeDashoffset: Math.min(12, curve / 10) }}
                  />
                );
              })() : null}
            </svg>

            {draft.nodes.map((node) => {
              const agent =
                node.kind === "agent"
                  ? agents.find((item) => item.id === node.agentId)
                  : null;
              const incomingCount = draft.edges.filter(
                (edge) => edge.toNodeId === node.id,
              ).length;
              const uploadCount =
                node.inputMediaUrls.length + (nodeUploadIds[node.id] ?? []).length;
              const outgoingAgentCount = draft.edges.filter(
                (edge) => edge.fromNodeId === node.id,
              ).length;
              const connectedOutputCount = outputFiles.filter((file) =>
                file.sourceNodeIds.includes(node.id),
              ).length;
              const hasOutputConnection =
                node.kind === "agent" && connectedOutputCount > 0;
              const isLinkTarget = Boolean(
                activeLinkSourceId &&
                canConnectNodes(activeLinkSourceId, node.id),
              );
              const isCircularTarget = Boolean(
                activeLinkSourceId &&
                connectionIssue(activeLinkSourceId, node.id)?.includes(
                  "circular dependency",
                ),
              );
              return (
                <article
                  className={`pipeline-node pipeline-node-${node.kind} ${
                    hasOutputConnection ? "pipeline-node-output-connected" : ""
                  } ${
                    activeLinkSourceId === node.id ? "linking-source" : ""
                  } ${isLinkTarget ? "link-target" : ""} ${
                    isCircularTarget ? "circular-target" : ""
                  }`}
                  data-pipeline-node-id={node.id}
                  id={node.kind === "source" ? "tour-pipeline-source" : undefined}
                  key={node.id}
                  style={{ left: node.position.x, top: node.position.y }}
                >
                  <div
                    className="pipeline-node-drag"
                    onPointerDown={(event) => beginDrag(event, node)}
                    onPointerMove={moveNode}
                    onPointerUp={() => setDrag(null)}
                  >
                    {node.kind === "source" ? (
                      <span className="pipeline-source-icon"><GitHubIcon /></span>
                    ) : agent ? (
                      <LlmProviderLogo connector={agent.connector} />
                    ) : (
                      <span className="pipeline-source-icon"><LayersIcon /></span>
                    )}
                    <span>
                      <small>{node.kind === "source" ? "PIPELINE START" : "PROJECT AGENT"}</small>
                      <strong>{node.kind === "source" ? "GitHub Repository Group" : agent?.name ?? "Unavailable agent"}</strong>
                      <em>{node.kind === "source" ? "Runtime source placeholder" : agent?.model ?? "Removed from project"}</em>
                    </span>
                  </div>
                  {node.kind === "agent" ? (
                    <button
                      aria-label={`Remove ${agent?.name ?? "agent"} node and following steps`}
                      className="pipeline-node-remove"
                      onClick={() => removeNode(node.id)}
                      type="button"
                    >
                      <XIcon width={12} height={12} />
                    </button>
                  ) : null}
                  <button
                    aria-expanded={expandedNodeId === node.id}
                    aria-label={`Show add options for ${node.kind === "source" ? "GitHub Repository Group" : agent?.name ?? "this node"}`}
                    className="pipeline-node-add"
                    id={node.kind === "source" ? "tour-pipeline-add" : undefined}
                    onClick={() =>
                      setExpandedNodeId((current) =>
                        current === node.id ? null : node.id,
                      )
                    }
                    type="button"
                  >
                    <PlusIcon width={15} height={15} />
                  </button>
                  {expandedNodeId === node.id ? (
                    <div className="pipeline-node-add-actions" role="group" aria-label="Add node options">
                      <button onClick={() => openAgentPicker(node.id)} type="button">
                        <LayersIcon width={18} height={18} /> <span>Agent</span>
                      </button>
                      <button onClick={() => openOutputEditor(node)} type="button">
                        <DocumentIcon width={18} height={18} /> <span>Output</span>
                      </button>
                    </div>
                  ) : null}
                  {linkAnchors.map((anchor) => (
                    <button
                      aria-label={`Draw a connection from the ${anchor} of ${node.kind === "source" ? "GitHub Repository Group" : agent?.name ?? "this node"}`}
                      className={`pipeline-node-link-port pipeline-node-link-port-${anchor}`}
                      data-tooltip="Drag to connect"
                      key={anchor}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setLinkingFromNodeId(node.id);
                        setLinkingFromAnchor(anchor);
                        setLinkMessage("");
                      }}
                      onPointerCancel={cancelLinkDrag}
                      onPointerDown={(event) => beginLinkDrag(event, node, anchor)}
                      onPointerMove={moveLinkDrag}
                      onPointerUp={finishLinkDrag}
                      type="button"
                    >
                      <span aria-hidden="true" />
                    </button>
                  ))}
                  <button
                    aria-label={`Manage inputs for ${node.kind === "source" ? "GitHub Repository Group" : agent?.name ?? "this node"}`}
                    className="pipeline-node-inputs"
                    onClick={() => setEditingInputsNodeId(node.id)}
                    type="button"
                  >
                    Inputs <span>{incomingCount + uploadCount}</span>
                  </button>
                  <button
                    aria-label={`Manage outputs for ${node.kind === "source" ? "GitHub Repository Group" : agent?.name ?? "this node"}`}
                    className="pipeline-node-outputs"
                    onClick={() => setEditingOutputsNodeId(node.id)}
                    type="button"
                  >
                    Outputs <span>{outgoingAgentCount + connectedOutputCount}</span>
                  </button>
                  {isLinkTarget ? (
                    <button
                      className="pipeline-node-link-target"
                      onClick={() => {
                        if (!linkDrag && linkingFromNodeId) {
                          connectNodes(linkingFromNodeId, node.id, linkingFromAnchor);
                        }
                      }}
                      type="button"
                    >
                      {linkDrag ? "Release to link" : "Link here"}
                    </button>
                  ) : isCircularTarget ? (
                    <div className="pipeline-node-cycle-warning">
                      <XIcon width={13} height={13} /> Creates a cycle
                    </div>
                  ) : null}
                </article>
              );
            })}
            {outputFiles.length ? (
              <div
                aria-hidden="true"
                className="pipeline-output-lane-label"
                style={{ top: outputLaneY - 42 }}
              >
                Output targets · drag to position
              </div>
            ) : null}
            {outputFiles.map((file) => {
              const canMapActiveNode = Boolean(
                activeLinkSourceId &&
                outputMappingIssue(activeLinkSourceId, file.ownerNode.id) === null,
              );
              return (
                <article
                  className={`pipeline-output-file ${canMapActiveNode ? "link-target" : ""} ${outputDrag?.outputNodeId === file.ownerNode.id ? "dragging" : ""}`}
                  data-pipeline-output-node-id={file.ownerNode.id}
                  key={`output-file:${file.ownerNode.id}`}
                  style={{ left: file.x, top: file.y }}
                >
                <header
                  onPointerCancel={() => setOutputDrag(null)}
                  onPointerDown={(event) =>
                    beginOutputDrag(event, file.ownerNode.id, { x: file.x, y: file.y })
                  }
                  onPointerMove={moveOutputFile}
                  onPointerUp={() => setOutputDrag(null)}
                >
                  <span><DocumentIcon width={17} height={17} /></span>
                  <small>OUTPUT FILE</small>
                </header>
                <strong title={outputFilePath(file.output)}>
                  {outputFilePath(file.output)}
                </strong>
                <p>
                  {file.sourceNodeIds.length} mapped node {file.sourceNodeIds.length === 1 ? "output" : "outputs"}
                  <span aria-hidden="true">
                    {file.sourceNodeIds.map((sourceId, index) => (
                      <i key={sourceId}>{index + 1}</i>
                    ))}
                  </span>
                </p>
                <footer>
                  <button onClick={() => openOutputEditor(file.ownerNode)} type="button">
                    <PencilIcon width={11} height={11} /> Configure
                  </button>
                  <button onClick={() => setEditingOutputMappingsNodeId(file.ownerNode.id)} type="button">
                    <LayersIcon width={11} height={11} /> Arrange inputs
                  </button>
                </footer>
                {canMapActiveNode && activeLinkSourceId ? (
                  <button
                    className="pipeline-output-link-target"
                    onClick={() =>
                      connectNodeToOutput(activeLinkSourceId, file.ownerNode.id)
                    }
                    type="button"
                  >
                    {linkDrag ? "Release to map" : "Map output here"}
                  </button>
                ) : null}
                </article>
              );
            })}
          </div>
        </div>

        {message ? <p className="form-message" role="alert">{message}</p> : null}
        {fields.nodes || fields.edges ? (
          <p className="field-error">{fields.nodes ?? fields.edges}</p>
        ) : null}
        <footer className="compact-editor-actions" id="tour-pipeline-save">
          {!canSavePipeline ? (
            <p className="pipeline-save-requirement" role="status">
              Add an output file and connect at least one agent to the GitHub source flow before saving.
            </p>
          ) : null}
          <button className="button-secondary" onClick={() => setDraft(null)} type="button">
            Cancel
          </button>
          <button
            className="button-primary"
            disabled={saving || !canSavePipeline}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "Saving pipeline…" : "Save pipeline"}
          </button>
        </footer>

        {addingFromNodeId && !creatingAgent ? (
          <div className="dialog-backdrop" role="presentation">
            <section aria-label="Add an agent node" aria-modal="true" className="confirmation-dialog pipeline-agent-picker" role="dialog">
              <button aria-label="Close agent picker" className="dialog-close" onClick={() => setAddingFromNodeId(null)} type="button"><XIcon /></button>
              <p className="eyebrow">Extend pipeline</p>
              <h2>Add an agent node</h2>
              <p>Choose a saved project agent or create one without leaving the canvas.</p>
              <button
                className="button-primary pipeline-picker-create"
                disabled={!connectors.length}
                onClick={() => setCreatingAgent(true)}
                type="button"
              >
                <PlusIcon width={14} height={14} /> Create new agent
              </button>
              <label className="pipeline-agent-search">
                <SearchIcon width={15} height={15} />
                <input
                  autoFocus
                  onChange={(event) => setAgentQuery(event.target.value)}
                  placeholder="Search agents by name, provider, or model…"
                  type="search"
                  value={agentQuery}
                />
                {agentQuery ? (
                  <button aria-label="Clear agent search" onClick={() => setAgentQuery("")} type="button"><XIcon width={13} height={13} /></button>
                ) : null}
              </label>
              {filteredAgents.length ? (
                <div className="pipeline-agent-options">
                  {filteredAgents.map((agent) => (
                    <button key={agent.id} onClick={() => addAgentNode(agent)} type="button">
                      <LlmProviderLogo connector={agent.connector} />
                      <span><strong>{agent.name}</strong><small>{connectorLabels[agent.connector]} · {agent.model}</small></span>
                      <ArrowIcon width={14} height={14} />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="pipeline-picker-empty">
                  {agents.length ? "No agents match this search." : "No project agents are available yet."}
                </p>
              )}
              <button
                className="button-primary pipeline-picker-create pipeline-picker-create-bottom"
                disabled={!connectors.length}
                onClick={() => setCreatingAgent(true)}
                type="button"
              >
                <PlusIcon width={14} height={14} /> Create new agent
              </button>
              {!connectors.length ? (
                <button className="pipeline-connect-first" onClick={onNavigateConnectors} type="button">Connect an LLM provider first</button>
              ) : null}
            </section>
          </div>
        ) : null}
        {addingFromNodeId && creatingAgent ? (
          <PipelineAgentDialog
            connectors={connectors}
            onCancel={() => setCreatingAgent(false)}
            onSaved={(agent) => {
              setAgents((current) => [...current, agent].sort((left, right) => left.name.localeCompare(right.name)));
              addAgentNode(agent);
              router.refresh();
            }}
          />
        ) : null}
        {outputNode ? (
          <div className="dialog-backdrop" role="presentation">
            <section
              aria-label="Mark node as output"
              aria-modal="true"
              className="confirmation-dialog pipeline-output-dialog"
              role="dialog"
            >
              <button
                aria-label="Close output form"
                className="dialog-close"
                onClick={() => setEditingOutputNodeId(null)}
                type="button"
              >
                <XIcon />
              </button>
              <p className="eyebrow">Pipeline result</p>
              <h2>{outputNode.output ? "Configure Output File" : "Mark as Output"}</h2>
              <p>
                {outputNode.output
                  ? "Update the linked output file. Its mapped agent outputs and assembly order are configured on the canvas."
                  : "Create a linked output file from this node. You can map and order more agent outputs after creating it."}
              </p>
              <div className="pipeline-output-form">
                <label className="field-group">
                  <span className="field-label">Output file parent path</span>
                  <input
                    className="field"
                    maxLength={512}
                    onChange={(event) => {
                      setOutputDraft((current) => ({ ...current, parentPath: event.target.value }));
                      setOutputMessage("");
                    }}
                    placeholder="/"
                    value={outputDraft.parentPath}
                  />
                  <small>Defaults to / when left blank.</small>
                </label>
                <label className="field-group">
                  <span className="field-label">File name</span>
                  <input
                    className="field"
                    maxLength={255}
                    onChange={(event) => {
                      setOutputDraft((current) => ({ ...current, fileName: event.target.value }));
                      setOutputMessage("");
                    }}
                    placeholder="pipeline-output"
                    value={outputDraft.fileName}
                  />
                </label>
                <div className="field-group pipeline-output-type">
                  <span className="field-label">File type</span>
                  <UiDropdown
                    ariaLabel="Output file type"
                    onChange={(fileType) => {
                      setOutputDraft((current) => ({
                        ...current,
                        fileType: fileType as PipelineOutputFileType,
                      }));
                      setOutputMessage("");
                    }}
                    options={outputFileTypes}
                    value={outputDraft.fileType}
                  />
                </div>
              </div>
              {outputMessage ? <p className="form-message" role="alert">{outputMessage}</p> : null}
              <div className="dialog-actions">
                {outputNode.output ? (
                  <button className="danger-link" onClick={removeNodeOutput} type="button">
                    Remove output
                  </button>
                ) : null}
                <button className="button-secondary" onClick={() => setEditingOutputNodeId(null)} type="button">
                  Cancel
                </button>
                <button className="button-primary" onClick={saveNodeOutput} type="button">
                  {outputNode.output ? "Save output file" : "Mark & create file"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {outputMappingsNode?.output ? (
          <div className="dialog-backdrop" role="presentation">
            <section
              aria-label="Arrange output file inputs"
              aria-modal="true"
              className="confirmation-dialog pipeline-output-mapping-dialog"
              role="dialog"
            >
              <button
                aria-label="Close output input arrangement"
                className="dialog-close"
                onClick={() => setEditingOutputMappingsNodeId(null)}
                type="button"
              >
                <XIcon />
              </button>
              <p className="eyebrow">Output assembly</p>
              <h2>Arrange file inputs</h2>
              <p>
                <strong>{outputFilePath(outputMappingsNode.output)}</strong> is assembled in the exact order below.
              </p>

              <div className="pipeline-output-order-list">
                {outputSourceNodeIds(outputMappingsNode).length ? outputSourceNodeIds(outputMappingsNode).map((sourceId, index, sourceIds) => {
                  const sourceNode = draft.nodes.find((node) => node.id === sourceId);
                  const sourceAgent = sourceNode?.kind === "agent"
                    ? agents.find((agent) => agent.id === sourceNode.agentId)
                    : null;
                  return (
                    <div key={sourceId}>
                      <b>{index + 1}</b>
                      <span>
                        <strong>
                          {sourceNode?.kind === "source"
                            ? "GitHub Repository Group"
                            : sourceAgent?.name ?? "Unavailable agent"}
                        </strong>
                        <small>
                          {sourceId === outputMappingsNode.id
                            ? "Node marked as this output"
                            : "Mapped agent output"}
                        </small>
                      </span>
                      <label>
                        <span>Optional header</span>
                        <input
                          aria-label={`Optional output header for ${
                            sourceNode?.kind === "source"
                              ? "GitHub Repository Group"
                              : sourceAgent?.name ?? `input ${index + 1}`
                          }`}
                          className="field"
                          maxLength={200}
                          onChange={(event) =>
                            updateOutputSourceHeader(
                              outputMappingsNode.id,
                              sourceId,
                              event.target.value,
                            )
                          }
                          placeholder="e.g. Architecture review"
                          value={outputMappingsNode.output?.sourceHeaders?.[sourceId] ?? ""}
                        />
                      </label>
                      <div>
                        <button
                          aria-label={`Move input ${index + 1} up`}
                          disabled={index === 0}
                          onClick={() => moveOutputSource(outputMappingsNode.id, sourceId, -1)}
                          type="button"
                        >
                          <ArrowIcon className="pipeline-order-up" width={13} height={13} />
                        </button>
                        <button
                          aria-label={`Move input ${index + 1} down`}
                          disabled={index === sourceIds.length - 1}
                          onClick={() => moveOutputSource(outputMappingsNode.id, sourceId, 1)}
                          type="button"
                        >
                          <ArrowIcon className="pipeline-order-down" width={13} height={13} />
                        </button>
                        <button
                          aria-label={`Remove input ${index + 1}`}
                          onClick={() => removeOutputSource(outputMappingsNode.id, sourceId)}
                          type="button"
                        >
                          <XIcon width={12} height={12} />
                        </button>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="pipeline-picker-empty">No node outputs are mapped to this file.</p>
                )}
              </div>

              <div className="pipeline-input-section pipeline-output-source-picker">
                <header>
                  <div>
                    <strong>Map another node output</strong>
                    <small>Add the GitHub source or an agent, then reorder it above.</small>
                  </div>
                  <PlusIcon width={16} height={16} />
                </header>
                {draft.nodes.some(
                  (node) =>
                    !outputSourceNodeIds(outputMappingsNode).includes(node.id),
                ) ? (
                  <div className="pipeline-output-source-options">
                    {draft.nodes.flatMap((node) => {
                      if (
                        outputSourceNodeIds(outputMappingsNode).includes(node.id)
                      ) return [];
                      const agent = node.kind === "agent"
                        ? agents.find((item) => item.id === node.agentId)
                        : null;
                      return [
                        <button
                          key={node.id}
                          onClick={() => addOutputSource(outputMappingsNode.id, node.id)}
                          type="button"
                        >
                          <span>
                            <strong>{node.kind === "source" ? "GitHub Repository Group" : agent?.name ?? "Unavailable agent"}</strong>
                            <small>{node.kind === "source" ? "Pipeline source" : agent?.model ?? "Removed from project"}</small>
                          </span>
                          <PlusIcon width={13} height={13} />
                        </button>,
                      ];
                    })}
                  </div>
                ) : (
                  <p className="pipeline-picker-empty">Every available agent output is already mapped.</p>
                )}
              </div>

              <div className="dialog-actions">
                <button
                  className="button-primary"
                  onClick={() => setEditingOutputMappingsNodeId(null)}
                  type="button"
                >
                  Done
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {outputsNode ? (
          <div className="dialog-backdrop" role="presentation">
            <section
              aria-label="Node outputs"
              aria-modal="true"
              className="confirmation-dialog pipeline-input-dialog pipeline-outputs-dialog"
              role="dialog"
            >
              <button
                aria-label="Close node outputs"
                className="dialog-close"
                onClick={() => setEditingOutputsNodeId(null)}
                type="button"
              >
                <XIcon />
              </button>
              <p className="eyebrow">Node configuration</p>
              <h2>Outputs</h2>
              <p>
                {outputsNode.kind === "source"
                  ? "GitHub Repository Group"
                  : outputsNodeAgent?.name ?? "Agent node"} sends output to the agent nodes and files listed below.
              </p>

              <div className="pipeline-input-section">
                <header>
                  <div>
                    <strong>Agent nodes</strong>
                    <small>{outgoingOutputEdges.length} connected</small>
                  </div>
                  <LayersIcon width={16} height={16} />
                </header>
                {outgoingOutputEdges.length ? (
                  <div className="pipeline-linked-inputs">
                    {outgoingOutputEdges.map((edge) => {
                      const targetNode = draft.nodes.find(
                        (node) => node.id === edge.toNodeId,
                      );
                      const targetAgent = targetNode?.kind === "agent"
                        ? agents.find((agent) => agent.id === targetNode.agentId)
                        : null;
                      return (
                        <div key={edge.id}>
                          <span>
                            <LinkIcon width={12} height={12} />
                            <strong>{targetAgent?.name ?? "Agent node"}</strong>
                          </span>
                          <button
                            aria-label={`Remove output link to ${targetAgent?.name ?? "agent node"}`}
                            onClick={() => removeEdgeAndPrune(edge.id)}
                            type="button"
                          >
                            <XIcon width={12} height={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="pipeline-picker-empty">No agent nodes receive this output.</p>
                )}
              </div>

              <div className="pipeline-input-section">
                <header>
                  <div>
                    <strong>Output files</strong>
                    <small>{linkedOutputFiles.length} connected</small>
                  </div>
                  <DocumentIcon width={16} height={16} />
                </header>
                {linkedOutputFiles.length ? (
                  <div className="pipeline-linked-inputs pipeline-linked-output-files">
                    {linkedOutputFiles.map((file) => (
                      <div key={file.ownerNode.id}>
                        <span>
                          <DocumentIcon width={12} height={12} />
                          <strong>{outputFilePath(file.output)}</strong>
                        </span>
                        <div>
                          <button
                            aria-label={`Configure ${outputFilePath(file.output)}`}
                            onClick={() => openOutputEditor(file.ownerNode)}
                            type="button"
                          >
                            <PencilIcon width={12} height={12} />
                          </button>
                          <button
                            aria-label={`Remove output link to ${outputFilePath(file.output)}`}
                            onClick={() => removeOutputSource(file.ownerNode.id, outputsNode.id)}
                            type="button"
                          >
                            <XIcon width={12} height={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pipeline-picker-empty">No output files receive this node output.</p>
                )}
              </div>

              <div className="dialog-actions pipeline-input-actions">
                <button
                  className="button-primary"
                  onClick={() => setEditingOutputsNodeId(null)}
                  type="button"
                >
                  Done
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {inputNode ? (
          <div className="dialog-backdrop" role="presentation">
            <section aria-label="Node inputs" aria-modal="true" className="confirmation-dialog pipeline-input-dialog" role="dialog">
              <button aria-label="Close node inputs" className="dialog-close" onClick={() => setEditingInputsNodeId(null)} type="button"><XIcon /></button>
              <p className="eyebrow">Node configuration</p>
              <h2>Inputs</h2>
              <p>{inputNode.kind === "source" ? "GitHub Repository Group" : inputNodeAgent?.name ?? "Agent node"} can receive linked node output and project files.</p>

              <div className="pipeline-input-section">
                <header><div><strong>Linked node outputs</strong><small>{incomingInputEdges.length} connected</small></div><LinkIcon width={16} height={16} /></header>
                {incomingInputEdges.length ? (
                  <div className="pipeline-linked-inputs">
                    {incomingInputEdges.map((edge) => {
                      const sourceNode = draft.nodes.find((node) => node.id === edge.fromNodeId);
                      const sourceAgent = sourceNode?.kind === "agent" ? agents.find((agent) => agent.id === sourceNode.agentId) : null;
                      return (
                        <div key={edge.id}>
                          <span><LinkIcon width={12} height={12} /><strong>{sourceNode?.kind === "source" ? "GitHub Repository Group" : sourceAgent?.name ?? "Agent node"}</strong></span>
                          <button aria-label="Remove linked input" onClick={() => removeEdgeAndPrune(edge.id)} type="button"><XIcon width={12} height={12} /></button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="pipeline-picker-empty">No node output is linked as an input.</p>
                )}
              </div>

              <div className="pipeline-input-section">
                <header><div><strong>Project uploads</strong><small>{projectUploads.length} saved in Azure · reusable across this project</small></div><UploadIcon width={16} height={16} /></header>
                {projectUploads.length ? (
                  <div className="pipeline-upload-options">
                    {projectUploads.map((upload) => {
                      const selected = inputNode.inputMediaUrls.includes(upload.mediaUrl);
                      return (
                        <button aria-pressed={selected} className={selected ? "selected" : ""} key={upload.id} onClick={() => toggleProjectUpload(inputNode.id, upload.mediaUrl)} type="button">
                          <span><strong>{upload.fileName}</strong><small>{upload.contentType || "File"} · {formatFileSize(upload.sizeBytes)}</small></span>
                          {selected ? <CheckIcon width={14} height={14} /> : <PlusIcon width={14} height={14} />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="pipeline-picker-empty">No files have been saved to this project yet.</p>
                )}
              </div>

              <div className="pipeline-input-section">
                <header><div><strong>Pending uploads</strong><small>Kept in memory until you save the pipeline</small></div><UploadIcon width={16} height={16} /></header>
                <label className="pipeline-upload-button">
                  <UploadIcon width={14} height={14} /> Upload from device
                  <input multiple onChange={(event) => { addMemoryFiles(inputNode.id, event.target.files); event.target.value = ""; }} type="file" />
                </label>
                {memoryUploads.length ? (
                  <div className="pipeline-upload-options">
                    {memoryUploads.map((upload) => {
                      const selected = (nodeUploadIds[inputNode.id] ?? []).includes(upload.id);
                      return (
                        <button aria-pressed={selected} className={selected ? "selected" : ""} key={upload.id} onClick={() => toggleNodeUpload(inputNode.id, upload.id)} type="button">
                          <span><strong>{upload.file.name}</strong><small>{upload.file.type || "File"} · {formatFileSize(upload.file.size)}</small></span>
                          {selected ? <CheckIcon width={14} height={14} /> : <PlusIcon width={14} height={14} />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="pipeline-picker-empty">New files remain in browser memory, then move to Azure when Save pipeline succeeds.</p>
                )}
                {uploadMessage ? <p className="form-message" role="alert">{uploadMessage}</p> : null}
              </div>
              <div className="dialog-actions pipeline-input-actions">
                <button className="button-primary" onClick={() => setEditingInputsNodeId(null)} type="button">Done</button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="repository-list-section pipeline-list-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Agent orchestration</p>
          <h2>Pipelines</h2>
        </div>
        <div className="pipeline-list-actions">
          <label className="button-secondary resource-compact-action pipeline-import-button">
            <UploadIcon width={14} height={14} /> Import .yml
            <input
              accept=".yml,.yaml,application/yaml,text/yaml,text/plain"
              onChange={(event) => {
                void importPipelineYaml(event.target.files?.[0]);
                event.target.value = "";
              }}
              type="file"
            />
          </label>
          <button
            className="button-primary resource-compact-action"
            disabled={!connectors.length}
            onClick={() => openEditor(emptyPipeline(connectors))}
            type="button"
          >
            <PlusIcon width={14} height={14} /> New pipeline
          </button>
        </div>
      </div>
      <p className="form-intro">
        Arrange project agents into visual workflows that begin with a GitHub Repository Group source placeholder.
      </p>
      {message ? <p className="form-message" role="alert">{message}</p> : null}
      {pipelines.length ? (
        <>
          <ModuleListControls
            itemLabel="pipelines"
            onQueryChange={setPipelineQuery}
            onViewChange={setPipelineView}
            query={pipelineQuery}
            resultCount={visiblePipelines.length}
            view={pipelineView}
          />
          {visiblePipelines.length ? (
            <>
              {pipelineView === "cards" ? (
                <div className="pipeline-card-grid">
                  {visiblePipelines.map((pipeline) => {
                    const agentCount = pipeline.nodes.filter(
                      (node) => node.kind === "agent",
                    ).length;
                    const outputCount = pipeline.nodes.filter(
                      (node) => node.output,
                    ).length;
                    return (
                      <article className="pipeline-card" key={pipeline.id}>
                        <button className="module-card-body" onClick={() => openEditor(pipeline)} type="button">
                          <header><LayersIcon width={18} height={18} /><span>Visual pipeline</span></header>
                          <h3>{pipeline.name}</h3>
                          <p>{pipeline.description || "No description."}</p>
                          <p className="pipeline-card-default">
                            {connectorLabels[pipeline.defaultConnector]} · {pipeline.defaultModel}
                          </p>
                          <div className="pipeline-card-flow" aria-hidden="true">
                            <span><GitHubIcon width={14} height={14} /></span>
                            <i />
                            <strong>{agentCount}</strong>
                            <small>{agentCount === 1 ? "agent" : "agents"}</small>
                            <i />
                            <strong>{outputCount}</strong>
                            <small>{outputCount === 1 ? "output" : "outputs"}</small>
                          </div>
                        </button>
                        <footer>
                          <button onClick={() => openEditor(pipeline)} type="button"><PencilIcon width={12} height={12} /> Edit pipeline</button>
                          <button className="pipeline-yaml-download" onClick={() => downloadPipelineYaml(pipeline)} type="button"><DocumentIcon width={12} height={12} /> Download YAML</button>
                          <button aria-label={`Delete ${pipeline.name}`} className="danger-link" onClick={() => setDeletingPipeline(pipeline)} type="button"><TrashIcon width={13} height={13} /> Delete</button>
                        </footer>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="module-table-wrap pipeline-table-wrap">
                  <table className="module-table pipeline-table">
                    <thead>
                      <tr>
                        <th>Pipeline</th>
                        <th>Default connector</th>
                        <th>Default model</th>
                        <th>Graph</th>
                        <th><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePipelines.map((pipeline) => {
                        const agentCount = pipeline.nodes.filter(
                          (node) => node.kind === "agent",
                        ).length;
                        const outputCount = pipeline.nodes.filter(
                          (node) => node.output,
                        ).length;
                        return (
                          <tr key={pipeline.id}>
                            <td>
                              <button className="module-table-open" onClick={() => openEditor(pipeline)} type="button">
                                <LayersIcon width={17} height={17} />
                                <span><strong>{pipeline.name}</strong><small>{pipeline.description || "No description."}</small></span>
                              </button>
                            </td>
                            <td>{connectorLabels[pipeline.defaultConnector]}</td>
                            <td>{pipeline.defaultModel}</td>
                            <td>{agentCount} {agentCount === 1 ? "agent" : "agents"} · {outputCount} {outputCount === 1 ? "output" : "outputs"}</td>
                            <td>
                              <div className="module-table-actions pipeline-table-actions">
                                <button onClick={() => openEditor(pipeline)} type="button"><PencilIcon width={13} height={13} /> Edit</button>
                                <button onClick={() => downloadPipelineYaml(pipeline)} type="button"><DocumentIcon width={13} height={13} /> YAML</button>
                                <button aria-label={`Delete ${pipeline.name}`} className="danger-link" onClick={() => setDeletingPipeline(pipeline)} type="button"><TrashIcon width={13} height={13} /> Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="resource-list-footer pipeline-list-footer">
                <button
                  className="button-primary resource-compact-action"
                  disabled={!connectors.length}
                  onClick={() => openEditor(emptyPipeline(connectors))}
                  type="button"
                >
                  <PlusIcon width={14} height={14} /> New pipeline
                </button>
              </div>
            </>
          ) : (
            <div className="repository-empty module-search-empty pipeline-search-empty">
              <h3>No matching pipelines</h3>
              <p>Try a different name, description, connector, model, agent, or output file.</p>
              <button className="empty-add-button" onClick={() => setPipelineQuery("")} type="button">
                Clear search
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="repository-empty pipeline-empty">
          <span className="form-icon"><LayersIcon width={21} height={21} /></span>
          <h3>No pipelines yet</h3>
          <p>
            {connectors.length
              ? "Start with a GitHub source node, then connect saved or newly created agents."
              : "Connect an LLM provider before creating a pipeline."}
          </p>
          <button
            className="empty-add-button"
            onClick={() =>
              connectors.length
                ? openEditor(emptyPipeline(connectors))
                : onNavigateConnectors()
            }
            type="button"
          >
            {connectors.length ? "Create your first pipeline" : "Open LLM connectors"} <ArrowIcon width={14} height={14} />
          </button>
        </div>
      )}
      {deletingPipeline ? (
        <DeleteConfirmationDialog
          confirmLabel="Delete pipeline"
          description={`This permanently deletes the ${deletingPipeline.name} pipeline, its canvas configuration, and any document actions mapped to it. Project agents are not deleted.`}
          onClose={() => setDeletingPipeline(null)}
          onConfirm={() => remove(deletingPipeline)}
          pendingLabel="Deleting pipeline…"
          title="Delete pipeline?"
        />
      ) : null}
    </section>
  );
}
