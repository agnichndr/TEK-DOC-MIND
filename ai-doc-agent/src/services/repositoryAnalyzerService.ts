import "server-only";

import { REPO_ANALYZER_INSTRUCTIONS } from "@/agents/repoAnalyzerPrompt";
import { buildActionGlobalContextBlobName } from "@/lib/azureBlobPath";
import { analyzeGitHubRepositoryScope } from "@/services/githubService";
import { generateLlmText } from "@/services/llmGenerationService";
import {
  LlmConnectorVerificationError,
  verifyLlmModelAccess,
} from "@/services/llmConnectorService";
import { decryptLlmCredential } from "@/services/llmCredentialEncryptionService";
import {
  claimProjectActionRepositoryAnalysis,
  completeProjectActionRepositoryAnalysis,
  failProjectActionRepositoryAnalysis,
} from "@/services/projectActionService";
import {
  listProjectLlmConnectorRecords,
} from "@/services/projectResourceService";
import {
  getRepositoryAccessToken,
  listProjectRepositories,
} from "@/services/repositoryService";
import {
  deletePipelineBlob,
  uploadTextBlob,
} from "@/services/azureBlobService";
import { llmConnectorInputSchema } from "@/types/llmConnector";
import {
  projectActionGlobalContextSchema,
  repositoryAnalysisFindingSchema,
  type CodeLanguageShare,
  type ProjectActionGlobalContext,
  type RepositoryAnalysisFinding,
} from "@/types/projectAction";
import type { GitHubScopedRepositoryAnalysis } from "@/services/githubService";

const MAX_MODEL_CONTEXT_CHARACTERS = 450_000;

type RepositoryAnalysisStage =
  | "load_context"
  | "scan_repositories"
  | "load_connector"
  | "verify_model"
  | "invoke_model"
  | "validate_model_output"
  | "upload_global_context"
  | "persist_result";

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".c": "C",
  ".cc": "C++",
  ".cpp": "C++",
  ".cxx": "C++",
  ".h": "C/C++ Header",
  ".hh": "C++ Header",
  ".hpp": "C++ Header",
  ".cs": "C#",
  ".fs": "F#",
  ".vb": "Visual Basic",
  ".java": "Java",
  ".kt": "Kotlin",
  ".kts": "Kotlin",
  ".go": "Go",
  ".rs": "Rust",
  ".py": "Python",
  ".rb": "Ruby",
  ".php": "PHP",
  ".swift": "Swift",
  ".m": "Objective-C",
  ".mm": "Objective-C++",
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".mjs": "JavaScript",
  ".cjs": "JavaScript",
  ".vue": "Vue",
  ".svelte": "Svelte",
  ".dart": "Dart",
  ".scala": "Scala",
  ".sh": "Shell",
  ".bash": "Shell",
  ".zsh": "Shell",
  ".ps1": "PowerShell",
  ".sql": "SQL",
  ".graphql": "GraphQL",
  ".gql": "GraphQL",
  ".proto": "Protocol Buffers",
  ".html": "HTML",
  ".htm": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".sass": "Sass",
  ".less": "Less",
  ".r": "R",
  ".lua": "Lua",
  ".ex": "Elixir",
  ".exs": "Elixir",
  ".erl": "Erlang",
  ".hrl": "Erlang",
  ".hs": "Haskell",
  ".clj": "Clojure",
  ".sol": "Solidity",
};

function fileExtension(path: string) {
  const name = path.toLowerCase().split("/").at(-1) ?? path.toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

function calculateCodeLanguageSharesForFiles(files: GitHubScopedRepositoryAnalysis["files"]): CodeLanguageShare[] {
  const bytesByLanguage = new Map<string, number>();
  for (const file of files) {
    const language = LANGUAGE_BY_EXTENSION[fileExtension(file.path)];
    if (!language) continue;
    bytesByLanguage.set(
      language,
      (bytesByLanguage.get(language) ?? 0) + file.size,
    );
  }
  const total = [...bytesByLanguage.values()].reduce(
    (sum, bytes) => sum + bytes,
    0,
  );
  if (!total) return [];
  const rows = [...bytesByLanguage]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([language, bytes]) => ({
      language,
      bytes,
      percentage: Number(((bytes / total) * 100).toFixed(2)),
    }));
  const roundedTotal = rows.reduce((sum, row) => sum + row.percentage, 0);
  if (rows[0] && roundedTotal !== 100) {
    rows[0].percentage = Number(
      (rows[0].percentage + (100 - roundedTotal)).toFixed(2),
    );
  }
  return rows;
}

