import "server-only";

import { randomUUID } from "node:crypto";

import {
  SupabaseRpcError,
  callSupabaseRpc,
} from "@/lib/supabase/server";
import {
  inspectGitHubRepository,
  listGitHubRepositoryBranches,
  listGitHubRepositoryContents,
} from "@/services/githubService";
import { hashOpaqueToken } from "@/services/projectService";
import {
  decryptRepositoryToken,
  encryptRepositoryToken,
  type EncryptedRepositoryToken,
} from "@/services/tokenEncryptionService";
import type {
  ProjectRepository,
  RepositoryContentEntry,
} from "@/types/repository";

type RepositoryRow = {
  id: string;
  github_repository_id: string;
  owner: string;
  name: string;
  url: string;
  visibility: "public" | "private";
  purpose: string;
  default_branch: string;
  has_stored_token: boolean;
  created_at: string;
  updated_at: string;
};

type RepositorySecretRow = {
  token_ciphertext: string;
  token_nonce: string;
  token_auth_tag: string;
  token_key_version: number;
};

export class DuplicateRepositoryError extends Error {
  constructor() {
    super("Repository already exists.");
    this.name = "DuplicateRepositoryError";
  }
}

function mapRepository(row: RepositoryRow): ProjectRepository {
  return {
    id: row.id,
    githubRepositoryId: row.github_repository_id,
    owner: row.owner,
    name: row.name,
    url: row.url,
    visibility: row.visibility,
    purpose: row.purpose,
    defaultBranch: row.default_branch,
    hasStoredToken: row.has_stored_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProjectRepositories(
  sessionToken: string,
): Promise<ProjectRepository[]> {
  const rows = await callSupabaseRpc<RepositoryRow[]>(
    "list_project_repositories",
    {
      p_session_token_hash: hashOpaqueToken(sessionToken),
    },
  );

  return rows.map(mapRepository);
}

export async function addProjectRepository(input: {
  sessionToken: string;
  url: string;
  purpose: string;
  accessToken?: string;
}): Promise<ProjectRepository> {
  const github = await inspectGitHubRepository(input.url, input.accessToken);
  const repositoryId = randomUUID();
  const encrypted =
    github.visibility === "private" && input.accessToken
      ? encryptRepositoryToken(input.accessToken, repositoryId)
      : null;

  try {
    const rows = await callSupabaseRpc<RepositoryRow[]>(
      "add_project_repository",
      {
        p_session_token_hash: hashOpaqueToken(input.sessionToken),
        p_repository_id: repositoryId,
        p_github_repository_id: github.githubRepositoryId,
        p_owner: github.owner,
        p_name: github.name,
        p_url: github.url,
        p_visibility: github.visibility,
        p_purpose: input.purpose,
        p_default_branch: github.defaultBranch,
        p_token_ciphertext: encrypted?.ciphertext ?? null,
        p_token_nonce: encrypted?.nonce ?? null,
        p_token_auth_tag: encrypted?.authTag ?? null,
        p_token_key_version: encrypted?.keyVersion ?? null,
      },
    );
    const repository = rows[0];

    if (!repository) {
      throw new Error("Repository creation returned no data.");
    }

    return mapRepository(repository);
  } catch (error) {
    if (error instanceof SupabaseRpcError && error.code === "23505") {
      throw new DuplicateRepositoryError();
    }

    throw error;
  }
}

export async function deleteProjectRepository(input: {
  sessionToken: string;
  repositoryId: string;
  repositoryName: string;
}): Promise<boolean> {
  const deleted = await callSupabaseRpc<boolean>(
    "delete_project_repository",
    {
      p_session_token_hash: hashOpaqueToken(input.sessionToken),
      p_repository_id: input.repositoryId,
      p_repository_name: input.repositoryName,
    },
  );

  return deleted;
}

export async function updateProjectRepository(input: {
  sessionToken: string;
  repositoryId: string;
  purpose: string;
}): Promise<ProjectRepository | null> {
  const rows = await callSupabaseRpc<RepositoryRow[]>(
    "update_project_repository",
    {
      p_session_token_hash: hashOpaqueToken(input.sessionToken),
      p_repository_id: input.repositoryId,
      p_purpose: input.purpose,
    },
  );

  return rows[0] ? mapRepository(rows[0]) : null;
}

export async function getRepositoryAccessToken(
  sessionToken: string,
  repositoryId: string,
): Promise<string | null> {
  const rows = await callSupabaseRpc<RepositorySecretRow[]>(
    "get_repository_secret",
    {
      p_session_token_hash: hashOpaqueToken(sessionToken),
      p_repository_id: repositoryId,
    },
  );
  const secret = rows[0];

  if (!secret) {
    return null;
  }

  const encrypted: EncryptedRepositoryToken = {
    ciphertext: secret.token_ciphertext,
    nonce: secret.token_nonce,
    authTag: secret.token_auth_tag,
    keyVersion: secret.token_key_version,
  };

  return decryptRepositoryToken(encrypted, repositoryId);
}

export async function listProjectRepositoryBranches(input: {
  sessionToken: string;
  repositoryId: string;
}): Promise<string[] | null> {
  const repositories = await listProjectRepositories(input.sessionToken);
  const repository = repositories.find(
    (candidate) => candidate.id === input.repositoryId,
  );

  if (!repository) {
    return null;
  }

  const accessToken = await getRepositoryAccessToken(
    input.sessionToken,
    repository.id,
  );
  const branches = await listGitHubRepositoryBranches({
    owner: repository.owner,
    name: repository.name,
    accessToken: accessToken ?? undefined,
  });

  return Array.from(new Set([repository.defaultBranch, ...branches]));
}

export async function listProjectRepositoryContents(input: {
  sessionToken: string;
  repositoryId: string;
  branch: string;
  path: string;
}): Promise<RepositoryContentEntry[] | null> {
  const repositories = await listProjectRepositories(input.sessionToken);
  const repository = repositories.find(
    (candidate) => candidate.id === input.repositoryId,
  );
  if (!repository) return null;

  const accessToken = await getRepositoryAccessToken(
    input.sessionToken,
    repository.id,
  );
  return listGitHubRepositoryContents({
    owner: repository.owner,
    name: repository.name,
    branch: input.branch,
    path: input.path,
    accessToken: accessToken ?? undefined,
  });
}
