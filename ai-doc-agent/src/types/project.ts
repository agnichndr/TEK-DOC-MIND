import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password cannot exceed 72 characters.");

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Project name must be at least 2 characters.")
    .max(80, "Project name cannot exceed 80 characters."),
  description: z
    .string()
    .trim()
    .max(500, "Description cannot exceed 500 characters."),
  password: passwordSchema,
});

export const accessProjectSchema = z.object({
  projectId: z
    .string()
    .trim()
    .regex(
      /^PRJ-[A-Z0-9]{4}(?:-[A-Z0-9]{4}){3}$/,
      "Enter a valid project ID.",
    ),
  password: passwordSchema,
});

export const deleteProjectSchema = z.object({
  projectName: z.string().trim().min(2).max(80),
  confirmation: z.string().trim().min(1, "Type the project name to confirm."),
});

export type ProjectSummary = {
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectSession = {
  sessionToken: string;
  project: ProjectSummary;
  expiresAt: string;
};

export type CreateProjectResult = {
  projectId: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectActionState =
  | { status: "idle" }
  | { status: "error"; message: string; fields?: Record<string, string> }
  | { status: "success"; project: ProjectSummary };

export type CreateProjectActionState =
  | { status: "idle" }
  | { status: "error"; message: string; fields?: Record<string, string> }
  | { status: "success"; result: CreateProjectResult };

export type DeleteProjectActionState =
  | { status: "idle" }
  | { status: "error"; message: string };
