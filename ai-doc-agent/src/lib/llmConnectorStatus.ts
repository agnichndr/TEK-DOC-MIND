import type { LlmConnectorType } from "@/types/llmConnector";

export type ConnectorCredentialDraft = {
  connector: LlmConnectorType;
  credential: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  projectId: string;
  location: string;
};

export type ConnectorCardConnectionStatus =
  | "not_connected"
  | "checking"
  | "connection_error"
  | "connected";

export function hasConnectorCredential(
  draft: ConnectorCredentialDraft | undefined,
) {
  if (!draft) return false;
  return draft.connector === "bedrock"
    ? Boolean(draft.accessKeyId.trim() && draft.secretAccessKey.trim())
    : Boolean(draft.credential.trim());
}

export function isConnectorDraftComplete(
  draft: ConnectorCredentialDraft | undefined,
) {
  if (!draft || !hasConnectorCredential(draft)) return false;

  switch (draft.connector) {
    case "azure_openai":
      return Boolean(draft.endpoint.trim());
    case "bedrock":
      return Boolean(draft.region.trim());
    case "vertex_ai":
      return Boolean(draft.projectId.trim() && draft.location.trim());
    default:
      return true;
  }
}

export function getConnectorCardConnectionStatus(input: {
  draft: ConnectorCredentialDraft | undefined;
  checking: boolean;
  verifiedThisSession: boolean;
  savedStatus?: ConnectorCardConnectionStatus;
}): ConnectorCardConnectionStatus {
  if (input.checking) return "checking";
  if (input.verifiedThisSession) return "connected";
  if (input.savedStatus) return input.savedStatus;
  return hasConnectorCredential(input.draft)
    ? "connection_error"
    : "not_connected";
}
