import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import { getRepositoryTokenEncryptionKey } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const KEY_VERSION = 1;

export type EncryptedRepositoryToken = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: number;
};

function tokenContext(repositoryId: string) {
  return Buffer.from(`github-repository:${repositoryId}`, "utf8");
}

export function encryptRepositoryToken(
  token: string,
  repositoryId: string,
): EncryptedRepositoryToken {
  const nonce = randomBytes(12);
  const cipher = createCipheriv(
    ALGORITHM,
    getRepositoryTokenEncryptionKey(),
    nonce,
  );
  cipher.setAAD(tokenContext(repositoryId));

  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

export function decryptRepositoryToken(
  encrypted: EncryptedRepositoryToken,
  repositoryId: string,
) {
  if (encrypted.keyVersion !== KEY_VERSION) {
    throw new Error("Unsupported repository token key version.");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getRepositoryTokenEncryptionKey(),
    Buffer.from(encrypted.nonce, "base64"),
  );
  decipher.setAAD(tokenContext(repositoryId));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
