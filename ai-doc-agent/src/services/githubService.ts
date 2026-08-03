import "server-only";

import { z } from "zod";

import { parseGitHubRepositoryUrl } from "@/lib/githubUrl";
import type {
  RepositoryContentEntry,
  RepositoryVisibility,
} from "@/types/repository";

const GITHUB_API_VERSION = "2026-03-10";
const REQUEST_TIMEOUT_MS = 10_000;
const ANALYSIS_REQUEST_TIMEOUT_MS = 20_000;
const MAX_SCOPED_FILES = 5_000;
const MAX_SCOPED_DIRECTORIES = 1_000;
const MAX_ANALYZED_FILES = 140;
const MAX_ANALYZED_FILE_BYTES = 256_000;
const MAX_ANALYZED_REPOSITORY_BYTES = 1_200_000;

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

const githubAnalysisContentEntrySchema = z.object({
  name: z.string().min(1).max(255),
  path: z.string().min(1).max(1024),
  type: z.enum(["file", "dir", "symlink", "submodule"]),
  size: z.number().int().nonnegative().optional().default(0),
});

const githubAnalysisContentSchema = z.union([
  z.array(githubAnalysisContentEntrySchema),
  githubAnalysisContentEntrySchema,
]);

export type GitHubRepositoryDetails = {
  githubRepositoryId: string;
  owner: string;
  name: string;
  url: string;
  visibility: RepositoryVisibility;
  defaultBranch: string;
};

