import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp, asMe } from "./helpers/app";

const app = createTestApp();

/**
 * The /api/customers shim projects Accounts into the retired flat Customer
 * shape. The Customer -> Account migration is unfinished and the Kanban board's
 * client picker plus the New Case drawer still read these routes, so this is
 * pinned behaviour, not dead code. See CLAUDE_HANDOFF.md section 6.1.
 */
describe("GET /api/customers — legacy projection", () => {
  it("returns one row per account in the legacy shape", async () => {
    const { body } = await request(app).get("/api/customers").expect(200);

    expect(body).toHaveLength(17);
    expect(Object.keys(body[0]).sort()).toEqual(
      ["caseCount", "company", "createdAt", "email", "id", "name", "ownerName", "phone"].sort(),
    );
  });

  it("uses the primary contact for name/email and the account for company", async () => {
    const rows = (await request(app).get("/api/customers").expect(200)).body;
    const helix = rows.find((c: any) => c.company === "Helix Labs LLC");

    expect(helix.name).toBe("Amelia Reyes");
    expect(helix.email).toBe("amelia@helixlabs.io");
    expect(helix.id).toBe(1); // account id doubles as the legacy customer id
  });

  it("returns one customer by id", async () => {
    const { body } = await request(app).get("/api/customers/1").expect(200);
    expect(body.company).toBe("Helix Labs LLC");
  });
});

/**
 * Regression for the defect fixed in 163dacd: an account with no linked
 * contact projects to email: null, and both the board's client picker and the
 * Customers search called c.email.toLowerCase() on it, throwing as soon as the
 * user typed. The guard is client-side; this pins the server-side input that
 * exposed it, so the shape cannot silently change back.
 */
describe("accounts with no contacts", () => {
  it("projects to a null email rather than omitting the field", async () => {
    await request(app)
      .post("/api/accounts")
      .set(asMe)
      .send({ name: "Contactless Holdings LLC" })
      .expect(201);

    const row = (await request(app).get("/api/customers").expect(200)).body.find(
      (c: any) => c.company === "Contactless Holdings LLC",
    );

    expect(row).toBeTruthy();
    expect(row.email).toBeNull();
    expect(row.phone).toBeNull();
    expect(row).toHaveProperty("email"); // present-and-null, not absent
    expect(row.name).toBe("Contactless Holdings LLC"); // falls back to account name
  });

  it("survives the search expression the UI runs over it", async () => {
    await request(app).post("/api/accounts").set(asMe).send({ name: "Contactless Two LLC" }).expect(201);
    const rows = (await request(app).get("/api/customers").expect(200)).body;
    const needle = "hold";

    // The patched expression from CasesBoard.tsx / Customers.tsx.
    expect(() =>
      rows.filter(
        (c: any) =>
          c.name.toLowerCase().includes(needle) ||
          (c.company ?? "").toLowerCase().includes(needle) ||
          (c.email ?? "").toLowerCase().includes(needle),
      ),
    ).not.toThrow();

    // The pre-fix expression, kept to prove the guard is still load-bearing.
    expect(() =>
      rows.filter((c: any) => c.email.toLowerCase().includes(needle)),
    ).toThrow();
  });
});