export function calculateCodeLanguageShares(
  analyses: GitHubScopedRepositoryAnalysis[],
): CodeLanguageShare[] {
  return calculateCodeLanguageSharesForFiles(
    analyses.flatMap((analysis) => analysis.files),
  );
}

export function attachRepositoryCodeLanguages(
  finding: RepositoryAnalysisFinding,
  analyses: GitHubScopedRepositoryAnalysis[],
): RepositoryAnalysisFinding {
  const analysesByRepository = new Map(
    analyses.map((analysis) => [analysis.repository, analysis]),
  );
  return {
    ...finding,
    repositories: finding.repositories.map((repository) => {
      const analysis = analysesByRepository.get(repository.name);
      return {
        ...repository,
        codeLanguages: analysis
          ? calculateCodeLanguageSharesForFiles(analysis.files)
          : [],
      };
    }),
  };
}

function buildAnalyzerPrompt(analyses: GitHubScopedRepositoryAnalysis[]) {
  const introduction =
    "Analyze the following project-scoped repository material and return the required JSON object.";
  const sections: string[] = [introduction];
  const repositoryBudget = Math.max(
    2_000,
    Math.floor((MAX_MODEL_CONTEXT_CHARACTERS - introduction.length) / analyses.length),
  );
  for (const analysis of analyses) {
    const identity = [
      `\n## Repository: ${analysis.repository}`,
      `Branch: ${analysis.branch}`,
      `Selected paths: ${analysis.selectedPaths.map((path) => path || "<repository root>").join(", ")}`,
      `Logical context: ${analysis.logicalContext || "Not provided"}`,
      `Discovered files (${analysis.files.length}${analysis.truncated ? ", scan capped" : ""}):`,
    ].join("\n");
    const repositorySections = [identity];
    let repositoryCharacters = identity.length;
    for (const file of analysis.files) {
      const inventoryLine = `\n- ${file.path} (${file.size} bytes)`;
      if (
        repositoryCharacters + inventoryLine.length >
        Math.min(repositoryBudget / 3, 45_000)
      ) {
        repositorySections.push("\n- … inventory truncated for model context");
        break;
      }
      repositorySections.push(inventoryLine);
      repositoryCharacters += inventoryLine.length;
    }
    for (const file of analysis.analyzedFiles) {
      const block = `\n### File: ${analysis.repository}/${file.path}\n${file.content}\n`;
      if (repositoryCharacters + block.length > repositoryBudget) break;
      repositorySections.push(block);
      repositoryCharacters += block.length;
    }
    sections.push(repositorySections.join(""));
  }
  return sections.join("\n").slice(0, MAX_MODEL_CONTEXT_CHARACTERS);
}

function parseFinding(value: string): RepositoryAnalysisFinding {
  const withoutFence = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("The repository analyzer returned invalid JSON.");
  }
  return repositoryAnalysisFindingSchema.parse(
    JSON.parse(withoutFence.slice(start, end + 1)),
  );
}

function markdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function renderGlobalContextMarkdown(context: ProjectActionGlobalContext) {
  const repositoryRows = context.repositories
    .map(
      (repository) =>
        `| ${markdownCell(repository.name)} | ${markdownCell(repository.role)} | ${markdownCell(repository.summary)} |`,
    )
    .join("\n");
  const repositoryLanguageRows = context.repositories
    .map((repository) => {
      const languageSummary = repository.codeLanguages.length
        ? repository.codeLanguages
            .map(
              (language) =>
                `${language.language} (${language.bytes.toLocaleString("en-US")} bytes, ${language.percentage.toFixed(2)}%)`,
            )
            .join("; ")
        : "No recognized source files";
      return `| ${markdownCell(repository.name)} | ${markdownCell(languageSummary)} |`;
    })
    .join("\n");
  const moduleRows = context.importantModules.length
    ? context.importantModules
        .map(
          (module) =>
            `| ${markdownCell(module.name)} | ${markdownCell(module.repository)} | \`${module.path}\` | ${markdownCell(module.purpose)} |`,
        )
        .join("\n")
    : "| None identified | — | — | Insufficient evidence in the selected paths. |";
  const relationships = context.relationships.length
    ? context.relationships
        .map(
          (relationship) =>
            `- **${relationship.from} → ${relationship.to}:** ${relationship.relationship}` +
            (relationship.evidence.length
              ? ` Evidence: ${relationship.evidence.map((path) => `\`${path}\``).join(", ")}.`
              : ""),
        )
        .join("\n")
    : "- No evidence-backed cross-repository relationship was identified.";
  const patterns = context.designPatterns.length
    ? context.designPatterns.map((pattern) => `- ${pattern}`).join("\n")
    : "- No design pattern was asserted without supporting evidence.";
  const limitations = context.limitations.length
    ? context.limitations.map((limitation) => `- ${limitation}`).join("\n")
    : "- No material limitation beyond the selected repository paths.";

  return `# Global Repository Context

Generated: ${context.generatedAt}
Model: ${context.connector} / ${context.model}

## Overview

${context.overview}

## Intent

${context.intent}

## Repository Landscape

| Repository | Role | Summary |
| --- | --- | --- |
${repositoryRows}

## Architecture and Design Patterns

${context.architectureSummary}

${patterns}

## Important Modules

| Module | Repository | Path | Purpose |
| --- | --- | --- | --- |
${moduleRows}

## Repository Relationships

${relationships}

## Code Source Composition by Repository

Percentages are calculated deterministically from recognized source-code file bytes within each repository scope.

| Repository | Language Shares |
| --- | --- |
${repositoryLanguageRows}

## Analysis Coverage

- Repositories: ${context.coverage.repositoryCount}
- Files discovered: ${context.coverage.discoveredFileCount}
- Files read for architectural analysis: ${context.coverage.analyzedFileCount}
- Source bytes supplied for analysis: ${context.coverage.analyzedBytes}
- Scan truncated by safety limits: ${context.coverage.truncated ? "Yes" : "No"}

### Limitations

${limitations}
`;
}

async function analyzeInBatches<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency = 3,
) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    results.push(...(await Promise.all(items.slice(index, index + concurrency).map(worker))));
  }
  return results;
}

function repositoryAnalysisFailureMessage(error: unknown) {
  if (!(error instanceof LlmConnectorVerificationError)) {
    return "Repository analysis could not be completed. Check repository, connector, model, and Azure Storage access.";
  }
  switch (error.code) {
    case "model_unavailable":
      return "The pipeline default model is unavailable or does not support content generation. Choose a supported model, save the pipeline, and create a new action.";
    case "invalid_credentials":
    case "forbidden":
      return "The pipeline model credential could not access the selected model. Reconnect the provider and create a new action.";
    case "rate_limited":
      return "The pipeline model provider is rate-limited. Wait briefly and create a new action.";
    case "timeout":
    case "unavailable":
      return "The pipeline model provider is temporarily unavailable. Try creating a new action later.";
    default:
      return "The pipeline model connection could not be verified. Reconnect the provider, confirm the model, and create a new action.";
  }
}

export async function executeRepositoryAnalysis(input: {
  sessionToken: string;
  actionId: string;
}) {
  const context = await claimProjectActionRepositoryAnalysis(input);
  if (!context) return;

  let uploadedBlobName: string | null = null;
  let stage: RepositoryAnalysisStage = "load_context";
  try {
    const [repositories, connectorRecords] = await Promise.all([
      listProjectRepositories(input.sessionToken),
      listProjectLlmConnectorRecords(input.sessionToken),
    ]);
    const repositoriesById = new Map(
      repositories.map((repository) => [repository.id, repository]),
    );
    stage = "load_connector";
    const record = connectorRecords.find(
      (candidate) =>
        candidate.summary.connector === context.pipeline.defaultConnector,
    );
    if (!record?.encryptedCredential) {
      throw new Error("The pipeline connector credential is unavailable.");
    }
    const decrypted = decryptLlmCredential(
      record.encryptedCredential,
      context.pipeline.defaultConnector,
    );
    const connection = llmConnectorInputSchema.parse({
      ...decrypted,
      defaultModel: context.pipeline.defaultModel,
    });
    stage = "verify_model";
    await verifyLlmModelAccess(connection);
    const scopes = context.repositoryGroup.repositories;
    stage = "scan_repositories";
    const analyses = await analyzeInBatches(scopes, async (scope) => {
      const repository = repositoriesById.get(scope.repositoryId);
      if (!repository) throw new Error("A repository in the action snapshot is unavailable.");
      const accessToken = await getRepositoryAccessToken(
        input.sessionToken,
        repository.id,
      );
      return analyzeGitHubRepositoryScope({
        owner: repository.owner,
        name: repository.name,
        branch: scope.branch,
        selectedPaths: scope.selectedPaths,
        logicalContext: scope.logicalContext,
        accessToken: accessToken ?? undefined,
      });
    });
    stage = "invoke_model";
    const response = await generateLlmText({
      connection,
      system: REPO_ANALYZER_INSTRUCTIONS,
      prompt: buildAnalyzerPrompt(analyses),
    });
    stage = "validate_model_output";
    const finding = parseFinding(response);
    const enrichedFinding = attachRepositoryCodeLanguages(finding, analyses);
    const codeLanguages = calculateCodeLanguageShares(analyses);
    const globalContext = projectActionGlobalContextSchema.parse({
      ...enrichedFinding,
      codeLanguages,
      coverage: {
        repositoryCount: analyses.length,
        discoveredFileCount: analyses.reduce(
          (sum, analysis) => sum + analysis.files.length,
          0,
        ),
        analyzedFileCount: analyses.reduce(
          (sum, analysis) => sum + analysis.analyzedFiles.length,
          0,
        ),
        analyzedBytes: analyses.reduce(
          (sum, analysis) =>
            sum +
            analysis.analyzedFiles.reduce(
              (fileSum, file) => fileSum + Buffer.byteLength(file.content, "utf8"),
              0,
            ),
          0,
        ),
        truncated: analyses.some((analysis) => analysis.truncated),
      },
      generatedAt: new Date().toISOString(),
      connector: context.pipeline.defaultConnector,
      model: context.pipeline.defaultModel,
    });
    const blobName = buildActionGlobalContextBlobName({
      projectName: context.projectName,
      projectId: context.projectId,
      pipelineName: context.pipeline.name,
      pipelineId: context.pipeline.id,
      actionId: context.actionId,
      version: context.version,
    });
    stage = "upload_global_context";
    const blob = await uploadTextBlob({
      blobName,
      content: renderGlobalContextMarkdown(globalContext),
      contentType: "text/markdown; charset=utf-8",
    });
    uploadedBlobName = blobName;
    stage = "persist_result";
    const completed = await completeProjectActionRepositoryAnalysis({
      ...input,
      overview: globalContext.overview,
      codeLanguages,
      globalContext,
      blobName,
      mediaUrl: blob.mediaUrl,
    });
    if (!completed) {
      throw new Error("The action is no longer eligible for repository analysis.");
    }
    uploadedBlobName = null;
  } catch (error) {
    if (uploadedBlobName) {
      await deletePipelineBlob(uploadedBlobName).catch(() => undefined);
    }
    console.error("Project action repository analysis failed", {
      actionId: input.actionId,
      stage,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode:
        error instanceof LlmConnectorVerificationError
          ? error.code
          : undefined,
    });
    await failProjectActionRepositoryAnalysis({
      ...input,
      message: repositoryAnalysisFailureMessage(error),
    }).catch(() => undefined);
  }
}
