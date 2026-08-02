import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const resourcesUrl = new URL(
  "../components/forms/ProjectResources.tsx",
  import.meta.url,
);
const actionsPanelUrl = new URL(
  "../components/forms/ActionsPanel.tsx",
  import.meta.url,
);
const projectPageUrl = new URL("../app/project/page.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

test("repository-group cards and rows expose document creation", async () => {
  const [source, styles] = await Promise.all([
    readFile(resourcesUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(source, /Create document/);
  assert.match(source, /button-primary repository-group-create-action/);
  assert.match(
    styles,
    /button\.button-primary\.repository-group-create-action[\s\S]*background: #101010/,
  );
  assert.match(source, /Choose a pipeline/);
  assert.match(source, /createProjectDocumentActionAction\(\{/);
  assert.match(source, /repositoryGroupId: group\.id/);
  assert.match(source, /setTab\("actions"\)/);
  assert.match(source, /Actions <span>\{projectActions\.length\}<\/span>/);
});

test("actions tab filters mappings and renders action details as table rows", async () => {
  const source = await readFile(actionsPanelUrl, "utf8");

  assert.match(source, /Filter actions by repository group/);
  assert.match(source, /Filter actions by pipeline/);
  assert.match(source, /aria-multiselectable="true"/);
  assert.match(source, /repositoryGroupIds\.includes\(action\.repositoryGroupId\)/);
  assert.match(source, /pipelineIds\.includes\(action\.pipelineId\)/);
  assert.match(source, /<table className="module-table actions-table">/);
  assert.match(source, /action\.actionType/);
  assert.match(source, /action\.state/);
  assert.match(source, /action\.repositoryGroupName/);
  assert.match(source, /action\.pipelineName/);
});

test("project page loads actions through the project session", async () => {
  const source = await readFile(projectPageUrl, "utf8");

  assert.match(source, /listProjectDocumentActions\(sessionToken\)/);
  assert.match(source, /actions=\{actions\}/);
});
