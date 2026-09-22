import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp, ME, asMe } from "./helpers/app";

const app = createTestApp();

describe("GET /api/contacts — the Clients page", () => {
  it("lists seeded contacts with account rollups", async () => {
    const { body } = await request(app).get("/api/contacts").expect(200);

    expect(body).toHaveLength(21);
    expect(body[0]).toMatchObject({
      fullName: expect.any(String),
      accountCount: expect.any(Number),
      accountNames: expect.any(Array),
      openCaseCount: expect.any(Number),
    });
  });

  it("resolves a contact linked to several accounts", async () => {
    const { body } = await request(app).get("/api/contacts").expect(200);
    const hassan = body.find((c: any) => c.fullName === "Hassan Patel");

    expect(hassan.accountCount).toBe(3);
    expect(hassan.accountNames).toHaveLength(3);
  });

  it("searches by name and email", async () => {
    const byName = await request(app).get("/api/contacts").query({ search: "sofia" }).expect(200);
    expect(byName.body.length).toBeGreaterThan(0);

    const byEmail = await request(app).get("/api/contacts").query({ search: "helixlabs" }).expect(200);
    expect(byEmail.body.length).toBeGreaterThan(0);
  });

  it("filters to one account's contacts", async () => {
    const { body } = await request(app).get("/api/contacts").query({ accountId: 1 }).expect(200);
    expect(body.length).toBeGreaterThan(0);
  });

  it("filters by owner", async () => {
    const { body } = await request(app).get("/api/contacts").query({ owner: "Devon Park" }).expect(200);
    expect(body.every((c: any) => c.ownerName === "Devon Park")).toBe(true);
  });
});

describe("GET /api/contacts/:id", () => {
  it("returns the contact with every account they sit on", async () => {
    const list = (await request(app).get("/api/contacts").expect(200)).body;
    const hassan = list.find((c: any) => c.fullName === "Hassan Patel");

    const { body } = await request(app).get(`/api/contacts/${hassan.id}`).expect(200);

    expect(body.accounts).toHaveLength(3);
    expect(body.accounts[0]).toMatchObject({
      name: expect.any(String),
      link: expect.objectContaining({ role: expect.any(String) }),
    });
    expect(Array.isArray(body.cases)).toBe(true);
  });

  it("404s on an unknown contact", async () => {
    await request(app).get("/api/contacts/99999").expect(404);
  });
});

describe("contact and link writes", () => {
  it("creates a contact and links it to an account", async () => {
    const contact = (
      await request(app)
        .post("/api/contacts")
        .set(asMe)
        .send({ firstName: "New", lastName: "Client", email: "new@client.example", title: "Member" })
        .expect(201)
    ).body;

    expect(contact).toMatchObject({ firstName: "New", ownerName: ME });

    const link = (
      await request(app)
        .post("/api/account-contacts")
        .set(asMe)
        .send({ accountId: 1, contactId: contact.id, role: "Member", ownershipPct: 25 })
        .expect(201)
    ).body;

    expect(link).toMatchObject({ accountId: 1, contactId: contact.id, role: "Member" });

    const detail = (await request(app).get(`/api/contacts/${contact.id}`).expect(200)).body;
    expect(detail.accounts.map((a: any) => a.id)).toContain(1);

    await request(app).delete(`/api/account-contacts/${link.id}`).expect(204);

    const after = (await request(app).get(`/api/contacts/${contact.id}`).expect(200)).body;
    expect(after.accounts).toHaveLength(0);
  });

  it("patches a contact", async () => {
    const { body } = await request(app)
      .patch("/api/contacts/1")
      .set(asMe)
      .send({ title: "Chief Executive" })
      .expect(200);

    expect(body.title).toBe("Chief Executive");
  });
});
