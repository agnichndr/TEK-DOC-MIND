import "server-only";

import { randomUUID } from "node:crypto";

import { callSupabaseRpc } from "@/lib/supabase/server";
import { hashOpaqueToken } from "@/services/projectService";
import {
  encryptLlmCredential,
  type EncryptedLlmCredential,
} from "@/services/llmCredentialEncryptionService";
import {
  llmConnectorInputSchema,
  llmConnectorSummarySchema,
  type LlmConnectorInput,
  type LlmConnectorSummary,
  type LlmConnectorType,
} from "@/types/llmConnector";
import {
  projectRepositoryGroupInputSchema,
  type ProjectLlmConnector,
  type ProjectRepositoryGroup,
  type ProjectRepositoryGroupInput,
} from "@/types/projectResource";
import type { Json } from "@/types/database.types";

type RepositoryGroupRow = {
  id: string;
  repository_mode: "all" | "selected";
  name: string;
  description: string;
  repositories: Json;
  created_at: string;
  updated_at: string;
};

type LlmConnectorRow = {
  connector: string;
  summary: Json;
  credential_ciphertext: string | null;
  credential_nonce: string | null;
  credential_auth_tag: string | null;
  credential_key_version: number | null;
  created_at: string;
  updated_at: string;
};

export type ProjectLlmConnectorRecord = {
  summary: LlmConnectorSummary;
  encryptedCredential: EncryptedLlmCredential | null;
  createdAt: string;
  updatedAt: string;
};

function mapRepositoryGroup(row: RepositoryGroupRow): ProjectRepositoryGroup {
  const parsed = projectRepositoryGroupInputSchema.parse({
    id: row.id,
    repositoryMode: row.repository_mode,
    name: row.name,
    description: row.description,
    repositories: row.repositories,
  });

  return {
    ...parsed,
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLlmConnectorRecord(
  row: LlmConnectorRow,
): ProjectLlmConnectorRecord {
  const summary = llmConnectorSummarySchema.parse(row.summary);
  const encryptedCredential =
    row.credential_ciphertext &&
    row.credential_nonce &&
    row.credential_auth_tag &&
    row.credential_key_version
      ? {
          ciphertext: row.credential_ciphertext,
          nonce: row.credential_nonce,
          authTag: row.credential_auth_tag,
          keyVersion: row.credential_key_version,
        }
      : null;

  return {
    summary,
    encryptedCredential,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProjectRepositoryGroups(
  sessionToken: string,
): Promise<ProjectRepositoryGroup[]> {
  const rows = await callSupabaseRpc<RepositoryGroupRow[]>(
    "list_project_repository_groups",
    { p_session_token_hash: hashOpaqueToken(sessionToken) },
  );
  return rows.map(mapRepositoryGroup);
}

export async function saveProjectRepositoryGroup(
  input: ProjectRepositoryGroupInput & { sessionToken: string },
): Promise<ProjectRepositoryGroup> {
  const rows = await callSupabaseRpc<RepositoryGroupRow[]>(
    "save_project_repository_group",
    {
      p_session_token_hash: hashOpaqueToken(input.sessionToken),
      p_group_id: input.id ?? randomUUID(),
      p_repository_mode: input.repositoryMode,
      p_name: input.name,
      p_description: input.description,
      p_repositories: input.repositories as Json,
    },
  );
  if (!rows[0]) throw new Error("Repository group save returned no data.");
  return mapRepositoryGroup(rows[0]);
}

export async function deleteProjectRepositoryGroup(input: {
  sessionToken: string;
  id: string;
}): Promise<boolean> {
  return callSupabaseRpc<boolean>("delete_project_repository_group", {
    p_session_token_hash: hashOpaqueToken(input.sessionToken),
    p_group_id: input.id,
  });
}

export async function listProjectLlmConnectors(
  sessionToken: string,
): Promise<ProjectLlmConnector[]> {
  const records = await listProjectLlmConnectorRecords(sessionToken);
  return records.map((record) => ({
    ...record.summary,
    credentialStored: Boolean(record.encryptedCredential),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }));
}

export async function listProjectLlmConnectorRecords(
  sessionToken: string,
): Promise<ProjectLlmConnectorRecord[]> {
  const rows = await callSupabaseRpc<LlmConnectorRow[]>(
    "list_project_llm_connectors",
    { p_session_token_hash: hashOpaqueToken(sessionToken) },
  );
  return rows.map(mapLlmConnectorRecord);
}

export async function saveProjectLlmConnector(input: {
  sessionToken: string;
  summary: LlmConnectorSummary;
  connection: LlmConnectorInput;
}): Promise<ProjectLlmConnector> {
  const connection = llmConnectorInputSchema.parse(input.connection);
  const summary = llmConnectorSummarySchema.parse(input.summary);
  if (
    connection.connector !== summary.connector ||
    connection.authenticationMethod !== summary.authenticationMethod
  ) {
    throw new Error("Connector input and summary do not match.");
  }
  if (connection.defaultModel !== summary.defaultModel) {
    throw new Error("Connector default model and summary do not match.");
  }
  const encryptedCredential = encryptLlmCredential(connection);
  return saveEncryptedProjectLlmConnector({
    sessionToken: input.sessionToken,
    summary,
    encryptedCredential,
  });
}

export async function saveEncryptedProjectLlmConnector(input: {
  sessionToken: string;
  summary: LlmConnectorSummary;
  encryptedCredential: EncryptedLlmCredential;
}): Promise<ProjectLlmConnector> {
  const rows = await callSupabaseRpc<LlmConnectorRow[]>(
    "save_project_llm_connector",
    {
      p_session_token_hash: hashOpaqueToken(input.sessionToken),
      p_connector: input.summary.connector,
      p_summary: input.summary as Json,
      p_credential_ciphertext: input.encryptedCredential.ciphertext,
      p_credential_nonce: input.encryptedCredential.nonce,
      p_credential_auth_tag: input.encryptedCredential.authTag,
      p_credential_key_version: input.encryptedCredential.keyVersion,
    },
  );
  if (!rows[0]) throw new Error("LLM connector save returned no data.");
  const record = mapLlmConnectorRecord(rows[0]);
  return {
    ...record.summary,
    credentialStored: true,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function deleteProjectLlmConnector(input: {
  sessionToken: string;
  connector: LlmConnectorType;
}): Promise<boolean> {
  return callSupabaseRpc<boolean>("delete_project_llm_connector", {
    p_session_token_hash: hashOpaqueToken(input.sessionToken),
    p_connector: input.connector,
  });
}
