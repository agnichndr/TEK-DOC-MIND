import "server-only";

import { z } from "zod";

import { parseGitHubRepositoryUrl } from "@/lib/githubUrl";
import type {
  RepositoryContentEntry,
  RepositoryVisibility,
} from "@/types/repository";

const GITHUB_API_VERSION = "2026-03-10";
const REQUEST_TIMEOUT_MS = 10_000;

const githubRepositorySchema = z.object({
  id: z.number().int().safe(),
  name: z.string().min(1),
  full_name: z.string().min(3),
  html_url: z.url(),
  private: z.boolean(),
  default_branch: z.string().min(1),
  size: z.number().nonnegative(),
  owner: z.object({
    login: z.string().min(1),
  }),
});

const githubBranchesSchema = z.array(
  z.object({
    name: z.string().min(1).max(255),
  }),
);

const githubContentEntriesSchema = z.array(
  z.object({
    name: z.string().min(1).max(255),
    path: z.string().min(1).max(1024),
    type: z.enum(["file", "dir", "symlink", "submodule"]),
    size: z.number().int().nonnegative().optional().default(0),
  }),
);

export type GitHubRepositoryDetails = {
  githubRepositoryId: string;
  owner: string;
  name: string;
  url: string;
  visibility: RepositoryVisibility;
  defaultBranch: string;
};

export type GitHubRepositoryErrorCode =
  | "token_required"
  | "invalid_token"
  | "access_denied"
  | "not_found"
  | "unavailable";

export class GitHubRepositoryError extends Error {
  constructor(readonly code: GitHubRepositoryErrorCode) {
    super(code);
    this.name = "GitHubRepositoryError";
  }
}

function githubHeaders(token?: string) {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "TEK-DOK-MIND",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function githubRequest(path: string, token?: string) {
  try {
    return await fetch(`https://api.github.com${path}`, {
      headers: githubHeaders(token),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GitHubRepositoryError("unavailable");
  }
}

async function readRepositoryResponse(response: Response) {
  if (!response.ok) {
    return null;
  }

  const result = githubRepositorySchema.safeParse(
    await response.json().catch(() => null),
  );

  if (!result.success) {
    throw new GitHubRepositoryError("unavailable");
  }

  return result.data;
}

function mapAuthenticatedFailure(status: number): never {
  if (status === 401) {
    throw new GitHubRepositoryError("invalid_token");
  }

  if (status === 403) {
    throw new GitHubRepositoryError("access_denied");
  }

  if (status === 404) {
    throw new GitHubRepositoryError("not_found");
  }

  throw new GitHubRepositoryError("unavailable");
}

async function validatePrivateContentsAccess(
  owner: string,
  name: string,
  token: string,
  repositorySize: number,
) {
  const response = await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents`,
    token,
  );

  if (response.ok || (response.status === 404 && repositorySize === 0)) {
    return;
  }

  mapAuthenticatedFailure(response.status);
}

function mapRepository(
  repository: z.infer<typeof githubRepositorySchema>,
): GitHubRepositoryDetails {
  return {
    githubRepositoryId: String(repository.id),
    owner: repository.owner.login,
    name: repository.name,
    url: repository.html_url,
    visibility: repository.private ? "private" : "public",
    defaultBranch: repository.default_branch,
  };
}

export async function inspectGitHubRepository(
  repositoryUrl: string,
  accessToken?: string,
): Promise<GitHubRepositoryDetails> {
  const parsed = parseGitHubRepositoryUrl(repositoryUrl);
  const path = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}`;
  const publicResponse = await githubRequest(path);
  const publicRepository = await readRepositoryResponse(publicResponse);

  if (publicRepository) {
    return mapRepository(publicRepository);
  }

  if (publicResponse.status !== 404) {
    throw new GitHubRepositoryError("unavailable");
  }

  if (!accessToken) {
    throw new GitHubRepositoryError("token_required");
  }

  const privateResponse = await githubRequest(path, accessToken);
  const privateRepository = await readRepositoryResponse(privateResponse);

  if (!privateRepository) {
    mapAuthenticatedFailure(privateResponse.status);
  }

  if (privateRepository && privateRepository.private) {
    await validatePrivateContentsAccess(
      privateRepository.owner.login,
      privateRepository.name,
      accessToken,
      privateRepository.size,
    );
  }

  return mapRepository(privateRepository);
}

export async function listGitHubRepositoryBranches(input: {
  owner: string;
  name: string;
  accessToken?: string;
}): Promise<string[]> {
  const branches: string[] = [];
  const encodedOwner = encodeURIComponent(input.owner);
  const encodedName = encodeURIComponent(input.name);

  for (let page = 1; page <= 100; page += 1) {
    const response = await githubRequest(
      `/repos/${encodedOwner}/${encodedName}/branches?per_page=100&page=${page}`,
      input.accessToken,
    );

    if (!response.ok) {
      mapAuthenticatedFailure(response.status);
    }

    const result = githubBranchesSchema.safeParse(
      await response.json().catch(() => null),
    );

    if (!result.success) {
      throw new GitHubRepositoryError("unavailable");
    }

    branches.push(...result.data.map((branch) => branch.name));

    if (result.data.length < 100) {
      return branches;
    }
  }

  throw new GitHubRepositoryError("unavailable");
}

export async function listGitHubRepositoryContents(input: {
  owner: string;
  name: string;
  branch: string;
  path: string;
  accessToken?: string;
}): Promise<RepositoryContentEntry[]> {
  const encodedOwner = encodeURIComponent(input.owner);
  const encodedName = encodeURIComponent(input.name);
  const encodedPath = input.path
    ? `/${input.path.split("/").map(encodeURIComponent).join("/")}`
    : "";
  const response = await githubRequest(
    `/repos/${encodedOwner}/${encodedName}/contents${encodedPath}?ref=${encodeURIComponent(input.branch)}`,
    input.accessToken,
  );

  if (!response.ok) {
    mapAuthenticatedFailure(response.status);
  }

  const result = githubContentEntriesSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!result.success) {
    throw new GitHubRepositoryError("unavailable");
  }

  return result.data
    .filter(
      (entry): entry is typeof entry & { type: "file" | "dir" } =>
        entry.type === "file" || entry.type === "dir",
    )
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type === "dir" ? ("directory" as const) : ("file" as const),
      size: entry.size,
    }))
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "directory" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
}
