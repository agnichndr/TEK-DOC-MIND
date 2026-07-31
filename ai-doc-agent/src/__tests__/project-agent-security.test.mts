import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("agent actions validate input and require a server project session", async () => {
  const source = await readFile(
    new URL("../actions/agentActions.ts", import.meta.url),
    "utf8",
  );
  const saveAction = source.slice(
    source.indexOf("export async function saveProjectAgentAction"),
    source.indexOf("export async function deleteProjectAgentAction"),
  );
  const deleteAction = source.slice(
    source.indexOf("export async function deleteProjectAgentAction"),
  );

  assert.ok(saveAction.indexOf("projectAgentInputSchema.safeParse(input)") >= 0);
  assert.ok(
    saveAction.indexOf("const token = await sessionToken()") <
      saveAction.indexOf("await saveProjectAgent({"),
  );
  assert.ok(
    deleteAction.indexOf("const token = await sessionToken()") <
      deleteAction.indexOf("await deleteProjectAgent({"),
  );
});

test("agent model discovery uses only the selected saved project connector", async () => {
  const route = await readFile(
    new URL("../app/api/agents/models/route.ts", import.meta.url),
    "utf8",
  );

  const sessionCheck = route.indexOf("getProjectWorkspace(sessionToken)");
  const recordLookup = route.indexOf("listProjectLlmConnectorRecords(sessionToken)");
  const decrypt = route.indexOf("decryptLlmCredential(");
  const discovery = route.indexOf("discoverLlmModels(connection)");

  assert.match(route, /projectAgentModelsInputSchema\.safeParse\(body\)/);
  assert.match(route, /isSameOriginMutation\(request\)/);
  assert.ok(sessionCheck > 0);
  assert.ok(recordLookup > sessionCheck);
  assert.ok(decrypt > recordLookup);
  assert.ok(discovery > decrypt);
  assert.doesNotMatch(route, /credential:\s*connection/);
});

