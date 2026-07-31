import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionUrl = new URL(
  "../actions/projectResourceActions.ts",
  import.meta.url,
);

test("repository group writes validate input and require the session cookie", async () => {
  const source = await readFile(actionUrl, "utf8");
  const action = source.slice(
    source.indexOf("export async function saveProjectRepositoryGroupAction"),
    source.indexOf("export async function deleteProjectRepositoryGroupAction"),
  );
  assert.ok(action.indexOf("projectRepositoryGroupInputSchema.safeParse(input)") >= 0);
  assert.ok(action.indexOf("const token = await sessionToken()") >= 0);
  assert.ok(
    action.indexOf("const token = await sessionToken()") <
      action.indexOf("await saveProjectRepositoryGroup({"),
  );
});

test("project resource deletes require the server session before services", async () => {
  const source = await readFile(actionUrl, "utf8");
  for (const serviceCall of [
    "await deleteProjectRepositoryGroup({",
    "await deleteProjectLlmConnector({",
  ]) {
    const call = source.indexOf(serviceCall);
    const precedingSession = source.lastIndexOf(
      "const token = await sessionToken()",
      call,
    );
    assert.ok(call > 0);
    assert.ok(precedingSession > 0 && precedingSession < call);
  }
});

test("repository content browsing validates input and checks the server session first", async () => {
  const source = await readFile(
    new URL("../actions/repositoryActions.ts", import.meta.url),
    "utf8",
  );
  const action = source.slice(
    source.indexOf("export async function listRepositoryContentsAction"),
  );
  assert.ok(action.indexOf("listRepositoryContentsSchema.safeParse(input)") >= 0);
  assert.ok(
    action.indexOf("const sessionToken") <
      action.indexOf("await listProjectRepositoryContents({"),
  );
});
