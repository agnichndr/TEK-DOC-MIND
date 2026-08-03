import {
  BedrockClient,
  GetFoundationModelAvailabilityCommand,
  ListFoundationModelsCommand,
} from "@aws-sdk/client-bedrock";

import type {
  LlmConnectorInput,
  LlmConnectorSummary,
  LlmModelDiscoveryInput,
  LlmProviderModel,
  VerifyLlmConnectorErrorCode,
} from "@/types/llmConnector";

const REQUEST_TIMEOUT_MS = 10_000;
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_MODEL_PAGES = 20;

type FetchImplementation = typeof fetch;
type BedrockInput = LlmModelDiscoveryInput & { connector: "bedrock" };
type BedrockClientFactory = (input: BedrockInput) => BedrockClient;

export class LlmConnectorVerificationError extends Error {
  constructor(public readonly code: VerifyLlmConnectorErrorCode) {
    super(code);
    this.name = "LlmConnectorVerificationError";
  }
}

function classifyStatus(
  status: number,
  notFoundCode: VerifyLlmConnectorErrorCode = "unavailable",
): VerifyLlmConnectorErrorCode {
  if (status === 401) return "invalid_credentials";
  if (status === 403) return "forbidden";
  if (status === 404) return notFoundCode;
  if (status === 429) return "rate_limited";
  return "unavailable";
}

function classifyBedrockError(error: unknown): never {
  if (error instanceof LlmConnectorVerificationError) throw error;
  const name =
    error && typeof error === "object" && "name" in error
      ? String(error.name)
      : "";
  if (/UnrecognizedClient|InvalidSignature|IncompleteSignature/.test(name)) {
    throw new LlmConnectorVerificationError("invalid_credentials");
  }
  if (/AccessDenied/.test(name)) {
    throw new LlmConnectorVerificationError("forbidden");
  }
  if (/ResourceNotFound|Validation/.test(name)) {
    throw new LlmConnectorVerificationError("model_unavailable");
  }
  if (/Throttl/.test(name)) {
    throw new LlmConnectorVerificationError("rate_limited");
  }
  if (/Timeout|Abort/.test(name)) {
    throw new LlmConnectorVerificationError("timeout");
  }
  throw new LlmConnectorVerificationError("unavailable");
}

function assertObject(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new LlmConnectorVerificationError("invalid_response");
  }
}

function assertArrayField(
  value: unknown,
  field: string,
): asserts value is Record<string, unknown> {
  assertObject(value);
  if (!Array.isArray(value[field])) {
    throw new LlmConnectorVerificationError("invalid_response");
  }
}

async function requestJson(
  fetchImplementation: FetchImplementation,
  url: string,
  init: RequestInit,
  notFoundCode?: VerifyLlmConnectorErrorCode,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new LlmConnectorVerificationError("timeout");
    }
    throw new LlmConnectorVerificationError("unavailable");
  }
  if (!response.ok) {
    throw new LlmConnectorVerificationError(
      classifyStatus(response.status, notFoundCode),
    );
  }
  try {
    return await response.json();
  } catch {
    throw new LlmConnectorVerificationError("invalid_response");
  }
}

function openAiHeaders(input: LlmModelDiscoveryInput & { connector: "openai" }) {
  return { Authorization: `Bearer ${input.credential}` };
}

function anthropicHeaders(
  input: LlmModelDiscoveryInput & { connector: "anthropic" },
): Headers {
  const headers = new Headers({ "anthropic-version": ANTHROPIC_VERSION });
  if (input.authenticationMethod === "api_key") {
    headers.set("x-api-key", input.credential);
  } else {
    headers.set("Authorization", `Bearer ${input.credential}`);
  }
  return headers;
}

function geminiRequest(
  input: LlmModelDiscoveryInput & { connector: "gemini" },
  url: URL,
): RequestInit {
  if (input.authenticationMethod === "standard_api_key") {
    url.searchParams.set("key", input.credential);
    return { method: "GET" };
  }
  return { headers: { "x-goog-api-key": input.credential }, method: "GET" };
}

function azureHeaders(
  input: LlmModelDiscoveryInput & { connector: "azure_openai" },
): Headers {
  const headers = new Headers();
  if (input.authenticationMethod === "api_key") {
    headers.set("api-key", input.credential);
  } else {
    headers.set("Authorization", `Bearer ${input.credential}`);
  }
  return headers;
}

