import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelUrl = new URL("../components/forms/PipelinePanel.tsx", import.meta.url);
const resourcesUrl = new URL(
  "../components/forms/ProjectResources.tsx",
  import.meta.url,
);

test("project resources expose the Pipelines module", async () => {
  const source = await readFile(resourcesUrl, "utf8");
  assert.match(source, /<PipelinePanel/i);
  assert.match(source, /Pipelines <span>\{pipelines\.length\}<\/span>/i);
});

test("pipeline canvas begins with a dummy GitHub source and adds agents", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /GitHub Repository Group/);
  assert.match(source, /Runtime source placeholder/);
  assert.match(source, /openAgentPicker\(node\.id\)/);
  assert.match(source, /linkAnchors: LinkAnchor\[\] = \["top", "bottom", "left"\]/);
  assert.match(source, /pipeline-node-link-port-\$\{anchor\}/);
  assert.match(source, /data-tooltip="Drag to connect"/);
  assert.match(source, /Default LLM connector/);
  assert.match(source, /Default pipeline model/);
  assert.doesNotMatch(source, /Advanced YAML/);
  assert.match(source, /Download YAML/);
  assert.match(source, /pipeline-yaml-download/);
  assert.match(source, /belongs to a different project/);
  assert.match(source, /projectName, "Project"/);
  assert.match(source, /Import \.yml/);
  assert.match(source, /sourceAnchor: "right"/);
  assert.match(source, /const fromAnchor = edge\.sourceAnchor/);
  assert.match(source, /pipeline-node-add-actions/);
  assert.match(source, />Agent<\/span>/);
  assert.match(source, />Output<\/span>/);
  assert.match(source, /Mark as Output/);
  assert.match(source, /Mark & create file/);
  assert.match(source, /Output file parent path/);
  assert.match(source, /Defaults to \/ when left blank/);
  assert.match(source, /Markdown \(MD\)/);
  assert.match(source, /DOCX/);
  assert.doesNotMatch(source, /pipeline-node-quick-actions/);
  assert.match(source, /beginLinkDrag\(event, node, anchor\)/);
  assert.match(source, /document[\s\S]*?\.elementFromPoint/);
  assert.match(source, /Release to link/);
  assert.match(source, /connection would create a circular dependency/);
  assert.match(source, /Creates a cycle/);
  assert.match(source, /pipeline-link-error/);
  assert.match(source, /saveProjectAgentAction\(draft\)/);
  assert.match(source, /Save & add agent/);
  assert.match(source, /<MarkdownCodeEditor/);
  assert.match(source, /<MarkdownViewer markdown=\{draft\.skillsMarkdown\}/);
  assert.match(source, /Skills Markdown view/);
  assert.match(source, /Import \.md/);
  assert.match(source, /MAX_SKILLS_MARKDOWN_LENGTH/);
  assert.match(source, /Save pipeline/);
  assert.match(source, /Search agents by name, provider, or model/);
  assert.match(source, /Create new agent/);
  assert.doesNotMatch(source, /Manage agents/);
  assert.match(source, /Link here/);
  assert.match(source, /Project uploads/);
  assert.match(source, /saved in Azure/);
  assert.match(source, /Pending uploads/);
  assert.match(source, /Kept in memory until you save the pipeline/);
  assert.match(source, /new FormData\(\)/);
  assert.match(source, /saveProjectPipelineAction\(formData\)/);
  assert.match(source, /Output targets · drag to position/);
  assert.match(source, /pipeline-output-edge/);
  assert.match(source, /Arrange inputs/);
  assert.match(source, /Map another node output/);
  assert.match(source, /assembled in the exact order below/);
  assert.match(source, /moveOutputSource/);
  assert.match(source, /data-pipeline-output-node-id/);
  assert.match(source, /Release to map/);
  assert.match(source, /Map output here/);
  assert.match(source, /Optional header/);
  assert.match(source, /updateOutputSourceHeader/);
  assert.match(source, /connect at least one agent to the GitHub source flow before saving/);
  assert.match(source, /disabled=\{saving \|\| !canSavePipeline\}/);
  assert.match(source, /beginOutputDrag/);
  assert.match(source, /moveOutputFile/);
  assert.match(source, /pipeline-node-output-connected/);
  assert.match(source, /PipelineConnection/);
  assert.match(source, /pipeline-edge-remove-indicator/);
  assert.match(source, /Remove workflow connection/);
  assert.match(source, /Remove output-file connection/);
  assert.match(source, /<h2>Outputs<\/h2>/);
  assert.match(source, /Agent nodes/);
  assert.match(source, /Output files/);
});

test("pipeline library follows the module UI guide", async () => {
  const source = await readFile(panelUrl, "utf8");
  assert.match(source, /ModuleListControls/);
  assert.match(source, /itemLabel="pipelines"/);
  assert.match(source, /visiblePipelines/);
  assert.match(source, /pipelineView === "cards"/);
  assert.match(source, /module-table pipeline-table/);
  assert.match(source, /module-card-body/);
  assert.match(source, /module-table-open/);
  assert.match(source, /Edit pipeline/);
  assert.match(source, /Download YAML/);
  assert.match(source, /No matching pipelines/);
  assert.match(source, /Clear search/);
  assert.match(source, /resource-list-footer pipeline-list-footer/);
  assert.match(source, /Open LLM connectors/);
});
