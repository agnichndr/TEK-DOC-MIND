"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { PROJECT_SESSION_COOKIE } from "@/lib/projectSession";
import {
  deleteProjectPipeline,
  saveProjectPipeline,
} from "@/services/pipelineService";
import {
  MAX_PIPELINE_UPLOAD_BYTES,
  MAX_PIPELINE_UPLOAD_TOTAL_BYTES,
  deleteProjectPipelineSchema,
  pipelineUploadManifestSchema,
  projectPipelineInputSchema,
  type ProjectPipelineActionResult,
  type ProjectPipelineSaveResult,
} from "@/types/pipeline";

async function sessionToken() {
  return (await cookies()).get(PROJECT_SESSION_COOKIE)?.value;
}

export async function saveProjectPipelineAction(
  formData: FormData,
): Promise<ProjectPipelineActionResult<ProjectPipelineSaveResult>> {
  const pipelineValue = formData.get("pipeline");
  const manifestValue = formData.get("uploadManifest");
  let pipelineInput: unknown;
  let manifestInput: unknown;
  try {
    pipelineInput = JSON.parse(typeof pipelineValue === "string" ? pipelineValue : "");
    manifestInput = JSON.parse(typeof manifestValue === "string" ? manifestValue : "[]");
  } catch {
    return { status: "error", message: "The pipeline submission is invalid." };
  }
  const parsed = projectPipelineInputSchema.safeParse(pipelineInput);
  if (!parsed.success) {
    const fields = Object.fromEntries(
      Object.entries(parsed.error.flatten().fieldErrors)
        .filter((entry): entry is [string, string[]] => Boolean(entry[1]?.[0]))
        .map(([field, messages]) => [field, messages[0]]),
    );
    return { status: "error", message: "Check the pipeline details.", fields };
  }

  const parsedManifest = pipelineUploadManifestSchema.safeParse(manifestInput);
  if (!parsedManifest.success) {
    return {
      status: "error",
      message: parsedManifest.error.issues[0]?.message ?? "Check the uploaded files.",
    };
  }
  const pipelineNodeIds = new Set(parsed.data.nodes.map((node) => node.id));
  for (const node of parsed.data.nodes) {
    const newInputCount = parsedManifest.data.filter((upload) =>
      upload.nodeIds.includes(node.id),
    ).length;
    if (node.inputMediaUrls.length + newInputCount > 20) {
      return { status: "error", message: "A node cannot use more than 20 uploaded files." };
    }
  }
  const uploads: Array<{ file: File; nodeIds: string[] }> = [];
  let totalBytes = 0;
  for (const item of parsedManifest.data) {
    if (item.nodeIds.some((nodeId) => !pipelineNodeIds.has(nodeId))) {
      return { status: "error", message: "An uploaded file references an unavailable node." };
    }
    const entries = formData.getAll(`file:${item.clientId}`);
    const file = entries.length === 1 ? entries[0] : null;
    if (typeof file === "string" || !file) {
      return { status: "error", message: "An uploaded file is missing." };
    }
    if (
      !file.name ||
      file.name.length > 255 ||
      /[\\/\u0000-\u001f\u007f]/.test(file.name)
    ) {
      return { status: "error", message: "An uploaded file name is invalid." };
    }
    if (file.size < 1 || file.size > MAX_PIPELINE_UPLOAD_BYTES) {
      return {
        status: "error",
        message: "Each uploaded file must be between 1 byte and 10 MB.",
      };
    }
    if (
      file.type.length > 255 ||
      (file.type && !/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(file.type))
    ) {
      return { status: "error", message: "An uploaded file type is invalid." };
    }
    totalBytes += file.size;
    uploads.push({ file, nodeIds: item.nodeIds });
  }
  if (totalBytes > MAX_PIPELINE_UPLOAD_TOTAL_BYTES) {
    return { status: "error", message: "Pipeline uploads cannot exceed 50 MB in total." };
  }

  const token = await sessionToken();
  if (!token) {
    return { status: "error", message: "Your project session expired." };
  }

  try {
    const resource = await saveProjectPipeline({
      ...parsed.data,
      sessionToken: token,
      uploads,
    });
    revalidatePath("/project");
    return { status: "success", resource };
  } catch (error) {
    console.error("Project pipeline save failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      status: "error",
      message:
        "The pipeline could not be saved. Check its name, connections, and project agents.",
    };
  }
}

export async function deleteProjectPipelineAction(
  id: string,
): Promise<ProjectPipelineActionResult<{ id: string }>> {
  const parsed = deleteProjectPipelineSchema.safeParse({ id });
  if (!parsed.success) {
    return { status: "error", message: "Invalid pipeline." };
  }
  const token = await sessionToken();
  if (!token) {
    return { status: "error", message: "Your project session expired." };
  }

  try {
    const deleted = await deleteProjectPipeline({
      sessionToken: token,
      id: parsed.data.id,
    });
    if (!deleted) {
      return { status: "error", message: "This pipeline no longer exists." };
    }
    revalidatePath("/project");
    return { status: "success", resource: { id: parsed.data.id } };
  } catch (error) {
    console.error("Project pipeline deletion failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { status: "error", message: "The pipeline could not be deleted." };
  }
}
