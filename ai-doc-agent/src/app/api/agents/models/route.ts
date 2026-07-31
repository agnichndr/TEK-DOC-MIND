import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { llmConnectorErrorMessages as messages } from "@/lib/llmConnectorErrors";
import { PROJECT_SESSION_COOKIE } from "@/lib/projectSession";
import { isSameOriginMutation } from "@/lib/requestSecurity";
import {
  decryptLlmCredential,
  LlmCredentialConfigurationError,
} from "@/services/llmCredentialEncryptionService";
import {
  discoverLlmModels,
  LlmConnectorVerificationError,
} from "@/services/llmConnectorService";
import { getProjectWorkspace } from "@/services/projectService";
import { listProjectLlmConnectorRecords } from "@/services/projectResourceService";
import { projectAgentModelsInputSchema } from "@/types/agent";
import type {
  DiscoverLlmModelsResult,
  VerifyLlmConnectorErrorCode,
} from "@/types/llmConnector";

function errorResponse(
  code: VerifyLlmConnectorErrorCode,
  status: number,
  message = messages[code],
) {
  return NextResponse.json<DiscoverLlmModelsResult>(
    { status: "error", code, message },
    { status },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return errorResponse("forbidden", 403);

  const body = await request.json().catch(() => null);
  const parsed = projectAgentModelsInputSchema.safeParse(body);
  if (!parsed.success) return errorResponse("invalid_input", 400);

  const sessionToken = (await cookies()).get(PROJECT_SESSION_COOKIE)?.value;
  if (!sessionToken) return errorResponse("session_required", 401);

  try {
    if (!(await getProjectWorkspace(sessionToken))) {
      return errorResponse("session_required", 401);
    }

    const records = await listProjectLlmConnectorRecords(sessionToken);
    const record = records.find(
      (candidate) => candidate.summary.connector === parsed.data.connector,
    );
    if (!record?.encryptedCredential) {
      return errorResponse(
        "model_unavailable",
        404,
        "Connect this provider before choosing an agent model.",
      );
    }

    const connection = decryptLlmCredential(
      record.encryptedCredential,
      parsed.data.connector,
    );
    const models = await discoverLlmModels(connection);
    if (!models.length) return errorResponse("invalid_response", 502);

    return NextResponse.json<DiscoverLlmModelsResult>({
      status: "success",
      connector: parsed.data.connector,
      models,
    });
  } catch (error) {
    if (error instanceof LlmConnectorVerificationError) {
      return errorResponse(error.code, 502);
    }
    if (error instanceof LlmCredentialConfigurationError) {
      return errorResponse("configuration_error", 500);
    }

    console.error("Agent model discovery failed", {
      connector: parsed.data.connector,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse("unavailable", 502);
  }
}
