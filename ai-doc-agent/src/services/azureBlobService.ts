import "server-only";

import { createHmac } from "node:crypto";

import { getAzureBlobEnv } from "@/lib/env";

const AZURE_STORAGE_API_VERSION = "2023-11-03";

function normalizeHeaderValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function blobUrl(accountName: string, containerName: string, blobName: string) {
  const encodedName = blobName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://${accountName}.blob.core.windows.net/${containerName}/${encodedName}`;
}

function authorizationHeader(input: {
  method: "PUT" | "DELETE";
  accountName: string;
  accessKey: string;
  containerName: string;
  blobName: string;
  contentLength?: number;
  contentType?: string;
  azureHeaders: Record<string, string>;
}) {
  const canonicalHeaders = Object.entries(input.azureHeaders)
    .map(([name, value]) => [name.toLowerCase(), normalizeHeaderValue(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}\n`)
    .join("");
  const canonicalResource = `/${input.accountName}/${input.containerName}/${input.blobName}`;
  const stringToSign = [
    input.method,
    "",
    "",
    input.contentLength === undefined ? "" : String(input.contentLength),
    "",
    input.contentType ?? "",
    "",
    "",
    "",
    "",
    "",
    "",
  ].join("\n") + `\n${canonicalHeaders}${canonicalResource}`;
  const signature = createHmac("sha256", Buffer.from(input.accessKey, "base64"))
    .update(stringToSign, "utf8")
    .digest("base64");
  return `SharedKey ${input.accountName}:${signature}`;
}

export async function uploadPipelineBlob(input: {
  blobName: string;
  file: File;
}) {
  const env = getAzureBlobEnv();
  const date = new Date().toUTCString();
  const contentType = input.file.type || "application/octet-stream";
  const azureHeaders = {
    "x-ms-blob-type": "BlockBlob",
    "x-ms-date": date,
    "x-ms-version": AZURE_STORAGE_API_VERSION,
  };
  const response = await fetch(
    blobUrl(
      env.AZURE_STORAGE_ACCOUNT_NAME,
      env.AZURE_STORAGE_CONTAINER_NAME,
      input.blobName,
    ),
    {
      body: new Uint8Array(await input.file.arrayBuffer()),
      headers: {
        Authorization: authorizationHeader({
          method: "PUT",
          accountName: env.AZURE_STORAGE_ACCOUNT_NAME,
          accessKey: env.AZURE_STORAGE_ACCESS_KEY,
          containerName: env.AZURE_STORAGE_CONTAINER_NAME,
          blobName: input.blobName,
          contentLength: input.file.size,
          contentType,
          azureHeaders,
        }),
        "Content-Length": String(input.file.size),
        "Content-Type": contentType,
        ...azureHeaders,
      },
      method: "PUT",
    },
  );

  if (!response.ok) {
    console.error("Azure pipeline upload failed", {
      status: response.status,
      requestId: response.headers.get("x-ms-request-id"),
    });
    throw new Error("Azure Blob upload failed.");
  }

  return {
    mediaUrl: blobUrl(
      env.AZURE_STORAGE_ACCOUNT_NAME,
      env.AZURE_STORAGE_CONTAINER_NAME,
      input.blobName,
    ),
    contentType,
  };
}

export async function uploadTextBlob(input: {
  blobName: string;
  content: string;
  contentType?: string;
}) {
  const env = getAzureBlobEnv();
  const date = new Date().toUTCString();
  const bytes = Buffer.from(input.content, "utf8");
  const contentType = input.contentType ?? "text/plain; charset=utf-8";
  const azureHeaders = {
    "x-ms-blob-content-type": contentType,
    "x-ms-blob-type": "BlockBlob",
    "x-ms-date": date,
    "x-ms-version": AZURE_STORAGE_API_VERSION,
  };
  const response = await fetch(
    blobUrl(
      env.AZURE_STORAGE_ACCOUNT_NAME,
      env.AZURE_STORAGE_CONTAINER_NAME,
      input.blobName,
    ),
    {
      body: bytes,
      headers: {
        Authorization: authorizationHeader({
          method: "PUT",
          accountName: env.AZURE_STORAGE_ACCOUNT_NAME,
          accessKey: env.AZURE_STORAGE_ACCESS_KEY,
          containerName: env.AZURE_STORAGE_CONTAINER_NAME,
          blobName: input.blobName,
          contentLength: bytes.byteLength,
          contentType,
          azureHeaders,
        }),
        "Content-Length": String(bytes.byteLength),
        "Content-Type": contentType,
        ...azureHeaders,
      },
      method: "PUT",
    },
  );
  if (!response.ok) {
    console.error("Azure action artifact upload failed", {
      status: response.status,
      requestId: response.headers.get("x-ms-request-id"),
    });
    throw new Error("Azure Blob upload failed.");
  }
  return {
    mediaUrl: blobUrl(
      env.AZURE_STORAGE_ACCOUNT_NAME,
      env.AZURE_STORAGE_CONTAINER_NAME,
      input.blobName,
    ),
    contentType,
  };
}

export async function deletePipelineBlob(blobName: string) {
  const env = getAzureBlobEnv();
  const date = new Date().toUTCString();
  const azureHeaders = {
    "x-ms-date": date,
    "x-ms-delete-snapshots": "include",
    "x-ms-version": AZURE_STORAGE_API_VERSION,
  };
  const response = await fetch(
    blobUrl(
      env.AZURE_STORAGE_ACCOUNT_NAME,
      env.AZURE_STORAGE_CONTAINER_NAME,
      blobName,
    ),
    {
      headers: {
        Authorization: authorizationHeader({
          method: "DELETE",
          accountName: env.AZURE_STORAGE_ACCOUNT_NAME,
          accessKey: env.AZURE_STORAGE_ACCESS_KEY,
          containerName: env.AZURE_STORAGE_CONTAINER_NAME,
          blobName,
          azureHeaders,
        }),
        ...azureHeaders,
      },
      method: "DELETE",
    },
  );

  if (!response.ok && response.status !== 404) {
    console.error("Azure pipeline upload cleanup failed", {
      status: response.status,
      requestId: response.headers.get("x-ms-request-id"),
    });
    throw new Error("Azure Blob cleanup failed.");
  }
}