function createBedrockClient(input: BedrockInput) {
  return new BedrockClient({
    region: input.region,
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
      ...(input.sessionToken ? { sessionToken: input.sessionToken } : {}),
    },
    maxAttempts: 1,
    requestHandler: { requestTimeout: REQUEST_TIMEOUT_MS },
  });
}

function parseOpenAiModel(value: unknown): LlmProviderModel {
  assertObject(value);
  if (typeof value.id !== "string" || !value.id) {
    throw new LlmConnectorVerificationError("invalid_response");
  }
  return {
    id: value.id,
    displayName: value.id,
    createdAt:
      typeof value.created === "number" && Number.isFinite(value.created)
        ? new Date(value.created * 1000).toISOString()
        : null,
  };
}

function parseAnthropicModel(value: unknown): LlmProviderModel {
  assertObject(value);
  if (typeof value.id !== "string" || !value.id) {
    throw new LlmConnectorVerificationError("invalid_response");
  }
  return {
    id: value.id,
    displayName:
      typeof value.display_name === "string" && value.display_name
        ? value.display_name
        : value.id,
    createdAt:
      typeof value.created_at === "string" &&
      !Number.isNaN(Date.parse(value.created_at))
        ? new Date(value.created_at).toISOString()
        : null,
  };
}

function parseNamedModel(
  value: unknown,
  expectedPrefix: string,
): LlmProviderModel {
  assertObject(value);
  if (
    typeof value.name !== "string" ||
    !value.name.startsWith(expectedPrefix) ||
    value.name.length <= expectedPrefix.length
  ) {
    throw new LlmConnectorVerificationError("invalid_response");
  }
  return {
    id: value.name,
    displayName:
      typeof value.displayName === "string" && value.displayName
        ? value.displayName
        : value.name.slice(expectedPrefix.length),
    createdAt:
      typeof value.createTime === "string" &&
      !Number.isNaN(Date.parse(value.createTime))
        ? new Date(value.createTime).toISOString()
        : null,
  };
}

function supportsGeminiGenerateContent(value: unknown) {
  assertObject(value);
  if (
    !Array.isArray(value.supportedGenerationMethods) ||
    value.supportedGenerationMethods.some((method) => typeof method !== "string")
  ) {
    throw new LlmConnectorVerificationError("invalid_response");
  }
  return value.supportedGenerationMethods.includes("generateContent");
}

function uniqueModels(models: LlmProviderModel[]) {
  return [...new Map(models.map((model) => [model.id, model])).values()];
}

async function verifyVertexProjectAccess(
  input: LlmModelDiscoveryInput & { connector: "vertex_ai" },
  fetchImplementation: FetchImplementation,
) {
  const body = await requestJson(
    fetchImplementation,
    `https://${input.location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(input.projectId)}/locations/${encodeURIComponent(input.location)}/models?pageSize=1`,
    {
      headers: { Authorization: `Bearer ${input.credential}` },
      method: "GET",
    },
  );
  assertObject(body);
  if (body.models !== undefined && !Array.isArray(body.models)) {
    throw new LlmConnectorVerificationError("invalid_response");
  }
}

