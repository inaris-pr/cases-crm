import { describe, it, expect } from "vitest";
// Every /api route requires a session: requests carry Iris's session cookie.
import { authedRequest as request } from "./helpers/app";
import { createTestApp, ME, asMe } from "./helpers/app";

const app = createTestApp();

describe("GET /api/accounts", () => {
  it("lists seeded accounts sorted by name, with rollup counts", async () => {
    const { body } = await request(app).get("/api/accounts").expect(200);

    expect(body).toHaveLength(17);
    expect(body[0]).toMatchObject({
      contactCount: expect.any(Number),
      caseCount: expect.any(Number),
      openCaseCount: expect.any(Number),
    });
    const names = body.map((a: any) => a.name);
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)));
  });

  it("searches name, state and industry", async () => {
    const byName = await request(app).get("/api/accounts").query({ search: "Patel" }).expect(200);
    expect(byName.body).toHaveLength(3);

    const byState = await request(app).get("/api/accounts").query({ search: "delaware" }).expect(200);
    expect(byState.body.length).toBeGreaterThan(0);
  });

  it("filters by owner", async () => {
    const { body } = await request(app).get("/api/accounts").query({ owner: "Sara Mitchell" }).expect(200);
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((a: any) => a.ownerName === "Sara Mitchell")).toBe(true);
  });
});

describe("GET /api/accounts/:id", () => {
  it("returns the account with its contacts and cases", async () => {
    const { body } = await request(app).get("/api/accounts/1").expect(200);

    expect(body.name).toBe("Helix Labs LLC");
    expect(Array.isArray(body.contacts)).toBe(true);
    expect(Array.isArray(body.cases)).toBe(true);
    expect(body.contacts[0]).toMatchObject({
      fullName: expect.any(String),
      link: expect.objectContaining({ role: expect.any(String) }),
    });
  });

  it("exposes the full entity-formation record", async () => {
    const { body } = await request(app).get("/api/accounts/1").expect(200);

    for (const field of [
      "portalId", "filingId", "ein", "fincenId", "formationStatus", "formationTier",
      "brand", "subscriptionBundle", "stripeId", "renewalStatus", "renewalDate",
      "principalAddress", "mailingAddress", "bankingAppStatus", "shareType",
    ]) {
      expect(body).toHaveProperty(field);
    }
    expect(body.principalAddress).toMatchObject({
      line1: expect.any(String),
      city: expect.any(String),
      state: expect.any(String),
      zip: expect.any(String),
    });
  });

  it("404s on an unknown account", async () => {
    await request(app).get("/api/accounts/99999").expect(404);
  });
});

describe("account writes", () => {
  it("creates an account with every field present", async () => {
    const { body } = await request(app)
      .post("/api/accounts")
      .set(asMe)
      .send({ name: "Newly Formed LLC", state: "DE", entityType: "LLC" })
      .expect(201);

    expect(body).toMatchObject({
      name: "Newly Formed LLC",
      state: "DE",
      ownerName: ME,
      createdByName: ME,
      archived: false,
    });
    expect(body.ein).toBeNull();
    expect(Object.values(body).every((v) => v !== undefined)).toBe(true);
  });

  it("patches a field inline and stamps the modifier", async () => {
    const { body } = await request(app)
      .patch("/api/accounts/2")
      .set(asMe)
      .send({ ein: "99-1234567" })
      .expect(200);

    expect(body.ein).toBe("99-1234567");
    expect(body.lastModifiedByName).toBe(ME);
  });

  it("patches a nested address", async () => {
    const { body } = await request(app)
      .patch("/api/accounts/2")
      .set(asMe)
      .send({ mailingAddress: { line1: "1 Test Way", city: "Sheridan", state: "WY", zip: "82801", country: "US" } })
      .expect(200);

    expect(body.mailingAddress).toMatchObject({ line1: "1 Test Way", city: "Sheridan" });
  });
});
