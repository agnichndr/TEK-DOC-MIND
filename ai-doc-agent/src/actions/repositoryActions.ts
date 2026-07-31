"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { PROJECT_SESSION_COOKIE } from "@/lib/projectSession";
import {
  GitHubRepositoryError,
  type GitHubRepositoryErrorCode,
} from "@/services/githubService";
import { getProjectWorkspace } from "@/services/projectService";
import {
  DuplicateRepositoryError,
  addProjectRepository,
  deleteProjectRepository,
  listProjectRepositoryContents,
  listProjectRepositoryBranches,
  updateProjectRepository,
} from "@/services/repositoryService";
import {
  addRepositorySchema,
  type AddRepositoryActionState,
  deleteRepositorySchema,
  type DeleteRepositoryActionState,
  listRepositoryBranchesSchema,
  type ListRepositoryBranchesActionResult,
  listRepositoryContentsSchema,
  type ListRepositoryContentsActionResult,
  updateRepositorySchema,
  type UpdateRepositoryActionResult,
} from "@/types/repository";

function formValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function fieldErrors(
  errors: Record<string, string[] | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(errors)
      .filter((entry): entry is [string, string[]] => Boolean(entry[1]?.[0]))
      .map(([key, messages]) => [key, messages[0]]),
  );
}

function githubErrorMessage(code: GitHubRepositoryErrorCode) {
  switch (code) {
    case "invalid_token":
      return "GitHub rejected this token. Check the token and try again.";
    case "access_denied":
      return "The token cannot read this repository. Grant Contents read access to this repository.";
    case "not_found":
      return "GitHub could not find this repository, or the token does not have access.";
    case "unavailable":
      return "GitHub could not be reached right now. Please try again.";
    default:
      return "A GitHub access token is required for this private repository.";
  }
}

export async function addRepositoryAction(
  _previousState: AddRepositoryActionState,
  formData: FormData,
): Promise<AddRepositoryActionState> {
  const rawValues = {
    url: formValue(formData, "url"),
    purpose: formValue(formData, "purpose"),
    accessToken: formValue(formData, "accessToken"),
  };
  const values = {
    url: rawValues.url,
    purpose: rawValues.purpose,
  };
  const result = addRepositorySchema.safeParse(rawValues);

  if (!result.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fields: fieldErrors(result.error.flatten().fieldErrors),
      values,
      showToken: Boolean(rawValues.accessToken),
    };
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(PROJECT_SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return {
      status: "error",
      message: "Your project session has expired. Access the project again.",
      values,
    };
  }

  try {
    if (!(await getProjectWorkspace(sessionToken))) {
      return {
        status: "error",
        message: "Your project session has expired. Access the project again.",
        values,
      };
    }

    const repository = await addProjectRepository({
      sessionToken,
      url: result.data.url,
      purpose: result.data.purpose,
      accessToken: result.data.accessToken || undefined,
    });
    revalidatePath("/project");

    return {
      status: "success",
      message: "Repository connected successfully.",
      repository,
    };
  } catch (error) {
    if (
      error instanceof GitHubRepositoryError &&
      error.code === "token_required"
    ) {
      return {
        status: "token_required",
        message: githubErrorMessage(error.code),
        values,
      };
    }

    if (error instanceof GitHubRepositoryError) {
      return {
        status: "error",
        message: githubErrorMessage(error.code),
        values,
        showToken: Boolean(rawValues.accessToken),
      };
    }

    if (error instanceof DuplicateRepositoryError) {
      return {
        status: "error",
        message: "This repository is already connected to the project.",
        values,
      };
    }

    console.error("Repository connection failed", error);
    return {
      status: "error",
      message: "We could not connect this repository. Please try again.",
      values,
    };
  }
}

