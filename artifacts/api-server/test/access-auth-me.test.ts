import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp, loginAs } from "./helpers/app";
import { PERMISSION_KEYS, resolvePermissions } from "../src/access";

/**
 * GET /api/auth/me reports effective permissions (Phase 2); the API enforces
 * them from Phase 3.
 */
const app = createTestApp();

async function me(email: string) {
  const res = await request(app).get("/api/auth/me").set(await loginAs(email));
  expect(res.status).toBe(200);
  return res.body;
}

describe("GET /api/auth/me permissions", () => {
  it("System Owner (Iris) holds every permission company-wide", async () => {
    const body = await me("iris@example.com");
    expect(Object.keys(body.permissions).sort()).toEqual([...PERMISSION_KEYS].sort());
    expect(body.permissions["cases.edit"]).toBe("all");
    expect(body.permissions["system.data.manage"]).toBe(true);
  });

  it("CSR (Devon) has cases but no leads", async () => {
    const body = await me("devon@example.com");
    expect(body.user.roles).toEqual(["csr"]);
    expect(body.permissions).toEqual(resolvePermissions(["csr"]));
    expect(body.permissions["cases.view"]).toBe("all");
    expect(body.permissions["cases.edit"]).toBe("own");
    expect(body.permissions["leads.view"]).toBeUndefined();
  });

  it("each demo employee gets their role bundle", async () => {
    const cases: [string, string][] = [
      ["nadia@example.com", "csr_supervisor"],
      ["leo@example.com", "business_advisor"],
      ["grace@example.com", "business_advisor_supervisor"],
      ["omar@example.com", "operations_admin"],
      ["rachel@example.com", "operations_admin_supervisor"],
      ["tessa@example.com", "hr"],
    ];
    for (const [email, role] of cases) {
      const body = await me(email);
      expect(body.user.roles).toEqual([role]);
      expect(body.permissions).toEqual(resolvePermissions([role]));
    }
  });

  it("spot-checks: Business Advisor, Admin, HR", async () => {
    const leo = (await me("leo@example.com")).permissions;
    expect(leo["leads.view"]).toBe("own");
    expect(leo["cases.view"]).toBeUndefined();

    const omar = (await me("omar@example.com")).permissions;
    expect(omar["accounts.view.regulatory_ids"]).toBe(true);
    expect(omar["accounts.view.financial"]).toBeUndefined();

    const tessa = (await me("tessa@example.com")).permissions;
    expect(tessa["accounting.payroll.view"]).toBe(true);
    expect(tessa["people.manage"]).toBe(true);
    expect(tessa["accounts.view"]).toBeUndefined();
  });

  it("does not expose secrets alongside permissions", async () => {
    const body = await me("devon@example.com");
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/passwordHash|scrypt\$/);
    expect(Object.keys(body).sort()).toEqual(["permissions", "teams", "user"]);
  });

  it("still requires a session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("permissions are enforced (Phase 3)", () => {
  // Phase 2 documented the boundary here with 200s; Phase 3 flipped them on
  // purpose. The full role × route table is in route-guards.test.ts.
  it("a CSR can no longer list Leads", async () => {
    const res = await request(app).get("/api/leads").set(await loginAs("devon@example.com"));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden", permission: "leads.view" });
  });

  it("HR can no longer list cases", async () => {
    const res = await request(app).get("/api/cases").set(await loginAs("tessa@example.com"));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden", permission: "cases.view" });
  });
});
