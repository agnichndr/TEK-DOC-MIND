import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { llmConnectorErrorMessages as messages } from "@/lib/llmConnectorErrors";
import { PROJECT_SESSION_COOKIE } from "@/lib/projectSession";
import { isSameOriginMutation } from "@/lib/requestSecurity";
import {
  discoverLlmModels,
  LlmConnectorVerificationError,
} from "@/services/llmConnectorService";
import { getProjectWorkspace } from "@/services/projectService";
import {
  llmModelDiscoveryInputSchema,
  type DiscoverLlmModelsResult,
  type VerifyLlmConnectorErrorCode,
} from "@/types/llmConnector";

function errorResponse(
  code: VerifyLlmConnectorErrorCode,
  status: number,
) {
  return NextResponse.json<DiscoverLlmModelsResult>(
    { status: "error", code, message: messages[code] },
    { status },
  );
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return errorResponse("forbidden", 403);

  const body = await request.json().catch(() => null);
  const parsed = llmModelDiscoveryInputSchema.safeParse(body);
  if (!parsed.success) return errorResponse("invalid_input", 400);

  const sessionToken = (await cookies()).get(PROJECT_SESSION_COOKIE)?.value;
  if (!sessionToken) return errorResponse("session_required", 401);

  try {
    if (!(await getProjectWorkspace(sessionToken))) {
      return errorResponse("session_required", 401);
    }

    const models = await discoverLlmModels(parsed.data);
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

    console.error("LLM model discovery failed", {
      connector: parsed.data.connector,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse("unavailable", 502);
  }
}