export async function deleteRepositoryAction(
  _previousState: DeleteRepositoryActionState,
  formData: FormData,
): Promise<DeleteRepositoryActionState> {
  const result = deleteRepositorySchema.safeParse({
    repositoryId: formValue(formData, "repositoryId"),
    repositoryName: formValue(formData, "repositoryName"),
    confirmation: formValue(formData, "confirmation"),
  });

  if (!result.success) {
    return { status: "error", message: "Enter the repository name exactly." };
  }

  if (result.data.confirmation !== result.data.repositoryName) {
    return { status: "error", message: "The repository name does not match." };
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(PROJECT_SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return { status: "error", message: "Your project session has expired." };
  }

  try {
    const deleted = await deleteProjectRepository({
      sessionToken,
      repositoryId: result.data.repositoryId,
      repositoryName: result.data.repositoryName,
    });

    if (!deleted) {
      return {
        status: "error",
        message:
          "Repository not found, the name did not match, or a repository group still uses it.",
      };
    }

    revalidatePath("/project");
    return { status: "success", repositoryId: result.data.repositoryId };
  } catch (error) {
    console.error("Repository deletion failed", error);
    return {
      status: "error",
      message: "We could not delete this repository. Please try again.",
    };
  }
}

export async function updateRepositoryAction(
  input: unknown,
): Promise<UpdateRepositoryActionResult> {
  const result = updateRepositorySchema.safeParse(input);
  if (!result.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fields: fieldErrors(result.error.flatten().fieldErrors),
    };
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(PROJECT_SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return { status: "error", message: "Your project session has expired." };
  }

  try {
    const repository = await updateProjectRepository({
      sessionToken,
      repositoryId: result.data.repositoryId,
      purpose: result.data.purpose,
    });
    if (!repository) {
      return {
        status: "error",
        message: "This repository is not available in the active project.",
      };
    }

    revalidatePath("/project");
    return { status: "success", repository };
  } catch (error) {
    console.error("Repository update failed", error);
    return {
      status: "error",
      message: "We could not update this repository. Please try again.",
    };
  }
}

export async function listRepositoryBranchesAction(
  repositoryId: string,
): Promise<ListRepositoryBranchesActionResult> {
  const result = listRepositoryBranchesSchema.safeParse({ repositoryId });

  if (!result.success) {
    return { status: "error", message: "Invalid repository." };
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(PROJECT_SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return { status: "error", message: "Your project session has expired." };
  }

  try {
    const branches = await listProjectRepositoryBranches({
      sessionToken,
      repositoryId: result.data.repositoryId,
    });

    if (!branches) {
      return {
        status: "error",
        message: "This repository is not available in the active project.",
      };
    }

    return { status: "success", branches };
  } catch (error) {
    if (error instanceof GitHubRepositoryError) {
      return {
        status: "error",
        message:
          error.code === "access_denied" || error.code === "invalid_token"
            ? "GitHub access has expired or no longer includes this repository."
            : "GitHub branches could not be loaded. Please try again.",
      };
    }

    console.error("Repository branch listing failed", error);
    return {
      status: "error",
      message: "Branches could not be loaded. Please try again.",
    };
  }
}

export async function listRepositoryContentsAction(
  input: unknown,
): Promise<ListRepositoryContentsActionResult> {
  const result = listRepositoryContentsSchema.safeParse(input);
  if (!result.success) {
    return { status: "error", message: "Invalid repository location." };
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(PROJECT_SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return { status: "error", message: "Your project session has expired." };
  }

  try {
    const entries = await listProjectRepositoryContents({
      sessionToken,
      ...result.data,
    });
    if (!entries) {
      return {
        status: "error",
        message: "This repository is not available in the active project.",
      };
    }
    return { status: "success", entries };
  } catch (error) {
    if (error instanceof GitHubRepositoryError) {
      return {
        status: "error",
        message:
          error.code === "access_denied" || error.code === "invalid_token"
            ? "GitHub access has expired or no longer includes this repository."
            : "GitHub could not load this folder for the selected branch.",
      };
    }
    console.error("Repository content listing failed", error);
    return {
      status: "error",
      message: "Repository contents could not be loaded. Please try again.",
    };
  }
}