export type GitHubScopedRepositoryAnalysis = {
  repository: string;
  branch: string;
  selectedPaths: string[];
  logicalContext: string;
  files: Array<{ path: string; size: number }>;
  analyzedFiles: Array<{ path: string; size: number; content: string }>;
  truncated: boolean;
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

function githubHeaders(token?: string, accept = "application/vnd.github+json") {
  return {
    Accept: accept,
    "User-Agent": "TEK-DOK-MIND",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function githubRequest(
  path: string,
  token?: string,
  options: { accept?: string; timeoutMs?: number } = {},
) {
  try {
    return await fetch(`https://api.github.com${path}`, {
      headers: githubHeaders(token, options.accept),
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new GitHubRepositoryError("unavailable");
  }
}

function analysisPriority(path: string) {
  const normalized = path.toLowerCase();
  const name = normalized.split("/").at(-1) ?? normalized;
  let score = 0;
  if (/^(readme|architecture|design|agents)(\.|$)/.test(name)) score += 100;
  if (
    /^(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|cargo\.toml|go\.mod|pyproject\.toml|requirements.*\.txt|pom\.xml|build\.gradle|dockerfile|docker-compose.*|.*\.sln|.*\.csproj)$/i.test(
      name,
    )
  ) {
    score += 90;
  }
  if (/\/(src|app|lib|services|domain|core|api|server|client)\//.test(`/${normalized}`)) {
    score += 45;
  }
  if (/\.(md|mdx|json|ya?ml|toml|xml|csproj|sln)$/i.test(name)) score += 25;
  if (/\.(ts|tsx|js|jsx|cs|cpp|cc|cxx|c|h|hpp|java|kt|go|rs|py|rb|php|swift)$/i.test(name)) {
    score += 20;
  }
  if (/(^|\/)(test|tests|__tests__|spec|fixtures)(\/|$)/.test(normalized)) score -= 15;
  if (/(^|\/)(node_modules|vendor|dist|build|bin|obj|coverage|\.next|third_party)(\/|$)/.test(normalized)) {
    score -= 200;
  }
  return score;
}

function canReadAsText(path: string, size: number) {
  if (size > MAX_ANALYZED_FILE_BYTES) return false;
  const name = path.toLowerCase().split("/").at(-1) ?? path.toLowerCase();
  return (
    /^(dockerfile|makefile|procfile|gemfile|rakefile|go\.mod|go\.sum)$/i.test(name) ||
    /\.(md|mdx|txt|json|jsonc|ya?ml|toml|ini|conf|config|xml|csv|sql|graphql|gql|proto|env\.example|ts|tsx|js|jsx|mjs|cjs|css|scss|less|html|vue|svelte|cs|csproj|sln|cpp|cc|cxx|c|h|hpp|java|kt|kts|go|rs|py|rb|php|swift|sh|bash|zsh|ps1)$/i.test(
      name,
    )
  );
}

function normalizeSelectedPaths(paths: Array<{ path: string; type: "file" | "directory" }>) {
  if (paths.some((item) => item.path === "")) {
    return [{ path: "", type: "directory" as const }];
  }
  return paths.filter(
    (candidate, index) =>
      !paths.some(
        (parent, parentIndex) =>
          parentIndex !== index &&
          parent.type === "directory" &&
          candidate.path.startsWith(`${parent.path}/`),
      ),
  );
}

function githubContentsPath(owner: string, name: string, path: string, branch: string) {
  const encodedPath = path
    ? `/${path.split("/").map(encodeURIComponent).join("/")}`
    : "";
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents${encodedPath}?ref=${encodeURIComponent(branch)}`;
}

async function readAnalysisEntry(input: {
  owner: string;
  name: string;
  branch: string;
  path: string;
  accessToken?: string;
}) {
  const response = await githubRequest(
    githubContentsPath(input.owner, input.name, input.path, input.branch),
    input.accessToken,
    { timeoutMs: ANALYSIS_REQUEST_TIMEOUT_MS },
  );
  if (!response.ok) mapAuthenticatedFailure(response.status);
  const parsed = githubAnalysisContentSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success) throw new GitHubRepositoryError("unavailable");
  return Array.isArray(parsed.data) ? parsed.data : [parsed.data];
}

async function readAnalysisFile(input: {
  owner: string;
  name: string;
  branch: string;
  path: string;
  accessToken?: string;
}) {
  const response = await githubRequest(
    githubContentsPath(input.owner, input.name, input.path, input.branch),
    input.accessToken,
    {
      accept: "application/vnd.github.raw+json",
      timeoutMs: ANALYSIS_REQUEST_TIMEOUT_MS,
    },
  );
  if (!response.ok) mapAuthenticatedFailure(response.status);
  const content = await response.text();
  return content.includes("\0") ? "" : content;
}

export async function analyzeGitHubRepositoryScope(input: {
  owner: string;
  name: string;
  branch: string;
  selectedPaths: Array<{ path: string; type: "file" | "directory" }>;
  logicalContext: string;
  accessToken?: string;
}): Promise<GitHubScopedRepositoryAnalysis> {
  const selected = normalizeSelectedPaths(input.selectedPaths);
  const directories = selected
    .filter((item) => item.type === "directory")
    .map((item) => item.path);
  const explicitFiles = selected
    .filter((item) => item.type === "file")
    .map((item) => item.path);
  const files = new Map<string, number>();
  const visitedDirectories = new Set<string>();
  let truncated = false;

  for (const path of explicitFiles) {
    const entries = await readAnalysisEntry({ ...input, path });
    const file = entries.find((entry) => entry.type === "file" && entry.path === path);
    if (file) files.set(file.path, file.size);
  }

  while (directories.length) {
    const path = directories.shift() ?? "";
    if (visitedDirectories.has(path)) continue;
    if (visitedDirectories.size >= MAX_SCOPED_DIRECTORIES) {
      truncated = true;
      break;
    }
    visitedDirectories.add(path);
    const entries = await readAnalysisEntry({ ...input, path });
    for (const entry of entries) {
      if (entry.type === "dir") {
        directories.push(entry.path);
      } else if (entry.type === "file") {
        files.set(entry.path, entry.size);
        if (files.size >= MAX_SCOPED_FILES) {
          truncated = true;
          directories.length = 0;
          break;
        }
      }
    }
  }

  const candidates = [...files]
    .filter(([path, size]) => canReadAsText(path, size))
    .sort(([leftPath], [rightPath]) => {
      const priority = analysisPriority(rightPath) - analysisPriority(leftPath);
      return priority || leftPath.localeCompare(rightPath);
    })
    .slice(0, MAX_ANALYZED_FILES);
  const analyzedFiles: GitHubScopedRepositoryAnalysis["analyzedFiles"] = [];
  let analyzedBytes = 0;

  for (let index = 0; index < candidates.length; index += 6) {
    const batch = candidates.slice(index, index + 6).filter(([, size]) => {
      if (analyzedBytes + size > MAX_ANALYZED_REPOSITORY_BYTES) {
        truncated = true;
        return false;
      }
      analyzedBytes += size;
      return true;
    });
    const contents = await Promise.all(
      batch.map(async ([path, size]) => ({
        path,
        size,
        content: await readAnalysisFile({ ...input, path }),
      })),
    );
    analyzedFiles.push(...contents.filter((file) => file.content));
  }

  if (candidates.length < [...files].filter(([path, size]) => canReadAsText(path, size)).length) {
    truncated = true;
  }

  return {
    repository: `${input.owner}/${input.name}`,
    branch: input.branch,
    selectedPaths: selected.map((item) => item.path),
    logicalContext: input.logicalContext,
    files: [...files].map(([path, size]) => ({ path, size })),
    analyzedFiles,
    truncated,
  };
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
