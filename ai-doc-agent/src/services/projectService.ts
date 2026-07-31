import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { callSupabaseRpc } from "@/lib/supabase/server";
import type {
  CreateProjectResult,
  ProjectSession,
  ProjectSummary,
} from "@/types/project";

type CreateProjectRow = {
  created_at: string;
  updated_at: string;
};

type AccessProjectRow = CreateProjectRow & {
  project_name: string;
  project_description: string;
  expires_at: string;
};

export function hashOpaqueToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function generateProjectId() {
  const token = randomBytes(8).toString("hex").toUpperCase();
  return `PRJ-${token.match(/.{1,4}/g)?.join("-") ?? token}`;
}

export async function createProject(input: {
  name: string;
  description: string;
  password: string;
}): Promise<CreateProjectResult> {
  const projectId = generateProjectId();
  const rows = await callSupabaseRpc<CreateProjectRow[]>("create_project", {
    p_name: input.name,
    p_description: input.description,
    p_password: input.password,
    p_project_key_hash: hashOpaqueToken(projectId),
  });
  const project = rows[0];

  if (!project) {
    throw new Error("Project creation returned no data.");
  }

  return {
    projectId,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
  };
}

export async function accessProject(input: {
  projectId: string;
  password: string;
}): Promise<ProjectSession | null> {
  const sessionToken = randomBytes(32).toString("base64url");
  const rows = await callSupabaseRpc<AccessProjectRow[]>(
    "create_project_session",
    {
    p_project_key_hash: hashOpaqueToken(input.projectId.toUpperCase()),
    p_password: input.password,
      p_session_token_hash: hashOpaqueToken(sessionToken),
    },
  );
  const project = rows[0];

  if (!project) {
    return null;
  }

  return {
    sessionToken,
    expiresAt: project.expires_at,
    project: {
      name: project.project_name,
      description: project.project_description,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    },
  };
}

export async function getProjectWorkspace(
  sessionToken: string,
): Promise<ProjectSummary | null> {
  const rows = await callSupabaseRpc<AccessProjectRow[]>(
    "get_project_workspace",
    {
      p_session_token_hash: hashOpaqueToken(sessionToken),
    },
  );
  const project = rows[0];

  return project
    ? {
        name: project.project_name,
        description: project.project_description,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
      }
    : null;
}

export async function revokeProjectSession(sessionToken: string) {
  await callSupabaseRpc("revoke_project_session", {
    p_session_token_hash: hashOpaqueToken(sessionToken),
  });
}

export async function deleteProject(input: {
  sessionToken: string;
  projectName: string;
}): Promise<boolean> {
  return callSupabaseRpc<boolean>("delete_project", {
    p_session_token_hash: hashOpaqueToken(input.sessionToken),
    p_project_name: input.projectName,
  });
}
