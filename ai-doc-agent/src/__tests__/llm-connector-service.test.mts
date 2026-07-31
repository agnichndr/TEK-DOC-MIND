import assert from "node:assert/strict";
import test from "node:test";

import type { BedrockClient } from "@aws-sdk/client-bedrock";

import {
  discoverLlmModels,
  LlmConnectorVerificationError,
  verifyLlmConnector,
  verifyLlmModelAccess,
} from "../services/llmConnectorService.ts";
import type { LlmConnectorInput } from "../types/llmConnector.ts";

const secret = "never-return-this-secret";
const defaultModel = "gpt-test-model";
const openAiInput: LlmConnectorInput = {
  connector: "openai",
  authenticationMethod: "api_key",
  credential: secret,
  defaultModel,
};

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function expectCode(
  expected: LlmConnectorVerificationError["code"],
  fetchImplementation: typeof fetch,
) {
  await assert.rejects(
    verifyLlmConnector(openAiInput, { fetchImplementation }),
    (error) =>
      error instanceof LlmConnectorVerificationError &&
      error.code === expected,
  );
}

test("discovers OpenAI models without returning the credential", async () => {
  let authorization = "";
  const models = await discoverLlmModels(
    {
      connector: "openai",
      authenticationMethod: "api_key",
      credential: secret,
    },
    {
      fetchImplementation: async (_input, init) => {
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return response(200, {
          data: [
            { id: "gpt-z", created: 1 },
            { id: "gpt-a", created: 2 },
          ],
        });
      },
    },
  );

  assert.equal(authorization, `Bearer ${secret}`);
  assert.deepEqual(
    models.map((model) => model.id),
    ["gpt-a", "gpt-z"],
  );
  assert.equal(JSON.stringify(models).includes(secret), false);
});

test("paginates Claude models and keeps human-readable model names", async () => {
  const calls: URL[] = [];
  const models = await discoverLlmModels(
    {
      connector: "anthropic",
      authenticationMethod: "api_key",
      credential: secret,
    },
    {
      fetchImplementation: async (input, init) => {
        const url = new URL(String(input));
        calls.push(url);
        assert.equal(new Headers(init?.headers).get("x-api-key"), secret);
        return url.searchParams.has("after_id")
          ? response(200, {
              data: [
                {
                  id: "claude-second",
                  display_name: "Claude Second",
                  created_at: "2026-01-02T00:00:00Z",
                },
              ],
              has_more: false,
              last_id: "claude-second",
            })
          : response(200, {
              data: [
                {
                  id: "claude-first",
                  display_name: "Claude First",
                  created_at: "2026-01-01T00:00:00Z",
                },
              ],
              has_more: true,
              last_id: "claude-first",
            });
      },
    },
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.searchParams.get("after_id"), "claude-first");
  assert.deepEqual(
    models.map(({ id, displayName }) => ({ id, displayName })),
    [
      { id: "claude-first", displayName: "Claude First" },
      { id: "claude-second", displayName: "Claude Second" },
    ],
  );
});

test("verifies the selected model and returns only a safe summary", async () => {
  const summary = await verifyLlmConnector(openAiInput, {
    fetchImplementation: async (input) => {
      assert.equal(
        String(input),
        `https://api.openai.com/v1/models/${defaultModel}`,
      );
      return response(200, { id: defaultModel, created: 1 });
    },
    now: () => new Date("2026-07-31T00:00:00.000Z"),
  });

  assert.deepEqual(summary, {
    connector: "openai",
    authenticationMethod: "api_key",
    defaultModel,
    status: "connected",
    verifiedAt: "2026-07-31T00:00:00.000Z",
  });
  assert.equal(JSON.stringify(summary).includes(secret), false);
});

test("maps model and credential access failures", async () => {
  await expectCode("invalid_credentials", async () => response(401, {}));
  await expectCode("forbidden", async () => response(403, {}));
  await expectCode("model_unavailable", async () => response(404, {}));
  await expectCode("rate_limited", async () => response(429, {}));
});

test("rejects malformed and mismatched model responses", async () => {
  await expectCode("invalid_response", async () =>
    response(200, { id: "another-model" }),
  );
  await assert.rejects(
    verifyLlmModelAccess(openAiInput, {
      fetchImplementation: async () => new Response("<not-json>", { status: 200 }),
    }),
    (error) =>
      error instanceof LlmConnectorVerificationError &&
      error.code === "invalid_response",
  );
});

test("sanitizes provider timeouts and network failures", async () => {
  await expectCode("timeout", async () => {
    throw new DOMException("secret timeout detail", "TimeoutError");
  });
  await expectCode("unavailable", async () => {
    throw new Error(`network failed with ${secret}`);
  });
});

