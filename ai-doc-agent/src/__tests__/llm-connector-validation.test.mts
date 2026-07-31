import assert from "node:assert/strict";
import test from "node:test";

import { llmConnectorInputSchema } from "../types/llmConnector.ts";

const credential = "secret-credential-value";

const validInputs = [
  {
    connector: "openai",
    authenticationMethod: "api_key",
    credential,
    defaultModel: "gpt-example",
  },
  {
    connector: "openai",
    authenticationMethod: "access_token",
    credential,
    defaultModel: "gpt-example",
  },
  {
    connector: "anthropic",
    authenticationMethod: "api_key",
    credential,
    defaultModel: "claude-example",
  },
  {
    connector: "anthropic",
    authenticationMethod: "bearer_token",
    credential,
    defaultModel: "claude-example",
  },
  {
    connector: "gemini",
    authenticationMethod: "standard_api_key",
    credential,
    defaultModel: "models/gemini-example",
  },
  {
    connector: "gemini",
    authenticationMethod: "authorization_api_key",
    credential,
    defaultModel: "models/gemini-example",
  },
  {
    connector: "azure_openai",
    authenticationMethod: "api_key",
    endpoint: "https://my-resource.openai.azure.com",
    credential,
    defaultModel: "azure-model",
  },
  {
    connector: "azure_openai",
    authenticationMethod: "entra_token",
    endpoint: "https://my-resource.services.ai.azure.com/",
    credential,
    defaultModel: "azure-model",
  },
  {
    connector: "bedrock",
    authenticationMethod: "aws_access_keys",
    region: "us-east-1",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: credential,
    sessionToken: "",
    defaultModel: "amazon.model-example-v1:0",
  },
  {
    connector: "vertex_ai",
    authenticationMethod: "oauth_access_token",
    projectId: "sample-project-123",
    location: "us-central1",
    credential,
    defaultModel: "publishers/google/models/gemini-example",
  },
] as const;

test("accepts every connector and supported credential method", () => {
  for (const input of validInputs) {
    assert.equal(llmConnectorInputSchema.safeParse(input).success, true);
  }
});

test("requires provider cloud metadata and credentials", () => {
  for (const input of [
    {
      connector: "azure_openai",
      authenticationMethod: "api_key",
      credential,
    },
    {
      connector: "bedrock",
      authenticationMethod: "aws_access_keys",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    },
    {
      connector: "vertex_ai",
      authenticationMethod: "oauth_access_token",
      location: "us-central1",
      credential,
    },
  ]) {
    assert.equal(llmConnectorInputSchema.safeParse(input).success, false);
  }
});

test("rejects unsafe Azure endpoints", () => {
  const endpoints = [
    "http://resource.openai.azure.com",
    "https://resource.openai.azure.com.evil.example",
    "https://user:pass@resource.openai.azure.com",
    "https://resource.openai.azure.com:444",
    "https://resource.openai.azure.com/sneaky/path",
    "https://127.0.0.1",
  ];

  for (const endpoint of endpoints) {
    assert.equal(
      llmConnectorInputSchema.safeParse({
        connector: "azure_openai",
        authenticationMethod: "api_key",
        endpoint,
        credential,
      }).success,
      false,
      endpoint,
    );
  }
});

test("rejects invalid regions and Google identifiers", () => {
  assert.equal(
    llmConnectorInputSchema.safeParse({
      connector: "bedrock",
      authenticationMethod: "aws_access_keys",
      region: "localhost",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: credential,
    }).success,
    false,
  );
  assert.equal(
    llmConnectorInputSchema.safeParse({
      connector: "vertex_ai",
      authenticationMethod: "oauth_access_token",
      projectId: "../another-project",
      location: "us-central1.example.com",
      credential,
    }).success,
    false,
  );
});

test("rejects oversized, malformed, and mismatched inputs", () => {
  for (const input of [
    {
      connector: "openai",
      authenticationMethod: "api_key",
      credential: "x".repeat(8193),
      defaultModel: "gpt-example",
    },
    {
      connector: "anthropic",
      authenticationMethod: "api_key",
      credential: "secret\u0000value",
      defaultModel: "claude-example",
    },
    {
      connector: "gemini",
      authenticationMethod: "bearer_token",
      credential,
    },
  ]) {
    assert.equal(llmConnectorInputSchema.safeParse(input).success, false);
  }
});

test("requires a safe default model for every staged LLM connection", () => {
  for (const input of [
    {
      connector: "openai",
      authenticationMethod: "api_key",
      credential,
    },
    {
      connector: "anthropic",
      authenticationMethod: "api_key",
      credential,
      defaultModel: "../unsafe model",
    },
  ]) {
    assert.equal(llmConnectorInputSchema.safeParse(input).success, false);
  }
});
