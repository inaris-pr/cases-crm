import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp, ME, asMe } from "./helpers/app";

const app = createTestApp();

/**
 * Creating cases from an Account page and from a Client page.
 *
 * Seed facts these tests rely on (from store.ts):
 *   Account #1  Helix Labs LLC        — exactly one contact: #1 Amelia Reyes
 *   Account #10 Casa Verde Tacos LLC  — three contacts: #10, #11, #12
 *   Contact #3  Hassan Patel          — linked to three accounts: #3, #4, #5
 *
 * Auto-selecting a sole contact and offering a dropdown for several are UI
 * behaviours with no frontend test harness. What is tested here is the data
 * contract the form is built on, and the server-side enforcement that stops a
 * bad combination even if the UI were bypassed.
 */

const HELIX = 1; // one contact
const AMELIA = 1;
const CASA_VERDE = 10; // three contacts
const CASA_CONTACTS = [10, 11, 12];
const HASSAN = 3; // three accounts
const HASSAN_ACCOUNTS = [3, 4, 5];

/** Returns supertest's chain (not a Promise) so callers can .expect() on it. */
function createCase(body: Record<string, unknown>) {
  return request(app).post("/api/cases").set(asMe).send({ title: "Contextual case", ...body });
}

describe("creating a case from an Account", () => {
  it("offers exactly the account's one contact, which the form auto-selects", async () => {
    const { body } = await request(app).get("/api/contacts").query({ accountId: HELIX }).expect(200);

    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(AMELIA);
  });

  it("offers every linked contact when there are several, for the dropdown", async () => {
    const { body } = await request(app)
      .get("/api/contacts")
      .query({ accountId: CASA_VERDE })
      .expect(200);

    expect(body.map((c: any) => c.id).sort((a: number, b: number) => a - b)).toEqual(CASA_CONTACTS);
  });

  it("supplies the contact's email and phone for display", async () => {
    const { body } = await request(app).get("/api/contacts").query({ accountId: HELIX }).expect(200);

    expect(body[0]).toMatchObject({
      fullName: "Amelia Reyes",
      email: "amelia@helixlabs.io",
      phone: "+1 415 555 0144",
    });
  });

  it("creates the case against the account and the sole contact", async () => {
    const { body } = await createCase({
      title: "Annual report — Helix",
      accountId: HELIX,
      primaryContactId: AMELIA,
    }).expect(201);

    expect(body).toMatchObject({ accountId: HELIX, primaryContactId: AMELIA, ownerName: ME });
  });

  it("records whichever of several contacts was chosen", async () => {
    for (const contactId of CASA_CONTACTS) {
      const { body } = await createCase({
        title: `Casa Verde case for contact ${contactId}`,
        accountId: CASA_VERDE,
        primaryContactId: contactId,
      }).expect(201);
      expect(body.primaryContactId).toBe(contactId);
      expect(body.accountId).toBe(CASA_VERDE);
    }
  });

  it("reads contact details through the relationship rather than copying them", async () => {
    const { body } = await createCase({
      title: "Derived contact details",
      accountId: HELIX,
      primaryContactId: AMELIA,
    }).expect(201);

    // The case record itself carries no email or phone…
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("phone");
    // …they arrive with the embedded primary contact.
    expect(body.primaryContact).toMatchObject({
      id: AMELIA,
      email: "amelia@helixlabs.io",
      phone: "+1 415 555 0144",
    });
  });

  it("shows the new case in that account's Cases tab immediately", async () => {
    const created = (
      await createCase({ title: "Visible on the account", accountId: HELIX, primaryContactId: AMELIA }).expect(201)
    ).body;

    const account = (await request(app).get(`/api/accounts/${HELIX}`).expect(200)).body;
    expect(account.cases.map((c: any) => c.id)).toContain(created.id);
  });
});

