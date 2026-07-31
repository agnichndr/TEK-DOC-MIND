import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { getLlmConnectorEncryptionKey } from "@/lib/env";
import {
  llmConnectorInputSchema,
  type LlmConnectorInput,
  type LlmConnectorType,
} from "@/types/llmConnector";

const ALGORITHM = "aes-256-gcm";
const KEY_VERSION = 1;

export type EncryptedLlmCredential = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: number;
};

export class LlmCredentialConfigurationError extends Error {
  constructor() {
    super("LLM connector encryption is not configured.");
    this.name = "LlmCredentialConfigurationError";
  }
}

function credentialContext(connector: LlmConnectorType) {
  return Buffer.from(`project-llm-connector:${connector}`, "utf8");
}

export function encryptLlmCredential(
  input: LlmConnectorInput,
): EncryptedLlmCredential {
  const nonce = randomBytes(12);
  let encryptionKey: Buffer;
  try {
    encryptionKey = getLlmConnectorEncryptionKey();
  } catch {
    throw new LlmCredentialConfigurationError();
  }
  const cipher = createCipheriv(
    ALGORITHM,
    encryptionKey,
    nonce,
  );
  cipher.setAAD(credentialContext(input.connector));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(input), "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

export function decryptLlmCredential(
  encrypted: EncryptedLlmCredential,
  connector: LlmConnectorType,
): LlmConnectorInput {
  if (encrypted.keyVersion !== KEY_VERSION) {
    throw new Error("Unsupported LLM credential key version.");
  }

  let encryptionKey: Buffer;
  try {
    encryptionKey = getLlmConnectorEncryptionKey();
  } catch {
    throw new LlmCredentialConfigurationError();
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey,
    Buffer.from(encrypted.nonce, "base64"),
  );
  decipher.setAAD(credentialContext(connector));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const parsed = llmConnectorInputSchema.parse(JSON.parse(plaintext));

  if (parsed.connector !== connector) {
    throw new Error("Encrypted LLM credential connector mismatch.");
  }

  return parsed;
}
