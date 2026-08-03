"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";

import { PROJECT_SESSION_COOKIE } from "@/lib/projectSession";
import {
  createProjectDocumentAction,
  listProjectDocumentActionsPage,
} from "@/services/projectActionService";
import { executeRepositoryAnalysis } from "@/services/repositoryAnalyzerService";
import {
  createProjectDocumentActionInputSchema,
  projectDocumentActionPageQuerySchema,
  type CreateProjectDocumentActionInput,
  type ProjectDocumentAction,
  type ProjectDocumentActionPage,
  type ProjectDocumentActionPageQuery,
  type ProjectDocumentActionResult,
} from "@/types/projectAction";

export async function listProjectDocumentActionsAction(
  input: ProjectDocumentActionPageQuery,
): Promise<ProjectDocumentActionResult<ProjectDocumentActionPage>> {
  const parsed = projectDocumentActionPageQuerySchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "The action list request is invalid." };
  }

  const sessionToken = (await cookies()).get(PROJECT_SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return { status: "error", message: "Your project session expired." };
  }

  try {
    const resource = await listProjectDocumentActionsPage(
      sessionToken,
      parsed.data,
    );
    return { status: "success", resource };
  } catch (error) {
    console.error("Project document action listing failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { status: "error", message: "The action list could not be loaded." };
  }
}

export async function createProjectDocumentActionAction(
  input: CreateProjectDocumentActionInput,
): Promise<ProjectDocumentActionResult<ProjectDocumentAction>> {
  const parsed = createProjectDocumentActionInputSchema.safeParse(input);
  if (!parsed.success) {
    const fields = Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors)
        .filter((entry): entry is [string, string[]] => Boolean(entry[1]?.[0]))
        .map(([field, messages]) => [field, messages[0]]),
    );
    return {
      status: "error",
      message: "Choose a repository group and pipeline.",
      fields,
    };
  }

  const sessionToken = (await cookies()).get(PROJECT_SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return { status: "error", message: "Your project session expired." };
  }

  try {
    const resource = await createProjectDocumentAction({
      ...parsed.data,
      sessionToken,
    });
    after(async () => {
      await executeRepositoryAnalysis({
        sessionToken,
        actionId: resource.id,
      });
    });
    revalidatePath("/project");
    return { status: "success", resource };
  } catch (error) {
    console.error("Project document action creation failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      status: "error",
      message:
        "The action could not be created. Check that the repository group and pipeline are still available.",
    };
  }
}
