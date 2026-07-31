import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("credential routes verify same-origin and project session before outbound access", async () => {
  const source = await readFile(
    new URL("../app/api/llm-connectors/models/route.ts", import.meta.url),
    "utf8",
  );
  const sessionCheck = source.indexOf("getProjectWorkspace(sessionToken)");
  const providerCheck = source.indexOf("discoverLlmModels(parsed.data)");

  assert.ok(source.indexOf("isSameOriginMutation(request)") >= 0);
  assert.ok(sessionCheck > 0);
  assert.ok(providerCheck > sessionCheck);
  assert.ok(source.indexOf("if (!sessionToken)") < sessionCheck);
});

test("credential transport avoids Server Action argument logging and saves encrypted input", async () => {
  const actionSource = await readFile(
    new URL("../actions/llmConnectorActions.ts", import.meta.url),
    "utf8",
  );
  const routeSource = await readFile(
    new URL("../app/api/llm-connectors/establish/route.ts", import.meta.url),
    "utf8",
  );
  const connectorSource = await readFile(
    new URL("../components/forms/LlmConnectorStep.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(actionSource, /verifyLlmConnectorAction/);
  assert.doesNotMatch(routeSource, /JSON\.stringify\(parsed\.data\)/);
  assert.match(routeSource, /connection: parsed\.data/);
  assert.match(routeSource, /saveProjectLlmConnector/);
  assert.match(routeSource, /isSameOriginMutation/);
  assert.match(actionSource, /decryptLlmCredential/);
  assert.match(actionSource, /checkSavedLlmConnectorsAction/);
  assert.match(connectorSource, /\/api\/llm-connectors\/establish/);
  assert.match(connectorSource, /onSummariesChange\(nextState\.summaries\)/);
});

test("connected is returned only after model verification and encrypted database save", async () => {
  const routeSource = await readFile(
    new URL("../app/api/llm-connectors/establish/route.ts", import.meta.url),
    "utf8",
  );
  const serviceSource = await readFile(
    new URL("../services/projectResourceService.ts", import.meta.url),
    "utf8",
  );
  const encryptionSource = await readFile(
    new URL("../services/llmCredentialEncryptionService.ts", import.meta.url),
    "utf8",
  );

  const verify = routeSource.indexOf("verifyLlmConnector(parsed.data)");
  const save = routeSource.indexOf("await saveProjectLlmConnector({");
  const connected = routeSource.indexOf('status: "connected"');

  assert.ok(verify > 0 && save > verify && connected > save);
  assert.match(serviceSource, /encryptLlmCredential\(connection\)/);
  assert.match(
    serviceSource,
    /connection\.defaultModel !== summary\.defaultModel/,
  );
  assert.match(encryptionSource, /JSON\.stringify\(input\)/);
  assert.match(encryptionSource, /createCipheriv/);
});

test("saved connections are decrypted and model-checked before connected status", async () => {
  const actionSource = await readFile(
    new URL("../actions/llmConnectorActions.ts", import.meta.url),
    "utf8",
  );

  const decrypt = actionSource.indexOf("decryptLlmCredential(");
  const verify = actionSource.indexOf("verifyLlmConnector(connection)");
  const connected = actionSource.indexOf('status: "connected"', verify);

  assert.ok(decrypt > 0 && verify > decrypt && connected > verify);
  assert.match(actionSource, /listProjectLlmConnectorRecords\(sessionToken\)/);
});

test("encrypted connector migration preserves project/provider uniqueness and RPC scope", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202607310009_persist_encrypted_llm_connections.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /credential_ciphertext text/);
  assert.match(migration, /credential_nonce text/);
  assert.match(migration, /credential_auth_tag text/);
  assert.match(migration, /credential_key_version smallint/);
  assert.match(
    migration,
    /on conflict \(project_id, connector\) do update/,
  );
  assert.match(
    migration,
    /where sessions\.token_hash = p_session_token_hash[\s\S]*sessions\.expires_at > now\(\)/,
  );
  assert.match(
    migration,
    /revoke all on function public\.save_project_llm_connector/,
  );
});

test("default-model migration keeps session scope and validates safe summaries", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202607310010_require_llm_default_model.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /p_summary ->> 'defaultModel'/);
  assert.match(
    migration,
    /where sessions\.token_hash = p_session_token_hash[\s\S]*sessions\.expires_at > now\(\)/,
  );
  assert.match(migration, /security definer set search_path = ''/);
  assert.match(
    migration,
    /revoke all on function public\.save_project_llm_connector/,
  );
});

test("provider marks are sourced from the LobeHub icon library", async () => {
  const logoSource = await readFile(
    new URL("../components/ui/LlmProviderLogo.tsx", import.meta.url),
    "utf8",
  );

  assert.match(logoSource, /data-logo-library="LobeHub Icons"/);
  assert.doesNotMatch(logoSource, /<svg|<path/);
});
