import { describe, it, expect } from "vitest";
import request from "supertest";
import { createTestApp, asMe } from "./helpers/app";
import {
  accountDetailPath,
  caseAccountLink,
  caseClientLink,
  clientDetailPath,
  type CaseLinkSource,
} from "../../cases/src/lib/caseLinks";

/**
 * Case Detail → Client and Account links.
 *
 * Regression: the Case Detail page used to link the customer's name to
 * /clients/{customer.id}. The legacy `customer` projection carries the
 * ACCOUNT id, so the link opened whichever Contact happened to share that
 * number — or a 404. The page now builds both links with lib/caseLinks.ts,
 * which is tested here (it imports nothing, so it runs under Node), both in
 * isolation and against real GET /api/cases/:id responses.
 *
 * Seed facts relied on (store.ts):
 *   Account #4  Patel Real Estate — primary contact #3 Hassan Patel.
 *               Contact #4 is someone else, so a swapped id is visible.
 *   CASE-004    account #6, primary contact #4 — ids differ.
 *   CASE-001    account #1, primary contact #1 — ids coincide numerically.
 */

const app = createTestApp();

const PATEL_REAL_ESTATE = 4;
const HASSAN = 3;

const getCase = (id: number) => request(app).get(`/api/cases/${id}`).set(asMe).expect(200);
const getAccount = (id: number) => request(app).get(`/api/accounts/${id}`).set(asMe);
const getContact = (id: number) => request(app).get(`/api/contacts/${id}`).set(asMe);

/** "/clients/12" → 12 */
const idFrom = (href: string, base: string) => {
  expect(href.startsWith(`${base}/`)).toBe(true);
  return Number(href.slice(base.length + 1));
};

function source(over: Partial<CaseLinkSource> = {}): CaseLinkSource {
  return {
    accountId: 6,
    account: { id: 6, name: "Northwind LLC" },
    primaryContactId: 4,
    primaryContact: { id: 4, firstName: "Dana", lastName: "Lee" },
    ...over,
  };
}

// ── The link builder on its own ─────────────────────────────────────────────
describe("caseLinks: building the links", () => {
  it("sends the Account link to /accounts/{accountId} and the Client link to /clients/{primaryContactId}", () => {
    const client = caseClientLink(source());
    const account = caseAccountLink(source());

    expect(account).toEqual({ href: "/accounts/6", label: "Northwind LLC" });
    expect(client).toEqual({
      kind: "linked",
      contactId: 4,
      link: { href: "/clients/4", label: "Dana Lee" },
    });
  });

  it("never lets one id stand in for the other", () => {
    // Distinct numbers so a swap in either direction changes the href.
    const c = source({
      accountId: 71,
      account: { id: 71, name: "Acme" },
      primaryContactId: 902,
      primaryContact: { id: 902, firstName: "Ana", lastName: "Ruiz" },
    });
    const client = caseClientLink(c);
    const account = caseAccountLink(c);

    expect(client.kind).toBe("linked");
    if (client.kind !== "linked") return;
    expect(client.link.href).toBe("/clients/902");
    expect(client.link.href).not.toContain("71");
    expect(account.href).toBe("/accounts/71");
    expect(account.href).not.toContain("902");
  });

  it("ignores any legacy `customer` field, whose id is the Account id", () => {
    const c = { ...source(), customer: { id: 6, name: "Dana Lee" } } as CaseLinkSource;
    const client = caseClientLink(c);

    expect(client.kind === "linked" && client.link.href).toBe("/clients/4");
  });

  it("builds no Client link when the Case has no primary Contact — even if one is embedded", () => {
    // The API embeds the Account's first Contact as a fallback when
    // primaryContactId is null. That is not the Case's primary Contact.
    const c = source({ primaryContactId: null });

    expect(caseClientLink(c)).toEqual({ kind: "none" });
    expect(caseAccountLink(c)).toEqual({ href: "/accounts/6", label: "Northwind LLC" });
  });

  it("does not borrow another Contact's name or link when the embedded Contact is a different record", () => {
    const c = source({
      primaryContactId: 4,
      primaryContact: { id: 9, firstName: "Someone", lastName: "Else" },
    });

    expect(caseClientLink(c)).toEqual({ kind: "unresolved", contactId: 4, label: "Client #4" });
  });

  it("reports an unresolved Client when primaryContactId is set but no Contact came back", () => {
    expect(caseClientLink(source({ primaryContact: null }))).toEqual({
      kind: "unresolved",
      contactId: 4,
      label: "Client #4",
    });
  });

  it("labels the Account by id if its record is missing or mismatched, but still links by accountId", () => {
    expect(caseAccountLink(source({ account: null }))).toEqual({
      href: "/accounts/6",
      label: "Account #6",
    });
    expect(caseAccountLink(source({ account: { id: 7, name: "Wrong Co" } }))).toEqual({
      href: "/accounts/6",
      label: "Account #6",
    });
  });

  it("uses the detail routes the app registers", () => {
    expect(accountDetailPath(12)).toBe("/accounts/12");
    expect(clientDetailPath(12)).toBe("/clients/12");
  });
});

