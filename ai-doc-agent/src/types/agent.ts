import { z } from "zod";

import { llmConnectorTypeSchema } from "@/types/llmConnector";

export const MAX_SKILLS_MARKDOWN_LENGTH = 200_000;

export const agentOutputModeSchema = z.enum(["single", "multiple"]);
export const agentOutputTypeSchema = z.enum([
  "text",
  "json",
  "html",
  "xml",
  "image",
]);

export const projectAgentInputSchema = z.object({
  id: z.uuid("Invalid agent.").optional(),
  name: z
    .string()
    .trim()
    .min(2, "Agent name must be at least 2 characters.")
    .max(120, "Agent name cannot exceed 120 characters."),
  description: z
    .string()
    .trim()
    .max(800, "Description cannot exceed 800 characters."),
  connector: llmConnectorTypeSchema,
  model: z
    .string()
    .trim()
    .min(1, "Enter a model or deployment identifier.")
    .max(256, "Model identifier cannot exceed 256 characters.")
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/,
      "Use a valid model or deployment identifier.",
    ),
  outputMode: agentOutputModeSchema,
  outputType: agentOutputTypeSchema,
  skillsMarkdown: z
    .string()
    .trim()
    .min(1, "Add skills instructions in Markdown.")
    .max(
      MAX_SKILLS_MARKDOWN_LENGTH,
      "Skills Markdown cannot exceed 200,000 characters.",
    ),
});

export const deleteProjectAgentSchema = z.object({
  id: z.uuid("Invalid agent."),
});

export const projectAgentModelsInputSchema = z.object({
  connector: llmConnectorTypeSchema,
});

export type ProjectAgentInput = z.infer<typeof projectAgentInputSchema>;
export type AgentOutputMode = z.infer<typeof agentOutputModeSchema>;
export type AgentOutputType = z.infer<typeof agentOutputTypeSchema>;

export type ProjectAgent = ProjectAgentInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectAgentActionResult<T> =
  | { status: "success"; resource: T }
  | { status: "error"; message: string; fields?: Record<string, string> };