describe("creating a case from a Client", () => {
  it("restricts the account choices to the client's own accounts", async () => {
    const { body } = await request(app).get(`/api/contacts/${HASSAN}`).expect(200);

    expect(body.accounts.map((a: any) => a.id).sort((a: number, b: number) => a - b)).toEqual(HASSAN_ACCOUNTS);
    expect(body).toMatchObject({ fullName: "Hassan Patel" });
    expect(body).toHaveProperty("email");
    expect(body).toHaveProperty("phone");
  });

  it("creates the case against the chosen account and the client", async () => {
    const { body } = await createCase({
      title: "Real-estate matter",
      accountId: 4,
      primaryContactId: HASSAN,
    }).expect(201);

    expect(body).toMatchObject({ accountId: 4, primaryContactId: HASSAN });
  });

  it("files the case under the account that was picked, not any other", async () => {
    const created = (
      await createCase({ title: "Capital matter", accountId: 5, primaryContactId: HASSAN }).expect(201)
    ).body;

    const picked = (await request(app).get("/api/accounts/5").expect(200)).body;
    const other = (await request(app).get("/api/accounts/3").expect(200)).body;
    expect(picked.cases.map((c: any) => c.id)).toContain(created.id);
    expect(other.cases.map((c: any) => c.id)).not.toContain(created.id);
  });

  it("shows the new case on the account, on the client and in the main list", async () => {
    const created = (
      await createCase({ title: "Visible everywhere", accountId: 3, primaryContactId: HASSAN }).expect(201)
    ).body;

    const account = (await request(app).get("/api/accounts/3").expect(200)).body;
    const client = (await request(app).get(`/api/contacts/${HASSAN}`).expect(200)).body;
    const all = (await request(app).get("/api/cases").expect(200)).body;

    expect(account.cases.map((c: any) => c.id)).toContain(created.id);
    expect(client.cases.map((c: any) => c.id)).toContain(created.id);
    expect(all.map((c: any) => c.id)).toContain(created.id);
  });

  it("lets a client with no accounts be linked, then have a case — without duplicating anyone", async () => {
    const contactsBefore = (await request(app).get("/api/contacts").expect(200)).body.length;
    const accountsBefore = (await request(app).get("/api/accounts").expect(200)).body.length;

    const loner = (
      await request(app)
        .post("/api/contacts")
        .set(asMe)
        .send({ firstName: "Nora", lastName: "Unlinked", email: "nora@example.com" })
        .expect(201)
    ).body;
    expect((await request(app).get(`/api/contacts/${loner.id}`).expect(200)).body.accounts).toEqual([]);

    // With no account, a case cannot be filed for her.
    await createCase({ accountId: HELIX, primaryContactId: loner.id }).expect(400);

    // Linking adds only a link record.
    await request(app)
      .post("/api/account-contacts")
      .set(asMe)
      .send({ accountId: HELIX, contactId: loner.id, role: "Member" })
      .expect(201);

    const linked = (await request(app).get(`/api/contacts/${loner.id}`).expect(200)).body;
    expect(linked.accounts.map((a: any) => a.id)).toEqual([HELIX]);

    await createCase({ title: "Now possible", accountId: HELIX, primaryContactId: loner.id }).expect(201);

    // One contact was added on purpose; linking created no further accounts or contacts.
    expect((await request(app).get("/api/contacts").expect(200)).body.length).toBe(contactsBefore + 1);
    expect((await request(app).get("/api/accounts").expect(200)).body.length).toBe(accountsBefore);
  });
});

