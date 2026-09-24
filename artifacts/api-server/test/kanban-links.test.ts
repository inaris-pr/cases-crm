import { describe, it, expect } from "vitest";
// Every /api route requires a session: requests carry Iris's session cookie.
import { authedRequest as request } from "./helpers/app";
import { createTestApp, asMe } from "./helpers/app";
import { accountCardLinks, type AccountCardSource } from "../../cases/src/lib/caseLinks";

/**
 * Kanban board (Cases → Board) client card links.
 *
 * Regression: the card's "Open full portfolio" icon linked to
 * /clients/{customer.id}. The card is a row of GET /api/customers — an
 * ACCOUNT in the legacy Customer shape — so `id` is the Account id, and the
 * link opened whichever Contact shared that number.
 *
 * The card now links the company (and the portfolio icon) to
 * /accounts/{id}, and the person's name to /clients/{primaryContactId}, via
 * lib/caseLinks.accountCardLinks.
 *
 * Seed facts relied on (store.ts):
 *   Account #6 Mendoza Architecture PLLC — primary contact #4 Sofia Mendoza.
 *   Contact #6 is Robert Chen, a different person at a different company.
 */

const app = createTestApp();

const MENDOZA_ARCH = 6;
const SOFIA = 4;

const customers = async () => (await request(app).get("/api/customers").set(asMe).expect(200)).body;
const getContact = (id: number) => request(app).get(`/api/contacts/${id}`).set(asMe);
const getAccount = (id: number) => request(app).get(`/api/accounts/${id}`).set(asMe);

describe("accountCardLinks: building the links", () => {
  const row = (over: Partial<AccountCardSource> = {}): AccountCardSource => ({
    id: 6,
    name: "Sofia Mendoza",
    company: "Mendoza Architecture PLLC",
    primaryContactId: 4,
    ...over,
  });

  it("links the company by Account id and the person by Contact id", () => {
    expect(accountCardLinks(row())).toEqual({
      account: { href: "/accounts/6", label: "Mendoza Architecture PLLC" },
      client: { href: "/clients/4", label: "Sofia Mendoza" },
    });
  });

  it("never builds a Client link from the Account id", () => {
    const links = accountCardLinks(row({ id: 71, primaryContactId: 902 }));
    expect(links.client?.href).toBe("/clients/902");
    expect(links.client?.href).not.toBe("/clients/71");
    expect(links.account.href).toBe("/accounts/71");
  });

  it("builds no Client link for an account with no contact", () => {
    const links = accountCardLinks(
      row({ id: 30, name: "Contactless LLC", company: "Contactless LLC", primaryContactId: null }),
    );
    expect(links.client).toBeNull();
    expect(links.account).toEqual({ href: "/accounts/30", label: "Contactless LLC" });
  });

  it("labels the Account by id when the company name is missing", () => {
    expect(accountCardLinks(row({ company: null })).account).toEqual({
      href: "/accounts/6",
      label: "Account #6",
    });
  });
});

describe("accountCardLinks: against GET /api/customers", () => {
  it("Mendoza Architecture (account #6) links to /accounts/6 and to Sofia at /clients/4 — not /clients/6", async () => {
    const row = (await customers()).find((c: any) => c.id === MENDOZA_ARCH);
    expect(row.primaryContactId).toBe(SOFIA);

    const links = accountCardLinks(row);
    expect(links.account.href).toBe(`/accounts/${MENDOZA_ARCH}`);
    expect(links.client?.href).toBe(`/clients/${SOFIA}`);
    expect(links.client?.label).toBe("Sofia Mendoza");

    // The old link target is someone else entirely.
    const wrong = (await getContact(MENDOZA_ARCH).expect(200)).body;
    expect(`${wrong.firstName} ${wrong.lastName}`).not.toBe("Sofia Mendoza");
  });

  it("every card's name link opens the Contact it names, who is linked to that Account", async () => {
    const rows = await customers();
    let differing = 0;

    for (const row of rows) {
      const links = accountCardLinks(row);

      // Company → the Account itself.
      const acc = (await getAccount(row.id).expect(200)).body;
      expect(links.account.href).toBe(`/accounts/${row.id}`);
      expect(links.account.label).toBe(acc.name);

      if (row.primaryContactId == null) {
        expect(links.client).toBeNull();
        continue;
      }
      if (row.primaryContactId !== row.id) differing++;

      // Name → the Contact whose name is on the card.
      expect(links.client?.href).toBe(`/clients/${row.primaryContactId}`);
      const contact = (await getContact(row.primaryContactId).expect(200)).body;
      expect(`${contact.firstName} ${contact.lastName}`).toBe(row.name);
      expect(acc.contacts.map((c: any) => c.id)).toContain(row.primaryContactId);
    }

    // The seed must contain cards where the two ids differ, or this test
    // could not tell them apart.
    expect(differing).toBeGreaterThan(5);
  });

  it("an account with no contacts gets a company link and no client link", async () => {
    const created = await request(app)
      .post("/api/accounts")
      .set(asMe)
      .send({ name: "Board Link Check LLC" })
      .expect(201);
    const row = (await customers()).find((c: any) => c.id === created.body.id);

    expect(row.primaryContactId).toBeNull();
    expect(accountCardLinks(row)).toEqual({
      account: { href: `/accounts/${created.body.id}`, label: "Board Link Check LLC" },
      client: null,
    });
  });
});