// ── Against real API responses ──────────────────────────────────────────────
describe("caseLinks: against GET /api/cases/:id", () => {
  it("every seeded case links to its own Account and its own primary Contact", async () => {
    const { body: cases } = await request(app).get("/api/cases").set(asMe).expect(200);
    expect(cases.length).toBeGreaterThan(0);

    for (const summary of cases) {
      const { body: c } = await getCase(summary.id);
      const account = caseAccountLink(c);
      const client = caseClientLink(c);

      // Account link → the Case's accountId → an Account with that name.
      expect(idFrom(account.href, "/accounts")).toBe(c.accountId);
      const acc = await getAccount(c.accountId).expect(200);
      expect(account.label).toBe(acc.body.name);

      // Client link → the Case's primaryContactId → that Contact.
      expect(c.primaryContactId).not.toBeNull();
      expect(client.kind).toBe("linked");
      if (client.kind !== "linked") continue;
      expect(idFrom(client.link.href, "/clients")).toBe(c.primaryContactId);
      const contact = await getContact(c.primaryContactId).expect(200);
      expect(client.link.label).toBe(`${contact.body.firstName} ${contact.body.lastName}`);

      // The old bug: customer.id is the Account id.
      expect(c.customer.id).toBe(c.accountId);
      if (c.accountId !== c.primaryContactId) {
        expect(client.link.href).not.toBe(`/clients/${c.customer.id}`);
      }
    }
  });

  it("CASE-004 (account #6, contact #4): the Client link is /clients/4, not /clients/6", async () => {
    const { body: cases } = await request(app).get("/api/cases").set(asMe).expect(200);
    const summary = cases.find((c: any) => c.caseNumber === "CASE-004");
    const { body: c } = await getCase(summary.id);
    expect(c.accountId).toBe(6);
    expect(c.primaryContactId).toBe(4);

    const client = caseClientLink(c);
    expect(client.kind === "linked" && client.link.href).toBe("/clients/4");
    expect(caseAccountLink(c).href).toBe("/accounts/6");

    // What the old code linked to is a different person.
    const wrong = await getContact(6).expect(200);
    const right = await getContact(4).expect(200);
    expect(wrong.body.id).not.toBe(right.body.id);
    expect(client.kind === "linked" && client.link.label).toBe(
      `${right.body.firstName} ${right.body.lastName}`,
    );
  });

  it("a case whose ids collide across tables (account #4, contact #3) opens the right records", async () => {
    const created = await request(app)
      .post("/api/cases")
      .set(asMe)
      .send({ title: "Link check", accountId: PATEL_REAL_ESTATE, primaryContactId: HASSAN })
      .expect(201);
    const { body: c } = await getCase(created.body.id);

    const client = caseClientLink(c);
    const account = caseAccountLink(c);
    expect(client.kind === "linked" && client.link.href).toBe(`/clients/${HASSAN}`);
    expect(account.href).toBe(`/accounts/${PATEL_REAL_ESTATE}`);

    const hassan = await getContact(HASSAN).expect(200);
    const patelRE = await getAccount(PATEL_REAL_ESTATE).expect(200);
    expect(client.kind === "linked" && client.link.label).toBe("Hassan Patel");
    expect(`${hassan.body.firstName} ${hassan.body.lastName}`).toBe("Hassan Patel");
    expect(account.label).toBe(patelRE.body.name);

    // Swapped, each id names a different, real record.
    const contactFour = await getContact(PATEL_REAL_ESTATE).expect(200);
    expect(`${contactFour.body.firstName} ${contactFour.body.lastName}`).not.toBe("Hassan Patel");
    const accountThree = await getAccount(HASSAN).expect(200);
    expect(accountThree.body.name).not.toBe(patelRE.body.name);
  });

  it("a case without a primary Contact shows its Account and no Client link, despite the API's fallback contact", async () => {
    const created = await request(app)
      .post("/api/cases")
      .set(asMe)
      .send({ title: "No contact", accountId: PATEL_REAL_ESTATE })
      .expect(201);
    const { body: c } = await getCase(created.body.id);

    expect(c.primaryContactId).toBeNull();
    // The API still embeds the Account's first Contact for older pages…
    expect(c.primaryContact).not.toBeNull();
    // …which must not become a Client link.
    expect(caseClientLink(c)).toEqual({ kind: "none" });

    const account = caseAccountLink(c);
    const patelRE = await getAccount(PATEL_REAL_ESTATE).expect(200);
    expect(account).toEqual({ href: `/accounts/${PATEL_REAL_ESTATE}`, label: patelRE.body.name });
  });

  it("a case whose primaryContactId names a missing Contact gets no Client link", async () => {
    const created = await request(app)
      .post("/api/cases")
      .set(asMe)
      .send({ title: "Stale contact", accountId: PATEL_REAL_ESTATE, primaryContactId: HASSAN })
      .expect(201);
    // PATCH does not validate primaryContactId, so a stale id is reachable.
    await request(app)
      .patch(`/api/cases/${created.body.id}`)
      .set(asMe)
      .send({ primaryContactId: 999999 })
      .expect(200);
    await getContact(999999).expect(404);

    const { body: c } = await getCase(created.body.id);
    expect(c.primaryContactId).toBe(999999);
    expect(caseClientLink(c)).toEqual({ kind: "unresolved", contactId: 999999, label: "Client #999999" });
    expect(caseAccountLink(c).href).toBe(`/accounts/${PATEL_REAL_ESTATE}`);
  });
});
