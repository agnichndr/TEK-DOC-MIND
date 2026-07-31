import { z } from "zod";

const githubUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter a GitHub repository URL.")
  .max(300, "Repository URL cannot exceed 300 characters.")
  .superRefine((value, context) => {
    try {
      const url = new URL(value);
      const segments = url.pathname
        .replace(/\/+$/, "")
        .split("/")
        .filter(Boolean);

      if (
        url.protocol !== "https:" ||
        url.hostname.toLowerCase() !== "github.com" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        segments.length !== 2
      ) {
        throw new Error("invalid");
      }
    } catch {
      context.addIssue({
        code: "custom",
        message: "Use a URL like https://github.com/owner/repository.",
      });
    }
  });

const githubTokenSchema = z
  .string()
  .trim()
  .max(1024, "Access token is too long.")
  .refine(
    (value) => !value || (value.length >= 20 && !/\s/.test(value)),
    "Enter a valid GitHub access token.",
  );

export const addRepositorySchema = z.object({
  url: githubUrlSchema,
  purpose: z
    .string()
    .trim()
    .max(500, "Purpose cannot exceed 500 characters."),
  accessToken: githubTokenSchema,
});

export const deleteRepositorySchema = z.object({
  repositoryId: z.uuid("Invalid repository."),
  repositoryName: z.string().trim().min(1).max(100),
  confirmation: z.string().trim().min(1, "Type the repository name to confirm."),
});

export const updateRepositorySchema = z.object({
  repositoryId: z.uuid("Invalid repository."),
  purpose: z
    .string()
    .trim()
    .max(500, "Purpose cannot exceed 500 characters."),
});

export const listRepositoryBranchesSchema = z.object({
  repositoryId: z.uuid("Invalid repository."),
});

const repositoryRelativePathSchema = z
  .string()
  .trim()
  .max(1024, "Repository path is too long.")
  .refine(
    (value) =>
      !value ||
      (!value.startsWith("/") &&
        !value.endsWith("/") &&
        !value.includes("\\") &&
        !value.split("/").some((part) => part === "." || part === "..")),
    "Invalid repository path.",
  );

export const listRepositoryContentsSchema = z.object({
  repositoryId: z.uuid("Invalid repository."),
  branch: z.string().trim().min(1, "Select a branch.").max(255),
  path: repositoryRelativePathSchema,
});

export type RepositoryVisibility = "public" | "private";

export type ProjectRepository = {
  id: string;
  githubRepositoryId: string;
  owner: string;
  name: string;
  url: string;
  visibility: RepositoryVisibility;
  purpose: string;
  defaultBranch: string;
  hasStoredToken: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RepositoryFormValues = {
  url: string;
  purpose: string;
};

export type AddRepositoryActionState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fields?: Record<string, string>;
      values: RepositoryFormValues;
      showToken?: boolean;
    }
  | {
      status: "token_required";
      message: string;
      values: RepositoryFormValues;
    }
  | {
      status: "success";
      message: string;
      repository: ProjectRepository;
    };

export type DeleteRepositoryActionState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; repositoryId: string };

export type UpdateRepositoryActionResult =
  | { status: "success"; repository: ProjectRepository }
  | {
      status: "error";
      message: string;
      fields?: Record<string, string>;
    };

export type ListRepositoryBranchesActionResult =
  | { status: "success"; branches: string[] }
  | { status: "error"; message: string };

export type RepositoryContentEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
};

export type ListRepositoryContentsActionResult =
  | { status: "success"; entries: RepositoryContentEntry[] }
  | { status: "error"; message: string };
