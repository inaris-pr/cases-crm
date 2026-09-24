import { describe, it, expect } from "vitest";
// Every /api route requires a session: requests carry Iris's session cookie.
import { authedRequest as request } from "./helpers/app";
import { createTestApp, asMe } from "./helpers/app";

const app = createTestApp();

/**
 * PATCH /api/cases/:id — Account / primary Contact rules.
 *
 * POST /cases already required an existing Account and, when a primary
 * Contact is given, a Contact actively linked to that Account. PATCH now
 * enforces the same rules on the relationship the case would have after the
 * update, and accepts `accountId` so a case can be moved between accounts.
 *
 * Seed facts relied on (store.ts):
 *   Account #1  Helix Labs LLC       — one contact: #1 Amelia Reyes
 *   Account #10 Casa Verde Tacos LLC — contacts #10, #11, #12
 *   Contact #3  Hassan Patel         — linked to accounts #3, #4, #5
 */

const HELIX = 1;
const AMELIA = 1;
const CASA_VERDE = 10;
const CASA_CONTACT = 11;
const HASSAN = 3;
const PATEL_RE = 4; // one of Hassan's accounts
const PATEL_OTHER = 5; // another of Hassan's accounts
const NO_SUCH_ID = 999999;

async function newCase(body: Record<string, unknown>) {
  const { body: c } = await request(app)
    .post("/api/cases")
    .set(asMe)
    .send({ title: "Update validation", ...body })
    .expect(201);
  return c;
}
const patch = (id: number, body: Record<string, unknown>) =>
  request(app).patch(`/api/cases/${id}`).set(asMe).send(body);
const stored = async (id: number) =>
  (await request(app).get(`/api/cases/${id}`).set(asMe).expect(200)).body;

/**
 * A fresh account linked to the given contacts. Tests that END a link use one
 * of these, so they never disturb the seed links other tests rely on.
 */
async function isolatedAccount(name: string, contactIds: number[]) {
  const { body: acc } = await request(app).post("/api/accounts").set(asMe).send({ name }).expect(201);
  const linkIds: Record<number, number> = {};
  for (const contactId of contactIds) {
    const { body: link } = await request(app)
      .post("/api/account-contacts")
      .set(asMe)
      .send({ accountId: acc.id, contactId, role: "Member" })
      .expect(201);
    linkIds[contactId] = link.id;
  }
  return { accountId: acc.id as number, linkIds };
}
const endLink = (linkId: number) =>
  request(app)
    .patch(`/api/account-contacts/${linkId}`)
    .set(asMe)
    .send({ endedAt: new Date().toISOString() })
    .expect(200);

/** A rejected update must leave the case exactly as it was. */
async function expectUnchanged(before: any) {
  const after = await stored(before.id);
  expect(after.accountId).toBe(before.accountId);
  expect(after.primaryContactId).toBe(before.primaryContactId);
  expect(after.status).toBe(before.status);
  expect(after.title).toBe(before.title);
  expect(after.updatedAt).toBe(before.updatedAt);
}

describe("partial updates that leave the relationship alone", () => {
  it("change status, priority, title, description and tags on a case with a contact", async () => {
    const c = await newCase({ accountId: PATEL_RE, primaryContactId: HASSAN });
    const { body } = await patch(c.id, {
      status: "in_progress",
      priority: "high",
      title: "Renamed",
      description: "More detail",
      tags: ["billing"],
    }).expect(200);

    expect(body).toMatchObject({
      status: "in_progress",
      priority: "high",
      title: "Renamed",
      description: "More detail",
      tags: ["billing"],
      accountId: PATEL_RE,
      primaryContactId: HASSAN,
    });
  });

  it("work on a case with no primary contact, which stays without one", async () => {
    const c = await newCase({ accountId: HELIX });
    expect(c.primaryContactId).toBeNull();

    const { body } = await patch(c.id, { status: "review" }).expect(200);
    expect(body.status).toBe("review");
    expect(body.primaryContactId).toBeNull();
  });

  it("work even when the case's existing contact link has since ended", async () => {
    const { accountId, linkIds } = await isolatedAccount("Ended Link LLC", [HASSAN]);
    const c = await newCase({ accountId, primaryContactId: HASSAN });
    await endLink(linkIds[HASSAN]);

    // Unrelated edit, and a resend of the unchanged relationship: both fine.
    await patch(c.id, { priority: "critical" }).expect(200);
    const { body } = await patch(c.id, {
      accountId,
      primaryContactId: HASSAN,
      title: "Resent as-is",
    }).expect(200);
    expect(body).toMatchObject({ accountId, primaryContactId: HASSAN, title: "Resent as-is" });
  });
});

describe("changing the primary contact", () => {
  it("accepts a contact linked to the case's account", async () => {
    const c = await newCase({ accountId: CASA_VERDE, primaryContactId: 10 });
    const { body } = await patch(c.id, { primaryContactId: CASA_CONTACT }).expect(200);
    expect(body.primaryContactId).toBe(CASA_CONTACT);
    expect(body.primaryContact.id).toBe(CASA_CONTACT);
  });

  it("adds a contact to a case that had none", async () => {
    const c = await newCase({ accountId: HELIX });
    const { body } = await patch(c.id, { primaryContactId: AMELIA }).expect(200);
    expect(body.primaryContactId).toBe(AMELIA);
  });

  it("rejects a contact that does not exist", async () => {
    const c = await newCase({ accountId: PATEL_RE, primaryContactId: HASSAN });
    const res = await patch(c.id, { primaryContactId: NO_SUCH_ID }).expect(400);
    expect(res.body.error).toBe("unknown_contact");
    await expectUnchanged(c);
  });

  it("rejects a real contact who is not linked to the case's account", async () => {
    const c = await newCase({ accountId: PATEL_RE, primaryContactId: HASSAN });
    const res = await patch(c.id, { primaryContactId: AMELIA }).expect(400);
    expect(res.body.error).toBe("contact_not_linked_to_account");
    await expectUnchanged(c);
  });

  it("rejects a contact whose link to the account has ended", async () => {
    const { accountId, linkIds } = await isolatedAccount("Former Partner LLC", [AMELIA, CASA_CONTACT]);
    const c = await newCase({ accountId, primaryContactId: AMELIA });
    await endLink(linkIds[CASA_CONTACT]);

    const res = await patch(c.id, { primaryContactId: CASA_CONTACT }).expect(400);
    expect(res.body.error).toBe("contact_not_linked_to_account");
    await expectUnchanged(c);
  });

  it("clears the contact with null — and does not fill in another one", async () => {
    const c = await newCase({ accountId: HELIX, primaryContactId: AMELIA });
    const { body } = await patch(c.id, { primaryContactId: null }).expect(200);
    expect(body.primaryContactId).toBeNull();
    expect((await stored(c.id)).primaryContactId).toBeNull();
  });
});

