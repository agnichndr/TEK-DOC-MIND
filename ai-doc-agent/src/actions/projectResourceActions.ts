"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { PROJECT_SESSION_COOKIE } from "@/lib/projectSession";
import {
  deleteProjectLlmConnector,
  deleteProjectRepositoryGroup,
  saveProjectRepositoryGroup,
} from "@/services/projectResourceService";
import {
  deleteProjectLlmConnectorSchema,
  deleteProjectRepositoryGroupSchema,
  projectRepositoryGroupInputSchema,
  type ProjectRepositoryGroup,
  type ProjectRepositoryGroupInput,
  type ProjectResourceActionResult,
} from "@/types/projectResource";
import type { LlmConnectorType } from "@/types/llmConnector";

async function sessionToken() {
  return (await cookies()).get(PROJECT_SESSION_COOKIE)?.value;
}

export async function saveProjectRepositoryGroupAction(
  input: ProjectRepositoryGroupInput,
): Promise<ProjectResourceActionResult<ProjectRepositoryGroup>> {
  const parsed = projectRepositoryGroupInputSchema.safeParse(input);
  if (!parsed.success) {
    const fields = Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors)
        .filter((entry): entry is [string, string[]] => Boolean(entry[1]?.[0]))
        .map(([field, messages]) => [field, messages[0]]),
    );
    return {
      status: "error",
      message: "Check the repository group details.",
      fields,
    };
  }

  const token = await sessionToken();
  if (!token) return { status: "error", message: "Your project session expired." };

  try {
    const resource = await saveProjectRepositoryGroup({
      ...parsed.data,
      sessionToken: token,
    });
    revalidatePath("/project");
    return { status: "success", resource };
  } catch (error) {
    console.error("Repository group save failed", error);
    return {
      status: "error",
      message:
        "The group could not be saved. Check that its repositories belong to this project and its name is unique.",
    };
  }
}

export async function deleteProjectRepositoryGroupAction(
  id: string,
): Promise<ProjectResourceActionResult<{ id: string }>> {
  const parsed = deleteProjectRepositoryGroupSchema.safeParse({ id });
  if (!parsed.success) return { status: "error", message: "Invalid group." };
  const token = await sessionToken();
  if (!token) return { status: "error", message: "Your project session expired." };

  try {
    const deleted = await deleteProjectRepositoryGroup({
      sessionToken: token,
      id: parsed.data.id,
    });
    if (!deleted) {
      return {
        status: "error",
        message: "This group no longer exists.",
      };
    }
    revalidatePath("/project");
    return { status: "success", resource: { id: parsed.data.id } };
  } catch (error) {
    console.error("Repository group deletion failed", error);
    return { status: "error", message: "The group could not be deleted." };
  }
}

export async function deleteProjectLlmConnectorAction(
  connector: LlmConnectorType,
): Promise<ProjectResourceActionResult<{ connector: LlmConnectorType }>> {
  const parsed = deleteProjectLlmConnectorSchema.safeParse({ connector });
  if (!parsed.success) return { status: "error", message: "Invalid connector." };
  const token = await sessionToken();
  if (!token) return { status: "error", message: "Your project session expired." };

  try {
    const deleted = await deleteProjectLlmConnector({
      sessionToken: token,
      connector: parsed.data.connector,
    });
    if (!deleted) {
      return {
        status: "error",
        message: "This connector no longer exists.",
      };
    }
    revalidatePath("/project");
    return {
      status: "success",
      resource: { connector: parsed.data.connector },
    };
  } catch (error) {
    console.error("LLM connector deletion failed", error);
    return { status: "error", message: "The connector could not be removed." };
  }
}
