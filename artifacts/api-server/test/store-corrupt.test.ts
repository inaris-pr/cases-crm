import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * A store.json that exists but cannot be parsed must stop startup — not be
 * replaced by the demo seed (which would overwrite it on the next write).
 */
describe("API startup on an unreadable store.json", () => {
  it("refuses to start and leaves the file untouched", async () => {
    const dataDir = path.join(process.cwd(), "data");
    const storeFile = path.join(dataDir, "store.json");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(storeFile, '{ "accounts": [ truncated');
    const before = fs.readFileSync(storeFile);

    const { seed } = await import("../src/store");
    const { MigrationAbortError } = await import("../src/migrations");

    expect(() => seed()).toThrow(MigrationAbortError);
    await new Promise((r) => setTimeout(r, 250)); // longer than persist()'s debounce
    expect(fs.readFileSync(storeFile).equals(before)).toBe(true);
    expect(fs.existsSync(path.join(dataDir, "backups"))).toBe(false);
  });
});