test("discovers and verifies Gemini model metadata", async () => {
  const calls: string[] = [];
  const input: LlmConnectorInput = {
    connector: "gemini",
    authenticationMethod: "authorization_api_key",
    credential: secret,
    defaultModel: "models/gemini-test",
  };
  const fetchImplementation: typeof fetch = async (request, init) => {
    calls.push(String(request));
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), secret);
    return String(request).endsWith("/models/gemini-test")
      ? response(200, { name: input.defaultModel, displayName: "Gemini Test" })
      : response(200, {
          models: [{ name: input.defaultModel, displayName: "Gemini Test" }],
        });
  };

  const models = await discoverLlmModels(
    {
      connector: "gemini",
      authenticationMethod: "authorization_api_key",
      credential: secret,
    },
    { fetchImplementation },
  );
  const model = await verifyLlmModelAccess(input, { fetchImplementation });

  assert.equal(models[0]?.id, input.defaultModel);
  assert.equal(model.id, input.defaultModel);
  assert.equal(calls.every((url) => new URL(url).hostname === "generativelanguage.googleapis.com"), true);
});

test("discovers and verifies Azure OpenAI model metadata", async () => {
  const input: LlmConnectorInput = {
    connector: "azure_openai",
    authenticationMethod: "entra_token",
    endpoint: "https://safe-resource.openai.azure.com",
    credential: secret,
    defaultModel: "azure-test-model",
  };
  const fetchImplementation: typeof fetch = async (request, init) => {
    assert.equal(new URL(String(request)).hostname, "safe-resource.openai.azure.com");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${secret}`);
    return String(request).endsWith(input.defaultModel)
      ? response(200, { id: input.defaultModel, created: 1 })
      : response(200, { data: [{ id: input.defaultModel, created: 1 }] });
  };

  const models = await discoverLlmModels(
    {
      connector: "azure_openai",
      authenticationMethod: "entra_token",
      endpoint: input.endpoint,
      credential: secret,
    },
    { fetchImplementation },
  );
  const model = await verifyLlmModelAccess(input, { fetchImplementation });
  assert.equal(models[0]?.id, input.defaultModel);
  assert.equal(model.id, input.defaultModel);
});

test("discovers and verifies Bedrock model availability", async () => {
  const input: LlmConnectorInput & { connector: "bedrock" } = {
    connector: "bedrock",
    authenticationMethod: "aws_access_keys",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: secret,
    defaultModel: "amazon.test-model-v1:0",
  };
  const commands: string[] = [];
  const bedrockClientFactory = () =>
    ({
      send: async (command: object) => {
        commands.push(command.constructor.name);
        return command.constructor.name === "ListFoundationModelsCommand"
          ? {
              modelSummaries: [
                { modelId: input.defaultModel, modelName: "Amazon Test" },
              ],
            }
          : {
              modelId: input.defaultModel,
              agreementAvailability: { status: "AVAILABLE" },
              authorizationStatus: "AUTHORIZED",
              entitlementAvailability: "AVAILABLE",
              regionAvailability: "AVAILABLE",
            };
      },
      destroy: () => undefined,
    }) as unknown as BedrockClient;

  const { defaultModel: _defaultModel, ...discoveryInput } = input;
  void _defaultModel;
  const models = await discoverLlmModels(discoveryInput, {
    bedrockClientFactory,
  });
  const model = await verifyLlmModelAccess(input, { bedrockClientFactory });

  assert.equal(models[0]?.id, input.defaultModel);
  assert.equal(model.id, input.defaultModel);
  assert.deepEqual(commands, [
    "ListFoundationModelsCommand",
    "GetFoundationModelAvailabilityCommand",
  ]);
});

test("discovers and verifies Vertex AI publisher models", async () => {
  const input: LlmConnectorInput = {
    connector: "vertex_ai",
    authenticationMethod: "oauth_access_token",
    projectId: "safe-project",
    location: "us-central1",
    credential: secret,
    defaultModel: "publishers/google/models/gemini-test",
  };
  const fetchImplementation: typeof fetch = async (request, init) => {
    assert.equal(new URL(String(request)).hostname, "us-central1-aiplatform.googleapis.com");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${secret}`);
    return String(request).includes("/gemini-test")
      ? response(200, { name: input.defaultModel, displayName: "Gemini Test" })
      : response(200, {
          publisherModels: [
            { name: input.defaultModel, displayName: "Gemini Test" },
          ],
        });
  };

  const models = await discoverLlmModels(
    {
      connector: "vertex_ai",
      authenticationMethod: "oauth_access_token",
      projectId: input.projectId,
      location: input.location,
      credential: secret,
    },
    { fetchImplementation },
  );
  const model = await verifyLlmModelAccess(input, { fetchImplementation });
  assert.equal(models[0]?.id, input.defaultModel);
  assert.equal(model.id, input.defaultModel);
});
