import { describe, it, expect, beforeAll } from "vitest";
// Every /api route requires a session: requests carry Iris's session cookie.
import { authedRequest as request } from "./helpers/app";
import { createTestApp, ME, asMe } from "./helpers/app";

const app = createTestApp();

/**
 * Regression suite for the defect fixed in 163dacd: POST /leads/:id/convert
 * built an Account literal with 9 of its 46 fields, leaving the other 37
 * absent rather than null, so accounts produced by conversion rendered as
 * undefined across the account detail page.
 */
describe("POST /api/leads/:id/convert", () => {
  let leadId: number;
  let converted: any;
  let referenceFields: string[];

  beforeAll(async () => {
    const leads = (await request(app).get("/api/leads").expect(200)).body;
    leadId = leads.find((l: any) => !l.convertedAt).id;

    // A seeded account is the reference for "a complete Account record".
    const seeded = (await request(app).get("/api/accounts/1").expect(200)).body;
    referenceFields = Object.keys(seeded).filter(
      (k) => !["contactCount", "caseCount", "openCaseCount", "contacts", "cases"].includes(k),
    );

    converted = (
      await request(app)
        .post(`/api/leads/${leadId}/convert`)
        .set(asMe)
        .send({
          accountName: "Converted Holdings LLC",
          accountState: "WY",
          accountEntityType: "LLC",
          linkRole: "Founder",
          ownershipPct: 100,
          createInitialCase: true,
          initialCaseTitle: "WY Formation — Converted Holdings LLC",
          initialCasePriority: "high",
        })
        .expect(201)
    ).body;
  });

  it("returns the new account, contact and link", () => {
    expect(converted.account).toBeTruthy();
    expect(converted.contact).toBeTruthy();
    expect(converted.link).toBeTruthy();
  });

  it("produces an account carrying every Account field", () => {
    const missing = referenceFields.filter((f) => !(f in converted.account));
    expect(missing).toEqual([]);
    expect(referenceFields.length).toBeGreaterThan(40);
  });

  it("sets unsupplied fields to null rather than undefined", () => {
    for (const field of ["portalId", "ein", "filingId", "stripeId", "principalAddress", "renewalStatus"]) {
      expect(converted.account[field]).toBeNull();
    }
  });

  it("keeps the values supplied by the caller", () => {
    expect(converted.account).toMatchObject({
      name: "Converted Holdings LLC",
      state: "WY",
      entityType: "LLC",
      ownerName: ME,
    });
  });

  it("stamps the audit fields the way POST /accounts does", () => {
    expect(converted.account.createdByName).toBe(ME);
    expect(converted.account.lastModifiedByName).toBe(ME);
    expect(Date.parse(converted.account.lastModifiedAt)).not.toBeNaN();
  });

  it("links the contact as primary signatory with the given role", async () => {
    const detail = (
      await request(app).get(`/api/accounts/${converted.account.id}`).expect(200)
    ).body;

    expect(detail.contacts).toHaveLength(1);
    expect(detail.contacts[0].link).toMatchObject({
      role: "Founder",
      ownershipPct: 100,
      isPrimary: true,
      endedAt: null,
    });
  });

  it("creates the requested initial case", async () => {
    const detail = (
      await request(app).get(`/api/accounts/${converted.account.id}`).expect(200)
    ).body;

    expect(detail.cases).toHaveLength(1);
    expect(detail.cases[0]).toMatchObject({
      title: "WY Formation — Converted Holdings LLC",
      priority: "high",
      accountId: converted.account.id,
    });
  });

  it("marks the lead converted and back-references both records", async () => {
    const lead = (await request(app).get("/api/leads").expect(200)).body.find(
      (l: any) => l.id === leadId,
    );

    expect(lead.status).toBe("converted");
    expect(Date.parse(lead.convertedAt)).not.toBeNaN();
    expect(lead.convertedAccountId).toBe(converted.account.id);
    expect(lead.convertedContactId).toBe(converted.contact.id);
  });

  it("refuses to convert the same lead twice", async () => {
    const { body } = await request(app)
      .post(`/api/leads/${leadId}/convert`)
      .set(asMe)
      .send({ accountName: "Duplicate LLC", linkRole: "Founder" })
      .expect(409);

    expect(body.error).toBe("already_converted");
  });

  it("404s on an unknown lead", async () => {
    await request(app)
      .post("/api/leads/99999/convert")
      .set(asMe)
      .send({ accountName: "Nobody LLC", linkRole: "Founder" })
      .expect(404);
  });

  it("renders through the account list without undefined columns", async () => {
    const row = (await request(app).get("/api/accounts").expect(200)).body.find(
      (a: any) => a.id === converted.account.id,
    );

    expect(row).toBeTruthy();
    expect(Object.values(row).every((v) => v !== undefined)).toBe(true);
    expect(row).toMatchObject({ contactCount: 1, caseCount: 1 });
  });
});
