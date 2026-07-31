import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { llmConnectorErrorMessages as messages } from "@/lib/llmConnectorErrors";
import { PROJECT_SESSION_COOKIE } from "@/lib/projectSession";
import { isSameOriginMutation } from "@/lib/requestSecurity";
import { LlmCredentialConfigurationError } from "@/services/llmCredentialEncryptionService";
import {
  LlmConnectorVerificationError,
  verifyLlmConnector,
} from "@/services/llmConnectorService";
import { getProjectWorkspace } from "@/services/projectService";
import { saveProjectLlmConnector } from "@/services/projectResourceService";
import {
  llmConnectorInputSchema,
  type VerifyLlmConnectorErrorCode,
  type VerifyLlmConnectorResult,
} from "@/types/llmConnector";

function errorResponse(
  code: VerifyLlmConnectorErrorCode,
  status: number,
) {
  return NextResponse.json<VerifyLlmConnectorResult>(
    { status: "error", code, message: messages[code] },
    { status },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return errorResponse("forbidden", 403);

  const body = await request.json().catch(() => null);
  const parsed = llmConnectorInputSchema.safeParse(body);
  if (!parsed.success) return errorResponse("invalid_input", 400);

  const sessionToken = (await cookies()).get(PROJECT_SESSION_COOKIE)?.value;
  if (!sessionToken) return errorResponse("session_required", 401);

  try {
    if (!(await getProjectWorkspace(sessionToken))) {
      return errorResponse("session_required", 401);
    }

    const summary = await verifyLlmConnector(parsed.data);
    await saveProjectLlmConnector({
      sessionToken,
      summary,
      connection: parsed.data,
    });
    return NextResponse.json<VerifyLlmConnectorResult>({
      status: "connected",
      summary,
    });
  } catch (error) {
    if (error instanceof LlmConnectorVerificationError) {
      return errorResponse(error.code, 502);
    }
    if (error instanceof LlmCredentialConfigurationError) {
      console.error("LLM connector encryption is not configured", {
        connector: parsed.data.connector,
      });
      return errorResponse("configuration_error", 503);
    }

    console.error("LLM connector establishment failed", {
      connector: parsed.data.connector,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse("unavailable", 502);
  }
}