describe("changing the account", () => {
  it("rejects an account that does not exist", async () => {
    const c = await newCase({ accountId: HELIX, primaryContactId: AMELIA });
    const res = await patch(c.id, { accountId: NO_SUCH_ID }).expect(400);
    expect(res.body.error).toBe("unknown_account");
    await expectUnchanged(c);
  });

  it("rejects an unknown account even when the contact is being cleared", async () => {
    const c = await newCase({ accountId: HELIX, primaryContactId: AMELIA });
    const res = await patch(c.id, { accountId: NO_SUCH_ID, primaryContactId: null }).expect(400);
    expect(res.body.error).toBe("unknown_account");
    await expectUnchanged(c);
  });

  it("keeps the contact when they are also linked to the new account", async () => {
    const c = await newCase({ accountId: PATEL_RE, primaryContactId: HASSAN });
    const { body } = await patch(c.id, { accountId: PATEL_OTHER }).expect(200);
    expect(body).toMatchObject({ accountId: PATEL_OTHER, primaryContactId: HASSAN });
  });

  it("rejects a move that would strand the current contact, and changes nothing", async () => {
    const c = await newCase({ accountId: PATEL_RE, primaryContactId: HASSAN });
    const res = await patch(c.id, { accountId: HELIX, status: "in_progress" }).expect(400);
    expect(res.body.error).toBe("primary_contact_not_linked_to_account");
    expect(typeof res.body.message).toBe("string");
    // Not moved, not reassigned to Helix's contact, status not applied.
    await expectUnchanged(c);
  });

  it("accepts the move with a replacement contact linked to the new account", async () => {
    const c = await newCase({ accountId: PATEL_RE, primaryContactId: HASSAN });
    const { body } = await patch(c.id, { accountId: HELIX, primaryContactId: AMELIA }).expect(200);
    expect(body).toMatchObject({ accountId: HELIX, primaryContactId: AMELIA });
    expect(body.account.id).toBe(HELIX);
  });

  it("rejects the move when the replacement contact is not linked to the new account", async () => {
    const c = await newCase({ accountId: PATEL_RE, primaryContactId: HASSAN });
    const res = await patch(c.id, { accountId: HELIX, primaryContactId: CASA_CONTACT }).expect(400);
    expect(res.body.error).toBe("contact_not_linked_to_account");
    await expectUnchanged(c);
  });

  it("rejects the move when the replacement is linked to the OLD account only", async () => {
    const c = await newCase({ accountId: CASA_VERDE, primaryContactId: 10 });
    const res = await patch(c.id, { accountId: HELIX, primaryContactId: CASA_CONTACT }).expect(400);
    expect(res.body.error).toBe("contact_not_linked_to_account");
    await expectUnchanged(c);
  });

  it("accepts the move when the contact is explicitly cleared, and does not pick a new one", async () => {
    const c = await newCase({ accountId: PATEL_RE, primaryContactId: HASSAN });
    const { body } = await patch(c.id, { accountId: HELIX, primaryContactId: null }).expect(200);
    expect(body).toMatchObject({ accountId: HELIX, primaryContactId: null });

    const after = await stored(c.id);
    expect(after.primaryContactId).toBeNull();
    // The response still embeds a stand-in contact for older pages; the
    // stored relationship is what matters and it was not reassigned.
    expect(after.primaryContact?.id ?? null).not.toBe(HASSAN);
  });

  it("moves a case that has no primary contact", async () => {
    const c = await newCase({ accountId: HELIX });
    const { body } = await patch(c.id, { accountId: CASA_VERDE }).expect(200);
    expect(body).toMatchObject({ accountId: CASA_VERDE, primaryContactId: null });
  });

  it("treats resending the current account as no change", async () => {
    const c = await newCase({ accountId: PATEL_RE, primaryContactId: HASSAN });
    const { body } = await patch(c.id, { accountId: PATEL_RE, priority: "low" }).expect(200);
    expect(body).toMatchObject({ accountId: PATEL_RE, primaryContactId: HASSAN, priority: "low" });
  });
});

describe("malformed relationship fields", () => {
  it("rejects a non-numeric or non-positive id as a validation error", async () => {
    const c = await newCase({ accountId: HELIX, primaryContactId: AMELIA });
    for (const bad of [{ primaryContactId: "1" }, { primaryContactId: 0 }, { accountId: -2 }, { accountId: null }]) {
      const res = await patch(c.id, bad).expect(400);
      expect(res.body.error).toBe("validation_error");
    }
    await expectUnchanged(c);
  });

  it("still returns 404 for a case that does not exist", async () => {
    await patch(NO_SUCH_ID, { accountId: HELIX }).expect(404);
  });
});
