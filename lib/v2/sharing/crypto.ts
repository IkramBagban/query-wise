import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
const SCRYPT_KEY_LENGTH = 32;
const UNLOCK_TTL_SECONDS = 15 * 60;

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export function createShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export async function hashSharePassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEY_LENGTH, {
    N: 16_384,
    r: 8,
    p: 1,
  });
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifySharePassword(password: string, encoded: string): Promise<boolean> {
  try {
    const [algorithm, n, r, p, saltValue, hashValue] = encoded.split("$");
    if (algorithm !== "scrypt" || !n || !r || !p || !saltValue || !hashValue) return false;
    const expected = Buffer.from(hashValue, "base64url");
    const derived = await scrypt(password, Buffer.from(saltValue, "base64url"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

function signingKey(): Buffer {
  const secret =
    process.env.QUERYWISE_SHARE_UNLOCK_SIGNING_KEY ??
    process.env.QUERYWISE_CURSOR_SIGNING_KEY ??
    process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error("A server signing secret is required for share unlock cookies.");
  return createHash("sha256").update(`querywise-share-unlock:${secret}`).digest();
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function unlockCookieName(tokenHash: string): string {
  return `qw_share_${tokenHash.slice(0, 16)}`;
}

export function createUnlockCredential(shareId: string, version: number): {
  value: string;
  maxAge: number;
} {
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      shareId,
      shareVersion: version,
      expiresAt: Date.now() + UNLOCK_TTL_SECONDS * 1000,
    }),
  ).toString("base64url");
  return { value: `${payload}.${sign(payload)}`, maxAge: UNLOCK_TTL_SECONDS };
}

export function verifyUnlockCredential(
  credential: string | undefined,
  shareId: string,
  shareVersion: number,
): boolean {
  try {
    if (!credential || credential.length > 4096) return false;
    const [payload, supplied] = credential.split(".");
    if (!payload || !supplied) return false;
    const expected = sign(payload);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      return false;
    }
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      version: number;
      shareId: string;
      shareVersion: number;
      expiresAt: number;
    };
    return (
      parsed.version === 1 &&
      parsed.shareId === shareId &&
      parsed.shareVersion === shareVersion &&
      parsed.expiresAt > Date.now()
    );
  } catch {
    return false;
  }
}

export function pendingEmailGrantKey(email: string): string {
  return `pending-email-sha256:${createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("base64url")}`;
}
