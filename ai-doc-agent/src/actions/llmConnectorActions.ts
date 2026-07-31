"use server";

import "server-only";

import { cookies } from "next/headers";

import { llmConnectorErrorMessages as messages } from "@/lib/llmConnectorErrors";
import { PROJECT_SESSION_COOKIE } from "@/lib/projectSession";
import {
  decryptLlmCredential,
  LlmCredentialConfigurationError,
} from "@/services/llmCredentialEncryptionService";
import {
  LlmConnectorVerificationError,
  verifyLlmConnector,
} from "@/services/llmConnectorService";
import { getProjectWorkspace } from "@/services/projectService";
import {
  listProjectLlmConnectorRecords,
  saveEncryptedProjectLlmConnector,
} from "@/services/projectResourceService";
import {
  type CheckSavedLlmConnectorsResult,
  type SavedLlmConnectorCheck,
} from "@/types/llmConnector";

export async function checkSavedLlmConnectorsAction(): Promise<CheckSavedLlmConnectorsResult> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(PROJECT_SESSION_COOKIE)?.value;
  if (!sessionToken) {
    return { status: "error", message: messages.session_required };
  }

  try {
    if (!(await getProjectWorkspace(sessionToken))) {
      return { status: "error", message: messages.session_required };
    }

    const records = await listProjectLlmConnectorRecords(sessionToken);
    const connections = await Promise.all(
      records.map(async (record): Promise<SavedLlmConnectorCheck> => {
        if (!record.encryptedCredential) {
          return {
            connector: record.summary.connector,
            status: "error",
            message: "Reconnect this provider to save its encrypted credential.",
          };
        }

        try {
          const connection = decryptLlmCredential(
            record.encryptedCredential,
            record.summary.connector,
          );
          const summary = await verifyLlmConnector(connection);
          await saveEncryptedProjectLlmConnector({
            sessionToken,
            summary,
            encryptedCredential: record.encryptedCredential,
          });
          return {
            connector: summary.connector,
            status: "connected",
            summary,
          };
        } catch (error) {
          if (error instanceof LlmConnectorVerificationError) {
            return {
              connector: record.summary.connector,
              status: "error",
              message: messages[error.code],
            };
          }

          if (error instanceof LlmCredentialConfigurationError) {
            return {
              connector: record.summary.connector,
              status: "error",
              message: messages.configuration_error,
            };
          }

          console.error("Saved LLM connector check failed", {
            connector: record.summary.connector,
            errorName: error instanceof Error ? error.name : "UnknownError",
          });
          return {
            connector: record.summary.connector,
            status: "error",
            message: messages.unavailable,
          };
        }
      }),
    );
    return { status: "success", connections };
  } catch (error) {
    console.error("Saved LLM connector listing failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return { status: "error", message: messages.unavailable };
  }
}