export async function discoverLlmModels(
  input: LlmModelDiscoveryInput,
  options: {
    fetchImplementation?: FetchImplementation;
    bedrockClientFactory?: BedrockClientFactory;
  } = {},
): Promise<LlmProviderModel[]> {
  const fetchImplementation = options.fetchImplementation ?? fetch;

  switch (input.connector) {
    case "openai": {
      const body = await requestJson(
        fetchImplementation,
        "https://api.openai.com/v1/models",
        { headers: openAiHeaders(input), method: "GET" },
      );
      assertArrayField(body, "data");
      return uniqueModels((body.data as unknown[]).map(parseOpenAiModel)).sort(
        (a, b) => a.displayName.localeCompare(b.displayName),
      );
    }
    case "anthropic": {
      const models: LlmProviderModel[] = [];
      let afterId: string | null = null;
      for (let page = 0; page < MAX_MODEL_PAGES; page += 1) {
        const url = new URL("https://api.anthropic.com/v1/models");
        url.searchParams.set("limit", "1000");
        if (afterId) url.searchParams.set("after_id", afterId);
        const body = await requestJson(fetchImplementation, url.toString(), {
          headers: anthropicHeaders(input),
          method: "GET",
        });
        assertArrayField(body, "data");
        models.push(...(body.data as unknown[]).map(parseAnthropicModel));
        if (body.has_more !== true) break;
        if (typeof body.last_id !== "string" || !body.last_id) {
          throw new LlmConnectorVerificationError("invalid_response");
        }
        afterId = body.last_id;
        if (page === MAX_MODEL_PAGES - 1) {
          throw new LlmConnectorVerificationError("invalid_response");
        }
      }
      return uniqueModels(models);
    }
    case "gemini": {
      const models: LlmProviderModel[] = [];
      let pageToken: string | null = null;
      for (let page = 0; page < MAX_MODEL_PAGES; page += 1) {
        const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
        url.searchParams.set("pageSize", "1000");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const init = geminiRequest(input, url);
        const body = await requestJson(
          fetchImplementation,
          url.toString(),
          init,
        );
        assertArrayField(body, "models");
        for (const candidate of body.models as unknown[]) {
          if (supportsGeminiGenerateContent(candidate)) {
            models.push(parseNamedModel(candidate, "models/"));
          }
        }
        if (typeof body.nextPageToken !== "string" || !body.nextPageToken) break;
        pageToken = body.nextPageToken;
        if (page === MAX_MODEL_PAGES - 1) {
          throw new LlmConnectorVerificationError("invalid_response");
        }
      }
      return uniqueModels(models);
    }
    case "azure_openai": {
      const body = await requestJson(
        fetchImplementation,
        `${new URL(input.endpoint).origin}/openai/v1/models`,
        { headers: azureHeaders(input), method: "GET" },
      );
      assertArrayField(body, "data");
      return uniqueModels((body.data as unknown[]).map(parseOpenAiModel)).sort(
        (a, b) => a.displayName.localeCompare(b.displayName),
      );
    }
    case "bedrock": {
      const client =
        options.bedrockClientFactory?.(input) ?? createBedrockClient(input);
      try {
        const response = await client.send(new ListFoundationModelsCommand({}));
        if (!Array.isArray(response.modelSummaries)) {
          throw new LlmConnectorVerificationError("invalid_response");
        }
        return response.modelSummaries.map((model) => {
          if (!model.modelId) {
            throw new LlmConnectorVerificationError("invalid_response");
          }
          return {
            id: model.modelId,
            displayName: model.modelName ?? model.modelId,
            createdAt: null,
          };
        });
      } catch (error) {
        classifyBedrockError(error);
      } finally {
        client.destroy();
      }
    }
    case "vertex_ai": {
      await verifyVertexProjectAccess(input, fetchImplementation);
      const models: LlmProviderModel[] = [];
      let pageToken: string | null = null;
      for (let page = 0; page < MAX_MODEL_PAGES; page += 1) {
        const url = new URL(
          `https://${input.location}-aiplatform.googleapis.com/v1/publishers/google/models`,
        );
        url.searchParams.set("pageSize", "1000");
        url.searchParams.set("listAllVersions", "true");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const body = await requestJson(fetchImplementation, url.toString(), {
          headers: { Authorization: `Bearer ${input.credential}` },
          method: "GET",
        });
        assertArrayField(body, "publisherModels");
        models.push(
          ...(body.publisherModels as unknown[]).map((model) =>
            parseNamedModel(model, "publishers/google/models/"),
          ),
        );
        if (typeof body.nextPageToken !== "string" || !body.nextPageToken) break;
        pageToken = body.nextPageToken;
        if (page === MAX_MODEL_PAGES - 1) {
          throw new LlmConnectorVerificationError("invalid_response");
        }
      }
      return uniqueModels(models);
    }
  }
}

