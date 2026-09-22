import { describe, it, expect } from "vitest";
import request from "supertest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createTestApp, asMe } from "./helpers/app";

const app = createTestApp();

const REPO_STORE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/store.json",
);

describe("test isolation", () => {
  it("runs from a throwaway working directory, not the package directory", () => {
    // Compare resolved paths: on macOS os.tmpdir() reports /var/folders/... while
    // process.cwd() reports the real /private/var/folders/..., since /var is a
    // symlink. Comparing the raw strings passes on Linux and fails on macOS.
    const tmpRoot = fs.realpathSync(os.tmpdir());
    const cwd = fs.realpathSync(process.cwd());

    expect(cwd.startsWith(tmpRoot)).toBe(true);
    expect(cwd).toContain("cases-api-test-");
    expect(cwd).not.toContain("artifacts/api-server/data");
  });

  it("writes its store inside that directory", async () => {
    await request(app)
      .post("/api/accounts")
      .set(asMe)
      .send({ name: "Isolation Probe LLC" })
      .expect(201);

    // persist() is debounced by 100ms.
    await new Promise((r) => setTimeout(r, 300));

    const written = path.join(process.cwd(), "data", "store.json");
    expect(fs.existsSync(written)).toBe(true);
    expect(JSON.parse(fs.readFileSync(written, "utf-8")).accounts).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Isolation Probe LLC" })]),
    );
  });

  it("leaves the repository's store.json alone", () => {
    // If it exists at all it must be outside cwd, so nothing the suite does
    // can reach it. (It is git-ignored, so it may legitimately be absent.)
    expect(REPO_STORE.startsWith(fs.realpathSync(process.cwd()))).toBe(false);
    if (fs.existsSync(REPO_STORE)) {
      const probe = JSON.parse(fs.readFileSync(REPO_STORE, "utf-8"));
      expect(
        (probe.accounts ?? []).some((a: any) => a.name === "Isolation Probe LLC"),
      ).toBe(false);
    }
  });

  it("starts each file from the deterministic seed", async () => {
    const { body } = await request(app).get("/api/cases").expect(200);
    // 15 seeded cases; this file adds accounts but never cases.
    expect(body).toHaveLength(15);
  });
});
