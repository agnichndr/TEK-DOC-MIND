import assert from "node:assert/strict";
import test from "node:test";

import {
  addConnectedConnector,
  removeConnectedConnector,
} from "../lib/llmConnectorSelection.ts";
import {
  getConnectorCardConnectionStatus,
  isConnectorDraftComplete,
  type ConnectorCredentialDraft,
} from "../lib/llmConnectorStatus.ts";
import type { LlmConnectorSummary } from "../types/llmConnector.ts";

function summary(
  connector: "openai" | "anthropic" | "gemini",
): LlmConnectorSummary {
  const verifiedAt = "2026-07-31T00:00:00.000Z";

  if (connector === "gemini") {
    return {
      connector,
      authenticationMethod: "standard_api_key",
      status: "connected",
      verifiedAt,
    };
  }

  return {
    connector,
    authenticationMethod: "api_key",
    status: "connected",
    verifiedAt,
  };
}

test("the first connected provider becomes the default", () => {
  const state = addConnectedConnector(
    { summaries: [], defaultConnector: null },
    summary("openai"),
  );

  assert.equal(state.defaultConnector, "openai");
  assert.deepEqual(
    state.summaries.map((item) => item.connector),
    ["openai"],
  );
});

test("additional providers do not replace the current default", () => {
  const state = addConnectedConnector(
    {
      summaries: [summary("openai")],
      defaultConnector: "openai",
    },
    summary("anthropic"),
  );

  assert.equal(state.defaultConnector, "openai");
  assert.deepEqual(
    state.summaries.map((item) => item.connector),
    ["openai", "anthropic"],
  );
});

test("removing the default promotes the next connected provider", () => {
  const state = removeConnectedConnector(
    {
      summaries: [summary("openai"), summary("gemini")],
      defaultConnector: "openai",
    },
    "openai",
  );

  assert.equal(state.defaultConnector, "gemini");
  assert.deepEqual(
    state.summaries.map((item) => item.connector),
    ["gemini"],
  );
});

function connectorDraft(
  overrides: Partial<ConnectorCredentialDraft> = {},
): ConnectorCredentialDraft {
  return {
    connector: "openai",
    credential: "",
    endpoint: "",
    region: "",
    accessKeyId: "",
    secretAccessKey: "",
    projectId: "",
    location: "",
    ...overrides,
  };
}

test("connector card status reflects live credential verification", () => {
  assert.equal(
    getConnectorCardConnectionStatus({
      draft: connectorDraft(),
      checking: false,
      verifiedThisSession: false,
    }),
    "not_connected",
  );
  assert.equal(
    getConnectorCardConnectionStatus({
      draft: connectorDraft({ credential: "present-key" }),
      checking: false,
      verifiedThisSession: false,
    }),
    "connection_error",
  );
  assert.equal(
    getConnectorCardConnectionStatus({
      draft: connectorDraft({ credential: "present-key" }),
      checking: true,
      verifiedThisSession: false,
    }),
    "checking",
  );
  assert.equal(
    getConnectorCardConnectionStatus({
      draft: connectorDraft({ credential: "present-key" }),
      checking: false,
      verifiedThisSession: true,
    }),
    "connected",
  );
});

test("only complete loaded connector data is eligible for automatic checking", () => {
  assert.equal(
    isConnectorDraftComplete(
      connectorDraft({
        connector: "azure_openai",
        credential: "present-key",
      }),
    ),
    false,
  );
  assert.equal(
    isConnectorDraftComplete(
      connectorDraft({
        connector: "azure_openai",
        credential: "present-key",
        endpoint: "https://resource.openai.azure.com",
      }),
    ),
    true,
  );
  assert.equal(
    isConnectorDraftComplete(
      connectorDraft({
        connector: "bedrock",
        accessKeyId: "AKIAEXAMPLE",
        secretAccessKey: "secret",
        region: "us-east-1",
      }),
    ),
    true,
  );
});