export async function verifyLlmModelAccess(
  input: LlmConnectorInput,
  options: {
    fetchImplementation?: FetchImplementation;
    bedrockClientFactory?: BedrockClientFactory;
  } = {},
): Promise<LlmProviderModel> {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const encodedModel = encodeURIComponent(input.defaultModel);

  switch (input.connector) {
    case "openai": {
      const body = await requestJson(
        fetchImplementation,
        `https://api.openai.com/v1/models/${encodedModel}`,
        { headers: openAiHeaders(input), method: "GET" },
        "model_unavailable",
      );
      const model = parseOpenAiModel(body);
      if (model.id !== input.defaultModel) {
        throw new LlmConnectorVerificationError("invalid_response");
      }
      return model;
    }
    case "anthropic": {
      const body = await requestJson(
        fetchImplementation,
        `https://api.anthropic.com/v1/models/${encodedModel}`,
        { headers: anthropicHeaders(input), method: "GET" },
        "model_unavailable",
      );
      const model = parseAnthropicModel(body);
      if (model.id !== input.defaultModel) {
        throw new LlmConnectorVerificationError("invalid_response");
      }
      return model;
    }
    case "gemini": {
      if (!input.defaultModel.startsWith("models/")) {
        throw new LlmConnectorVerificationError("model_unavailable");
      }
      const modelId = input.defaultModel.slice("models/".length);
      const url = new URL(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}`,
      );
      const init = geminiRequest(input, url);
      const body = await requestJson(
        fetchImplementation,
        url.toString(),
        init,
        "model_unavailable",
      );
      const model = parseNamedModel(body, "models/");
      if (model.id !== input.defaultModel) {
        throw new LlmConnectorVerificationError("invalid_response");
      }
      if (!supportsGeminiGenerateContent(body)) {
        throw new LlmConnectorVerificationError("model_unavailable");
      }
      return model;
    }
    case "azure_openai": {
      const body = await requestJson(
        fetchImplementation,
        `${new URL(input.endpoint).origin}/openai/v1/models/${encodedModel}`,
        { headers: azureHeaders(input), method: "GET" },
        "model_unavailable",
      );
      const model = parseOpenAiModel(body);
      if (model.id !== input.defaultModel) {
        throw new LlmConnectorVerificationError("invalid_response");
      }
      return model;
    }
    case "bedrock": {
      const client =
        options.bedrockClientFactory?.(input) ?? createBedrockClient(input);
      try {
        const response = await client.send(
          new GetFoundationModelAvailabilityCommand({
            modelId: input.defaultModel,
          }),
        );
        if (response.modelId !== input.defaultModel) {
          throw new LlmConnectorVerificationError("invalid_response");
        }
        if (
          response.authorizationStatus !== "AUTHORIZED" ||
          response.entitlementAvailability !== "AVAILABLE" ||
          response.regionAvailability !== "AVAILABLE" ||
          response.agreementAvailability?.status !== "AVAILABLE"
        ) {
          throw new LlmConnectorVerificationError("model_unavailable");
        }
        return {
          id: response.modelId,
          displayName: response.modelId,
          createdAt: null,
        };
      } catch (error) {
        classifyBedrockError(error);
      } finally {
        client.destroy();
      }
    }
    case "vertex_ai": {
      await verifyVertexProjectAccess(input, fetchImplementation);
      const prefix = "publishers/google/models/";
      if (!input.defaultModel.startsWith(prefix)) {
        throw new LlmConnectorVerificationError("model_unavailable");
      }
      const modelId = input.defaultModel.slice(prefix.length);
      const body = await requestJson(
        fetchImplementation,
        `https://${input.location}-aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(modelId)}`,
        {
          headers: { Authorization: `Bearer ${input.credential}` },
          method: "GET",
        },
        "model_unavailable",
      );
      const model = parseNamedModel(body, prefix);
      if (model.id !== input.defaultModel) {
        throw new LlmConnectorVerificationError("invalid_response");
      }
      return model;
    }
  }
}

function safeSummary(
  input: LlmConnectorInput,
  verifiedAt: string,
): LlmConnectorSummary {
  const verified = { status: "connected" as const, verifiedAt };
  switch (input.connector) {
    case "openai":
      return {
        ...verified,
        connector: input.connector,
        authenticationMethod: input.authenticationMethod,
        defaultModel: input.defaultModel,
      };
    case "anthropic":
      return {
        ...verified,
        connector: input.connector,
        authenticationMethod: input.authenticationMethod,
        defaultModel: input.defaultModel,
      };
    case "gemini":
      return {
        ...verified,
        connector: input.connector,
        authenticationMethod: input.authenticationMethod,
        defaultModel: input.defaultModel,
      };
    case "azure_openai":
      return {
        ...verified,
        connector: input.connector,
        authenticationMethod: input.authenticationMethod,
        endpoint: new URL(input.endpoint).origin,
        defaultModel: input.defaultModel,
      };
    case "bedrock":
      return {
        ...verified,
        connector: input.connector,
        authenticationMethod: input.authenticationMethod,
        region: input.region,
        defaultModel: input.defaultModel,
      };
    case "vertex_ai":
      return {
        ...verified,
        connector: input.connector,
        authenticationMethod: input.authenticationMethod,
        projectId: input.projectId,
        location: input.location,
        defaultModel: input.defaultModel,
      };
  }
}

export async function verifyLlmConnector(
  input: LlmConnectorInput,
  options: {
    fetchImplementation?: FetchImplementation;
    bedrockClientFactory?: BedrockClientFactory;
    now?: () => Date;
  } = {},
): Promise<LlmConnectorSummary> {
  await verifyLlmModelAccess(input, options);
  return safeSummary(input, (options.now?.() ?? new Date()).toISOString());
}
