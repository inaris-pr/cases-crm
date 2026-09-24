/**
 * Password hashing with Node's built-in scrypt — no third-party dependency.
 *
 * Stored format (self-describing, so parameters can be raised later without
 * breaking existing hashes):
 *
 *   scrypt$<N>$<r>$<p>$<salt, base64>$<derived key, base64>
 *
 * Every hash gets its own random 16-byte salt. Verification recomputes the
 * key with the stored parameters and compares with crypto.timingSafeEqual.
 */
import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

export const SCRYPT_N = 16384; // CPU/memory cost (2^14)
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEY_BYTES = 64;
export const SALT_BYTES = 16;

/** Upper bound on a stored N, so a tampered hash cannot make verify hog memory. */
const MAX_N = 1 << 20;
const PREFIX = "scrypt";

function scryptAsync(password: string, salt: Buffer, keylen: number, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keylen, { N: n, r, p, maxmem: 256 * n * r + 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

function format(salt: Buffer, key: Buffer): string {
  return [PREFIX, SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), key.toString("base64")].join("$");
}

/** Synchronous variant for startup work (seeding, store migration). */
export function hashPasswordSync(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const key = scryptSync(password, salt, SCRYPT_KEY_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return format(salt, key);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(password, salt, SCRYPT_KEY_BYTES, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return format(salt, key);
}

interface ParsedHash { n: number; r: number; p: number; salt: Buffer; key: Buffer }

function parse(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return null;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every((x) => Number.isInteger(x) && x > 0)) return null;
  if (n > MAX_N || (n & (n - 1)) !== 0 || r > 32 || p > 16) return null;
  const salt = Buffer.from(parts[4], "base64");
  const key = Buffer.from(parts[5], "base64");
  if (salt.length < 8 || key.length < 16) return null;
  return { n, r, p, salt, key };
}

/** True only for a well-formed scrypt hash string of this format. */
export function isPasswordHash(value: unknown): value is string {
  return typeof value === "string" && parse(value) !== null;
}

/**
 * Constant-time check of a password against a stored hash. Malformed or
 * empty hashes never match.
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (typeof stored !== "string") return false;
  const parsed = parse(stored);
  if (!parsed) return false;
  const key = await scryptAsync(password, parsed.salt, parsed.key.length, parsed.n, parsed.r, parsed.p);
  return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
}

let dummyHash: string | null = null;
/**
 * A valid hash of a random secret. Login verifies against it when the email
 * is unknown, so "no such user" costs the same time as "wrong password".
 */
export function dummyPasswordHash(): string {
  dummyHash ??= hashPasswordSync(randomBytes(24).toString("base64"));
  return dummyHash;
}