test("agent connector and model fields use themed dropdowns", async () => {
  const source = await readFile(
    new URL("../components/forms/AgentsPanel.tsx", import.meta.url),
    "utf8",
  );
  const connectorDropdown = await readFile(
    new URL("../components/forms/LlmConnectorDropdown.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /fetch\("\/api\/agents\/models"/);
  assert.match(source, /<LlmConnectorDropdown/);
  assert.match(source, /ariaLabel="Model"/);
  assert.match(source, /ariaLabel="Output behavior"/);
  assert.match(source, /ariaLabel="Output type"/);
  assert.doesNotMatch(source, /<select/);
  assert.doesNotMatch(source, /<datalist/);
  assert.match(connectorDropdown, /aria-label="LLM connector"/);
  assert.match(connectorDropdown, /role="listbox"/);
});

test("agent skills use a VS Code-style Markdown editor with a safe fallback", async () => {
  const panel = await readFile(
    new URL("../components/forms/AgentsPanel.tsx", import.meta.url),
    "utf8",
  );
  const editor = await readFile(
    new URL("../components/forms/MarkdownCodeEditor.tsx", import.meta.url),
    "utf8",
  );
  const packageJson = await readFile(
    new URL("../../package.json", import.meta.url),
    "utf8",
  );

  assert.match(panel, /<MarkdownCodeEditor/);
  assert.doesNotMatch(panel, /className="agent-markdown-input"/);
  assert.match(editor, /monaco-editor\/editor\/editor\.api\.js/);
  assert.match(editor, /monaco-editor\/languages\/definitions\/markdown\/register\.js/);
  assert.match(editor, /language: "markdown"/);
  assert.match(editor, /lineNumbers: "on"/);
  assert.match(editor, /minimap: \{ enabled: true/);
  assert.match(editor, /ariaLabel: "Skills Markdown editor"/);
  assert.match(editor, /status === "error"/);
  assert.match(packageJson, /"monaco-editor": "0\.56\.0"/);
});

test("agent preview uses sanitized GFM rendering and code highlighting", async () => {
  const panel = await readFile(
    new URL("../components/forms/AgentsPanel.tsx", import.meta.url),
    "utf8",
  );
  const viewer = await readFile(
    new URL("../components/forms/MarkdownViewer.tsx", import.meta.url),
    "utf8",
  );

  const raw = viewer.indexOf("rehypeRaw,");
  const sanitize = viewer.indexOf("[rehypeSanitize, markdownSchema]");
  const highlight = viewer.indexOf("[rehypeHighlight,");

  assert.match(panel, /<MarkdownViewer markdown=\{draft\.skillsMarkdown\}/);
  assert.doesNotMatch(panel, /function MarkdownPreview/);
  assert.match(viewer, /remarkPlugins=\{\[remarkGfm\]\}/);
  assert.ok(raw > 0 && sanitize > raw && highlight > sanitize);
  assert.match(viewer, /defaultUrlTransform/);
  assert.match(viewer, /rel=\{external \? "noreferrer noopener"/);
});

test("agent cards use provider branding without exposing skills content", async () => {
  const source = await readFile(
    new URL("../components/forms/AgentsPanel.tsx", import.meta.url),
    "utf8",
  );
  const cardList = source.slice(source.indexOf('className="agent-card-grid"'));

  assert.match(cardList, /<LlmProviderLogo connector=\{agent\.connector\}/);
  assert.doesNotMatch(cardList, /agent\.skillsMarkdown/);
  assert.match(cardList, /outputModeLabels\[agent\.outputMode\]/);
  assert.match(cardList, /outputTypeLabels\[agent\.outputType\]/);
});

test("agent output migration preserves project-scoped RPC enforcement", async () => {
  const sql = await readFile(
    new URL(
      "../../supabase/migrations/202608010001_add_agent_output_configuration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(sql, /output_mode text not null default 'single'/i);
  assert.match(sql, /output_type text not null default 'text'/i);
  assert.match(sql, /p_output_mode not in \('single', 'multiple'\)/i);
  assert.match(sql, /p_output_type not in \('text', 'json', 'image'\)/i);
  assert.match(
    sql,
    /where sessions\.token_hash = p_session_token_hash[\s\S]*sessions\.expires_at > now\(\)/i,
  );
  assert.match(sql, /revoke all on function public\.save_project_agent/i);
});

test("agent output contract supports HTML and XML", async () => {
  const [schema, panel, sql] = await Promise.all([
    readFile(new URL("../types/agent.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../components/forms/AgentsPanel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../supabase/migrations/202608010002_expand_agent_output_types.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(schema, /"text",\s*"json",\s*"html",\s*"xml",\s*"image"/);
  assert.match(panel, /html: "HTML"/);
  assert.match(panel, /xml: "XML"/);
  assert.match(
    sql,
    /p_output_type not in \('text', 'json', 'html', 'xml', 'image'\)/i,
  );
  assert.match(
    sql,
    /where sessions\.token_hash = p_session_token_hash[\s\S]*sessions\.expires_at > now\(\)/i,
  );
});

test("project-agent migration enforces RLS and session-derived project scope", async () => {
  const sql = await readFile(
    new URL(
      "../../supabase/migrations/202607310013_create_project_agents.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(sql, /alter table public\.project_agents enable row level security/i);
  assert.match(sql, /alter table public\.project_agents force row level security/i);
  assert.match(sql, /revoke all on table public\.project_agents from anon, authenticated/i);
  assert.match(
    sql,
    /foreign key \(project_id, connector\)[\s\S]*references public\.project_llm_connectors\(project_id, connector\)/i,
  );
  assert.match(
    sql,
    /where sessions\.token_hash = p_session_token_hash[\s\S]*sessions\.expires_at > now\(\)/i,
  );
  assert.match(
    sql,
    /where project_agents\.id = p_agent_id[\s\S]*project_agents\.project_id = v_project_id/i,
  );
  assert.match(sql, /revoke all on function public\.save_project_agent/i);
});
