import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EncryptedPayload } from "@/types/v2";
import { AppError } from "@/lib/v2/dal/core";

const KEY_ENV = "QUERYWISE_CREDENTIAL_ENCRYPTION_KEY_V1";
const AAD = Buffer.from("querywise:v2:credential:v1", "utf8");

function encryptionKey(): Buffer {
  const encoded = process.env[KEY_ENV];
  if (!encoded) {
    throw new AppError(
      "DATA_SOURCE_UNAVAILABLE",
      "Connection credential encryption is not configured.",
    );
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new AppError(
      "DATA_SOURCE_UNAVAILABLE",
      "Connection credential encryption is configured incorrectly.",
    );
  }
  return key;
}

export async function encryptSecret(plaintext: string): Promise<EncryptedPayload> {
  if (!plaintext) throw new Error("Secret plaintext must not be empty.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { version: 1, algorithm: "aes-256-gcm", keyId: "v1", iv: iv.toString("base64url"), ciphertext: ciphertext.toString("base64url"), authTag: cipher.getAuthTag().toString("base64url") };
}

export async function decryptSecret(payload: EncryptedPayload): Promise<string> {
  if (payload.version !== 1 || payload.algorithm !== "aes-256-gcm" || payload.keyId !== "v1") throw new Error("Unsupported encrypted credential payload.");
  try {
    const iv = Buffer.from(payload.iv, "base64url");
    const authTag = Buffer.from(payload.authTag, "base64url");
    const ciphertext = Buffer.from(payload.ciphertext, "base64url");
    if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Credential decryption failed.");
  }
}
