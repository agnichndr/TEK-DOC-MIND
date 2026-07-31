"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getServerEnv } from "@/lib/env";
import {
  PROJECT_SESSION_COOKIE,
  PROJECT_SESSION_MAX_AGE_SECONDS,
} from "@/lib/projectSession";
import {
  accessProject,
  createProject,
  deleteProject,
} from "@/services/projectService";
import { revokeProjectSession } from "@/services/projectService";
import {
  accessProjectSchema,
  createProjectSchema,
  deleteProjectSchema,
  type CreateProjectActionState,
  type DeleteProjectActionState,
  type ProjectActionState,
} from "@/types/project";

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

export async function createProjectAction(
  _previousState: CreateProjectActionState,
  formData: FormData,
): Promise<CreateProjectActionState> {
  const result = createProjectSchema.safeParse({
    name: formValue(formData, "name"),
    description: formValue(formData, "description"),
    password: formValue(formData, "password"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fields: fieldErrors(result.error.flatten().fieldErrors),
    };
  }

  try {
    return { status: "success", result: await createProject(result.data) };
  } catch (error) {
    console.error("Project creation failed", error);
    return {
      status: "error",
      message: "We could not create the project. Please try again.",
    };
  }
}

export async function accessProjectAction(
  _previousState: ProjectActionState,
  formData: FormData,
): Promise<ProjectActionState> {
  const result = accessProjectSchema.safeParse({
    projectId: formValue(formData, "projectId").toUpperCase(),
    password: formValue(formData, "password"),
  });

  if (!result.success) {
    return {
      status: "error",
      message: "Please correct the highlighted fields.",
      fields: fieldErrors(result.error.flatten().fieldErrors),
    };
  }

  try {
    const session = await accessProject(result.data);

    if (!session) {
      return {
        status: "error",
        message: "The project ID or password is incorrect.",
      };
    }

    const cookieStore = await cookies();
    cookieStore.set(PROJECT_SESSION_COOKIE, session.sessionToken, {
      httpOnly: true,
      secure: getServerEnv().NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: PROJECT_SESSION_MAX_AGE_SECONDS,
    });

    return { status: "success", project: session.project };
  } catch (error) {
    console.error("Project access failed", error);
    return {
      status: "error",
      message: "We could not access the project. Please try again.",
    };
  }
}

export async function logoutProjectAction() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(PROJECT_SESSION_COOKIE)?.value;

  if (sessionToken) {
    try {
      await revokeProjectSession(sessionToken);
    } catch (error) {
      console.error("Project session revocation failed", error);
    }
  }

  cookieStore.delete(PROJECT_SESSION_COOKIE);
  redirect("/");
}

export async function deleteProjectAction(
  _previousState: DeleteProjectActionState,
  formData: FormData,
): Promise<DeleteProjectActionState> {
  const result = deleteProjectSchema.safeParse({
    projectName: formValue(formData, "projectName"),
    confirmation: formValue(formData, "confirmation"),
  });

  if (!result.success || result.data.confirmation !== result.data.projectName) {
    return { status: "error", message: "Enter the project name exactly." };
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(PROJECT_SESSION_COOKIE)?.value;

  if (!sessionToken) {
    return { status: "error", message: "Your project session has expired." };
  }

  try {
    const deleted = await deleteProject({
      sessionToken,
      projectName: result.data.projectName,
    });

    if (!deleted) {
      return {
        status: "error",
        message: "Project not found or the confirmation name did not match.",
      };
    }
  } catch (error) {
    console.error("Project deletion failed", error);
    return {
      status: "error",
      message: "We could not delete this project. Please try again.",
    };
  }

  cookieStore.delete(PROJECT_SESSION_COOKIE);
  redirect("/");
}
