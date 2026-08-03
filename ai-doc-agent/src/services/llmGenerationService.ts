import "server-only";

import { createHash, createHmac } from "node:crypto";

import type { LlmConnectorInput } from "@/types/llmConnector";

const REQUEST_TIMEOUT_MS = 120_000;
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_OUTPUT_TOKENS = 12_000;

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The model returned an invalid response.");
  }
  return value as Record<string, unknown>;
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    console.error("Repository analyzer model request failed", {
      host: new URL(url).hostname,
      status: response.status,
    });
    throw new Error("The repository analyzer model request failed.");
  }
  return response.json().catch(() => {
    throw new Error("The model returned an invalid response.");
  });
}

function parseOpenAiText(value: unknown) {
  const choices = asObject(value).choices;
  if (!Array.isArray(choices) || !choices[0]) {
    throw new Error("The model returned no analysis.");
  }
  const content = asObject(asObject(choices[0]).message).content;
  if (typeof content === "string" && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        const item = asObject(part);
        return typeof item.text === "string" ? item.text : "";
      })
      .join("");
    if (text.trim()) return text;
  }
  throw new Error("The model returned no analysis.");
}

function parseAnthropicText(value: unknown) {
  const content = asObject(value).content;
  if (!Array.isArray(content)) throw new Error("The model returned no analysis.");
  const text = content
    .map((part) => {
      const item = asObject(part);
      return item.type === "text" && typeof item.text === "string"
        ? item.text
        : "";
    })
    .join("");
  if (!text.trim()) throw new Error("The model returned no analysis.");
  return text;
}

function parseGeminiText(value: unknown) {
  const candidates = asObject(value).candidates;
  if (!Array.isArray(candidates) || !candidates[0]) {
    throw new Error("The model returned no analysis.");
  }
  const parts = asObject(asObject(candidates[0]).content).parts;
  if (!Array.isArray(parts)) throw new Error("The model returned no analysis.");
  const text = parts
    .map((part) => {
      const item = asObject(part);
      return typeof item.text === "string" ? item.text : "";
    })
    .join("");
  if (!text.trim()) throw new Error("The model returned no analysis.");
  return text;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function awsEncodePath(path: string) {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function bedrockHeaders(input: LlmConnectorInput & { connector: "bedrock" }, body: string) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const host = `bedrock-runtime.${input.region}.amazonaws.com`;
  const path = `/model/${awsEncodePath(input.defaultModel)}/converse`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host,
    "x-amz-date": amzDate,
    ...(input.sessionToken ? { "x-amz-security-token": input.sessionToken } : {}),
  };
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name].trim()}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    "POST",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    sha256(body),
  ].join("\n");
  const scope = `${date}/${input.region}/bedrock/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");
  const dateKey = hmac(`AWS4${input.secretAccessKey}`, date);
  const regionKey = hmac(dateKey, input.region);
  const serviceKey = hmac(regionKey, "bedrock");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = createHmac("sha256", signingKey)
    .update(stringToSign, "utf8")
    .digest("hex");
  headers.Authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { headers, url: `https://${host}${path}` };
}

function parseBedrockText(value: unknown) {
  const output = asObject(value).output;
  const message = asObject(asObject(output).message);
  const content = message.content;
  if (!Array.isArray(content)) throw new Error("The model returned no analysis.");
  const text = content
    .map((part) => {
      const item = asObject(part);
      return typeof item.text === "string" ? item.text : "";
    })
    .join("");
  if (!text.trim()) throw new Error("The model returned no analysis.");
  return text;
}

export async function generateLlmText(input: {
  connection: LlmConnectorInput;
  system: string;
  prompt: string;
}): Promise<string> {
  const { connection, system, prompt } = input;
  switch (connection.connector) {
    case "openai": {
      const value = await requestJson("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: connection.defaultModel,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          max_completion_tokens: MAX_OUTPUT_TOKENS,
        }),
      });
      return parseOpenAiText(value);
    }
    case "azure_openai": {
      const headers = new Headers({ "Content-Type": "application/json" });
      if (connection.authenticationMethod === "api_key") {
        headers.set("api-key", connection.credential);
      } else {
        headers.set("Authorization", `Bearer ${connection.credential}`);
      }
      const value = await requestJson(
        `${new URL(connection.endpoint).origin}/openai/v1/chat/completions`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: connection.defaultModel,
            messages: [
              { role: "system", content: system },
              { role: "user", content: prompt },
            ],
            temperature: 0.1,
            max_completion_tokens: MAX_OUTPUT_TOKENS,
          }),
        },
      );
      return parseOpenAiText(value);
    }
    case "anthropic": {
      const headers = new Headers({
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      });
      if (connection.authenticationMethod === "api_key") {
        headers.set("x-api-key", connection.credential);
      } else {
        headers.set("Authorization", `Bearer ${connection.credential}`);
      }
      const value = await requestJson("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: connection.defaultModel,
          system,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: MAX_OUTPUT_TOKENS,
        }),
      });
      return parseAnthropicText(value);
    }
    case "gemini": {
      const model = connection.defaultModel.replace(/^models\//, "");
      const url = new URL(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      );
      const headers = new Headers({ "Content-Type": "application/json" });
      if (connection.authenticationMethod === "standard_api_key") {
        url.searchParams.set("key", connection.credential);
      } else {
        headers.set("x-goog-api-key", connection.credential);
      }
      const value = await requestJson(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            responseMimeType: "application/json",
          },
        }),
      });
      return parseGeminiText(value);
    }
    case "vertex_ai": {
      const model = connection.defaultModel.startsWith("publishers/")
        ? connection.defaultModel
        : `publishers/google/models/${connection.defaultModel}`;
      const url =
        `https://${connection.location}-aiplatform.googleapis.com/v1/projects/` +
        `${encodeURIComponent(connection.projectId)}/locations/${encodeURIComponent(connection.location)}/` +
        `${model.split("/").map(encodeURIComponent).join("/")}:generateContent`;
      const value = await requestJson(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.credential}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            responseMimeType: "application/json",
          },
        }),
      });
      return parseGeminiText(value);
    }
    case "bedrock": {
      const body = JSON.stringify({
        system: [{ text: system }],
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { temperature: 0.1, maxTokens: MAX_OUTPUT_TOKENS },
      });
      const signed = bedrockHeaders(connection, body);
      const value = await requestJson(signed.url, {
        method: "POST",
        headers: signed.headers,
        body,
      });
      return parseBedrockText(value);
    }
  }
}
