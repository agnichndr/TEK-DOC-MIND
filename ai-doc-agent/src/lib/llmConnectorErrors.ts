import type { VerifyLlmConnectorErrorCode } from "@/types/llmConnector";

export const llmConnectorErrorMessages: Record<
  VerifyLlmConnectorErrorCode,
  string
> = {
  invalid_input: "Check the connector details and try again.",
  session_required: "Your project session has expired. Access the project again.",
  invalid_credentials: "The provider rejected these credentials.",
  model_unavailable: "The selected model is not available to these credentials.",
  forbidden: "These credentials do not have the required provider permission.",
  rate_limited: "The provider rate limit was reached. Try again shortly.",
  timeout: "The provider did not respond within 10 seconds.",
  unavailable: "The provider could not be reached. Try again.",
  invalid_response: "The provider returned an unexpected response.",
  configuration_error:
    "Connector encryption is not configured on the server. Ask an administrator to set LLM_CONNECTOR_ENCRYPTION_KEY_V1.",
};

