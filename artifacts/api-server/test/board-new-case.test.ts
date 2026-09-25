import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { store } from "../src/store";
import { CASE_CATEGORIES, CASE_CATEGORY_LABELS } from "../src/caseMeta";
import { createTestApp, loginAs } from "./helpers/app";
import { apiAs } from "./helpers/api";

/**
 * Phase 7 follow-up — the Board's own New Case popup (CasesBoard.tsx,
 * NewCaseModalForClient) sends the optional category through the same
 * POST /api/cases validation as every other creation path, using its own
 * request shape (legacy `customerId`, fixed priority, no contact).
 */
const app = createTestApp();
const devon = apiAs(app, loginAs("devon@example.com"));

/** Exactly what the Board popup posts. */
const boardBody = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  description: "",
  status: "intake",
  customerId: 1,
  priority: "medium",
  tags: [],
  ...extra,
});

describe("Board New Case → category", () => {
  it("a valid category is saved and returned", async () => {
    const res = await devon.post("/cases", boardBody("Board with category", { category: "billing_refund" }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ accountId: 1, primaryContactId: null, priority: "medium", category: "billing_refund" });
    expect((await devon.get(`/cases/${res.body.id}`)).body.category).toBe("billing_refund");
  });

  it("without a category (as the popup sends it) or with null, the Case is uncategorized", async () => {
    const none = await devon.post("/cases", boardBody("Board without category"));
    expect(none.status).toBe(201);
    expect(none.body.category).toBeNull();
    const nul = await devon.post("/cases", boardBody("Board null category", { category: null }));
    expect(nul.status).toBe(201);
    expect(nul.body.category).toBeNull();
  });

  it("an unknown category is rejected and nothing is created", async () => {
    const before = store.cases.length;
    for (const category of ["chargeback", "Billing / Refund Request", "", 7]) {
      const res = await devon.post("/cases", boardBody("Board bad category", { category }));
      expect(res.status).toBe(400);
    }
    expect(store.cases.length).toBe(before);
  });
});

describe("one category taxonomy", () => {
  const HERE = path.dirname(fileURLToPath(import.meta.url));
  const WEB = path.join(HERE, "../../cases/src");
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(path.join(dir, e.name)) : /\.(tsx?)$/.test(e.name) ? [path.join(dir, e.name)] : [],
    );

  it("category keys and labels are defined only in lib/caseMeta.ts in the web app", () => {
    const needles = [
      ...CASE_CATEGORIES.filter((k) => k.includes("_")).map((k) => `"${k}"`),
      ...Object.values(CASE_CATEGORY_LABELS).filter((l) => l.includes("/")),
    ];
    const offenders = files(WEB)
      .filter((f) => !f.endsWith(path.join("lib", "caseMeta.ts")))
      .flatMap((f) => {
        const src = fs.readFileSync(f, "utf-8");
        return needles.filter((n) => src.includes(n)).map((n) => `${path.relative(WEB, f)}: ${n}`);
      });
    expect(offenders).toEqual([]);
  });

  it("the Board popup takes its options from that shared list", () => {
    const board = fs.readFileSync(path.join(WEB, "pages/CasesBoard.tsx"), "utf-8");
    expect(board).toContain('import { CASE_CATEGORY_OPTIONS } from "@/lib/caseMeta";');
    expect(board).toMatch(/CASE_CATEGORY_OPTIONS\.map/);
    expect(board).toMatch(/\.\.\.\(category \? \{ category \} : \{\}\)/);
  });
});
