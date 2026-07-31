import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export function getServerEnv() {
  const result = serverEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NODE_ENV: process.env.NODE_ENV,
  });

  if (!result.success) {
    throw new Error(
      "Supabase environment variables are missing or invalid. See .env.example.",
    );
  }

  return result.data;
}

const encryptionKeySchema = z
  .string()
  .min(1)
  .transform((value, context) => {
    const key = Buffer.from(value, "base64");

    if (key.length !== 32 || key.toString("base64") !== value) {
      context.addIssue({
        code: "custom",
        message: "The repository token encryption key must be 32-byte base64.",
      });
      return z.NEVER;
    }

    return key;
  });

export function getRepositoryTokenEncryptionKey() {
  const result = encryptionKeySchema.safeParse(
    process.env.GITHUB_TOKEN_ENCRYPTION_KEY_V1,
  );

  if (!result.success) {
    throw new Error(
      "GITHUB_TOKEN_ENCRYPTION_KEY_V1 is missing or invalid. Generate a 32-byte base64 key.",
    );
  }

  return result.data;
}

export function getLlmConnectorEncryptionKey() {
  const result = encryptionKeySchema.safeParse(
    process.env.LLM_CONNECTOR_ENCRYPTION_KEY_V1,
  );

  if (!result.success) {
    throw new Error(
      "LLM_CONNECTOR_ENCRYPTION_KEY_V1 is missing or invalid. Generate a 32-byte base64 key.",
    );
  }

  return result.data;
}
