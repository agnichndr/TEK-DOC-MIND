import "server-only";

import { getServerEnv } from "@/lib/env";
import type { Json } from "@/types/database.types";

type RpcError = {
  code?: string;
  message?: string;
};

type RpcParameter = Json;

export class SupabaseRpcError extends Error {
  constructor(
    readonly code: string | undefined,
    readonly status: number,
  ) {
    super("Database operation failed.");
    this.name = "SupabaseRpcError";
  }
}

export async function callSupabaseRpc<TResult>(
  functionName: string,
  parameters: Record<string, RpcParameter>,
): Promise<TResult> {
  const env = getServerEnv();
  const response = await fetch(
    `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${functionName}`,
    {
      method: "POST",
      headers: {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parameters),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as RpcError;
    console.error("Supabase RPC failed", {
      functionName,
      status: response.status,
      code: error.code,
      message: error.message,
    });
    throw new SupabaseRpcError(error.code, response.status);
  }

  return (await response.json()) as TResult;
}
