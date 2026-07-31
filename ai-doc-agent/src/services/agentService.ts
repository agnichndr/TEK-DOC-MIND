import "server-only";

import { randomUUID } from "node:crypto";

import { callSupabaseRpc } from "@/lib/supabase/server";
import { hashOpaqueToken } from "@/services/projectService";
import {
  projectAgentInputSchema,
  type ProjectAgent,
  type ProjectAgentInput,
} from "@/types/agent";

type ProjectAgentRow = {
  id: string;
  name: string;
  description: string;
  connector: string;
  model: string;
  output_mode: string;
  output_type: string;
  skills_markdown: string;
  created_at: string;
  updated_at: string;
};

function mapProjectAgent(row: ProjectAgentRow): ProjectAgent {
  const parsed = projectAgentInputSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    connector: row.connector,
    model: row.model,
    outputMode: row.output_mode,
    outputType: row.output_type,
    skillsMarkdown: row.skills_markdown,
  });

  return {
    ...parsed,
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProjectAgents(
  sessionToken: string,
): Promise<ProjectAgent[]> {
  const rows = await callSupabaseRpc<ProjectAgentRow[]>(
    "list_project_agents",
    { p_session_token_hash: hashOpaqueToken(sessionToken) },
  );
  return rows.map(mapProjectAgent);
}

export async function saveProjectAgent(
  input: ProjectAgentInput & { sessionToken: string },
): Promise<ProjectAgent> {
  const rows = await callSupabaseRpc<ProjectAgentRow[]>(
    "save_project_agent",
    {
      p_session_token_hash: hashOpaqueToken(input.sessionToken),
      p_agent_id: input.id ?? randomUUID(),
      p_name: input.name,
      p_description: input.description,
      p_connector: input.connector,
      p_model: input.model,
      p_output_mode: input.outputMode,
      p_output_type: input.outputType,
      p_skills_markdown: input.skillsMarkdown,
    },
  );
  if (!rows[0]) throw new Error("Agent save returned no data.");
  return mapProjectAgent(rows[0]);
}

export async function deleteProjectAgent(input: {
  sessionToken: string;
  id: string;
}): Promise<boolean> {
  return callSupabaseRpc<boolean>("delete_project_agent", {
    p_session_token_hash: hashOpaqueToken(input.sessionToken),
    p_agent_id: input.id,
  });
}
