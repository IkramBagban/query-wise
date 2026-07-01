export interface EncryptedPayload {
  version: 1;
  algorithm: "aes-256-gcm";
  keyId: "v1";
  iv: string;
  ciphertext: string;
  authTag: string;
}