describe("preventing invalid account/contact combinations", () => {
  it("rejects a contact who is not linked to the chosen account", async () => {
    // Hassan is linked to accounts 3-5, not to Helix.
    const { body } = await createCase({ accountId: HELIX, primaryContactId: HASSAN }).expect(400);
    expect(body.error).toBe("contact_not_linked_to_account");
  });

  it("rejects a contact that does not exist", async () => {
    const { body } = await createCase({ accountId: HELIX, primaryContactId: 99999 }).expect(400);
    expect(body.error).toBe("unknown_contact");
  });

  it("rejects a contact whose link to the account has been removed", async () => {
    const person = (
      await request(app)
        .post("/api/contacts")
        .set(asMe)
        .send({ firstName: "Former", lastName: "Member" })
        .expect(201)
    ).body;
    const link = (
      await request(app)
        .post("/api/account-contacts")
        .set(asMe)
        .send({ accountId: CASA_VERDE, contactId: person.id, role: "Member" })
        .expect(201)
    ).body;
    await createCase({ accountId: CASA_VERDE, primaryContactId: person.id }).expect(201);

    await request(app).delete(`/api/account-contacts/${link.id}`).expect(204);

    const { body } = await createCase({ accountId: CASA_VERDE, primaryContactId: person.id }).expect(400);
    expect(body.error).toBe("contact_not_linked_to_account");
  });

  it("still rejects an unknown account before looking at the contact", async () => {
    const { body } = await createCase({ accountId: 99999, primaryContactId: AMELIA }).expect(400);
    expect(body.error).toBe("unknown_account");
  });

  it("creates nothing when it rejects", async () => {
    const before = (await request(app).get("/api/cases").expect(200)).body.length;
    await createCase({ accountId: HELIX, primaryContactId: HASSAN }).expect(400);
    expect((await request(app).get("/api/cases").expect(200)).body.length).toBe(before);
  });
});

describe("existing case creation is preserved", () => {
  it("still creates a case with no primary contact, as the Cases section always has", async () => {
    const { body } = await createCase({ title: "No contact", accountId: HELIX }).expect(201);
    expect(body.primaryContactId).toBeNull();
  });

  it("still accepts the legacy customerId field", async () => {
    const { body } = await createCase({ title: "Legacy caller", customerId: HELIX }).expect(201);
    expect(body.accountId).toBe(HELIX);
  });

  it("still requires a title and an account", async () => {
    await request(app).post("/api/cases").set(asMe).send({ accountId: HELIX, title: "" }).expect(400);
    const { body } = await request(app).post("/api/cases").set(asMe).send({ title: "No account" }).expect(400);
    expect(body.error).toBe("missing_account");
  });

  it("keeps every existing field, default and response shape", async () => {
    const { body } = await createCase({
      title: "Full shape",
      accountId: HELIX,
      primaryContactId: AMELIA,
      status: "review",
      priority: "high",
      description: "details",
      tags: ["one", "two"],
    }).expect(201);

    expect(body).toMatchObject({
      title: "Full shape",
      status: "review",
      priority: "high",
      description: "details",
      tags: ["one", "two"],
      caseNumber: expect.stringMatching(/^CASE-\d{3}$/),
    });
    // Relations and the legacy projection the board relies on are unchanged.
    expect(body).toHaveProperty("account");
    expect(body).toHaveProperty("primaryContact");
    expect(body).toHaveProperty("customer");
    expect(body.customerId).toBe(body.accountId);
  });

  it("does not modify the account or the contact when a case is created", async () => {
    const accountBefore = (await request(app).get(`/api/accounts/${HELIX}`).expect(200)).body;
    const contactBefore = (await request(app).get(`/api/contacts/${AMELIA}`).expect(200)).body;

    await createCase({ title: "Leaves records alone", accountId: HELIX, primaryContactId: AMELIA }).expect(201);

    const accountAfter = (await request(app).get(`/api/accounts/${HELIX}`).expect(200)).body;
    const contactAfter = (await request(app).get(`/api/contacts/${AMELIA}`).expect(200)).body;

    // Everything except the case lists and their counts is identical.
    const strip = (x: any) => {
      const { cases, caseCount, openCaseCount, ...rest } = x;
      return rest;
    };
    expect(strip(accountAfter)).toEqual(strip(accountBefore));
    expect(strip(contactAfter)).toEqual(strip(contactBefore));
  });
});
