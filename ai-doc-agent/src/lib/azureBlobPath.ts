function storageSegment(value: string, fallback: string, maxLength: number) {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, maxLength);
  return normalized || fallback;
}

export function buildPipelineUploadBlobName(input: {
  projectName: string;
  projectId: string;
  pipelineName: string;
  pipelineId: string;
  uploadId: string;
  fileName: string;
}) {
  const project = storageSegment(input.projectName, "project", 80);
  const pipeline = storageSegment(input.pipelineName, "pipeline", 120);
  const file = storageSegment(input.fileName, "file", 180);
  return `${project}_${input.projectId}/${pipeline}_${input.pipelineId}/uploads/${input.uploadId}_${file}`;
}

export function buildActionGlobalContextBlobName(input: {
  projectName: string;
  projectId: string;
  pipelineName: string;
  pipelineId: string;
  actionId: string;
  version: number;
}) {
  const project = storageSegment(input.projectName, "project", 80);
  const pipeline = storageSegment(input.pipelineName, "pipeline", 120);
  return (
    `${project}_${input.projectId}/${pipeline}_${input.pipelineId}/` +
    `Actions/${input.actionId}/v${input.version}/Global_Context.md`
  );
}
