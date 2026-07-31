"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { PROJECT_SESSION_COOKIE } from "@/lib/projectSession";
import {
  deleteProjectAgent,
  saveProjectAgent,
} from "@/services/agentService";
import {
  deleteProjectAgentSchema,
  projectAgentInputSchema,
  type ProjectAgent,
  type ProjectAgentActionResult,
  type ProjectAgentInput,
} from "@/types/agent";

async function sessionToken() {
  return (await cookies()).get(PROJECT_SESSION_COOKIE)?.value;
}

export async function saveProjectAgentAction(
  input: ProjectAgentInput,
): Promise<ProjectAgentActionResult<ProjectAgent>> {
  const parsed = projectAgentInputSchema.safeParse(input);
  if (!parsed.success) {
    const fields = Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors)
        .filter((entry): entry is [string, string[]] => Boolean(entry[1]?.[0]))
        .map(([field, messages]) => [field, messages[0]]),
    );
    return {
      status: "error",
      message: "Check the agent details.",
      fields,
    };
  }

  const token = await sessionToken();
  if (!token) {
    return { status: "error", message: "Your project session expired." };
  }

  try {
    const resource = await saveProjectAgent({
      ...parsed.data,
      sessionToken: token,
    });
    revalidatePath("/project");
    return { status: "success", resource };
  } catch (error) {
    console.error("Project agent save failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      status: "error",
      message:
        "The agent could not be saved. Use a unique name and a connector from this project.",
    };
  }
}

export async function deleteProjectAgentAction(
  id: string,
): Promise<ProjectAgentActionResult<{ id: string }>> {
  const parsed = deleteProjectAgentSchema.safeParse({ id });
  if (!parsed.success) {
    return { status: "error", message: "Invalid agent." };
  }

  const token = await sessionToken();
  if (!token) {
    return { status: "error", message: "Your project session expired." };
  }

  try {
    const deleted = await deleteProjectAgent({
      sessionToken: token,
      id: parsed.data.id,
    });
    if (!deleted) {
      return { status: "error", message: "This agent no longer exists." };
    }
    revalidatePath("/project");
    return { status: "success", resource: { id: parsed.data.id } };
  } catch (error) {
    console.error("Project agent deletion failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { status: "error", message: "The agent could not be deleted." };
  }
}
