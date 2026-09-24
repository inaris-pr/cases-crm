import { describe, it, expect } from "vitest";
import {
  SALT_BYTES,
  SCRYPT_KEY_BYTES,
  hashPassword,
  hashPasswordSync,
  isPasswordHash,
  verifyPassword,
} from "../src/auth/password";

/** Password hashing (Node's built-in scrypt), Phase 1. */
describe("password hashing", () => {
  it("produces a self-describing scrypt hash, not the password", () => {
    const hash = hashPasswordSync("test123");
    const parts = hash.split("$");

    expect(parts[0]).toBe("scrypt");
    expect(parts.slice(1, 4)).toEqual(["16384", "8", "1"]);
    expect(Buffer.from(parts[4], "base64")).toHaveLength(SALT_BYTES);
    expect(Buffer.from(parts[5], "base64")).toHaveLength(SCRYPT_KEY_BYTES);
    expect(hash).not.toContain("test123");
    expect(isPasswordHash(hash)).toBe(true);
  });

  it("uses a unique salt every time, so equal passwords get different hashes", async () => {
    const a = hashPasswordSync("same password");
    const b = hashPasswordSync("same password");
    const c = await hashPassword("same password");

    expect(new Set([a, b, c]).size).toBe(3);
    expect(new Set([a, b, c].map((h) => h.split("$")[4])).size).toBe(3);
  });

  it("verifies the correct password (sync and async hashes alike)", async () => {
    expect(await verifyPassword("test123", hashPasswordSync("test123"))).toBe(true);
    expect(await verifyPassword("test123", await hashPassword("test123"))).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = hashPasswordSync("test123");
    for (const wrong of ["test124", "Test123", "test123 ", "", "x".repeat(200)]) {
      expect(await verifyPassword(wrong, hash)).toBe(false);
    }
  });

  it("never matches a missing, plaintext or malformed stored value", async () => {
    const good = hashPasswordSync("test123");
    const [, , , , salt, key] = good.split("$");
    const malformed = [
      null,
      undefined,
      "",
      "test123", // a legacy plaintext password is not a hash
      "scrypt$16384$8$1$onlyfiveparts",
      `bcrypt$16384$8$1$${salt}$${key}`,
      `scrypt$1073741824$8$1$${salt}$${key}`, // absurd cost factor must be refused, not attempted
      `scrypt$1000$8$1$${salt}$${key}`, // N not a power of two
    ];
    for (const stored of malformed) {
      expect(await verifyPassword("test123", stored as any)).toBe(false);
      expect(isPasswordHash(stored)).toBe(false);
    }
  });
});
