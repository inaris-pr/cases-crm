import { describe, it, expect } from "vitest";
import request from "supertest";
import { store } from "../src/store";
import { createTestApp, loginAs } from "./helpers/app";

/**
 * RBAC Phase 3 — record scope, response shaping, Account redaction and field
 * rules, messages, mentions and the lead-conversion first-Case rule.
 * The capability gate per route is in route-guards.test.ts.
 */
const app = createTestApp();

const as = {
  iris: loginAs("iris@example.com"), // System Owner
  devon: loginAs("devon@example.com"), // CSR (Customer Service member)
  sara: loginAs("sara@example.com"), // CSR (Customer Service member)
  nadia: loginAs("nadia@example.com"), // CSR Supervisor (supervises Devon, Sara)
  leo: loginAs("leo@example.com"), // Business Advisor
  grace: loginAs("grace@example.com"), // BA Supervisor (supervises Leo)
  omar: loginAs("omar@example.com"), // Admin
  rachel: loginAs("rachel@example.com"), // Admin Supervisor
  tessa: loginAs("tessa@example.com"), // HR
};
type Who = keyof typeof as;

function api(who: Who) {
  const go = async (method: "get" | "post" | "patch" | "delete", url: string, body?: unknown) => {
    const cookie = await as[who];
    const r = request(app)[method](`/api${url}`).set(cookie);
    return body === undefined ? r : r.send(body as object);
  };
  return {
    get: (url: string) => go("get", url),
    post: (url: string, body?: unknown) => go("post", url, body ?? {}),
    patch: (url: string, body: unknown) => go("patch", url, body),
    del: (url: string) => go("delete", url),
  };
}

const caseOwnedBy = (name: string) => store.cases.find((c) => c.ownerName === name)!;
const accountOwnedBy = (name: string) => store.accounts.find((a) => a.ownerName === name)!;

/** Every key anywhere in a JSON value. */
function keysIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysIn(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysIn(v, out);
    }
  }
  return out;
}

// ── Case scope ───────────────────────────────────────────────────────────────

describe("case scope", () => {
  it("a CSR edits only their own cases, but may work any case", async () => {
    const own = caseOwnedBy("Devon Park");
    const other = caseOwnedBy("Sara Mitchell");
    expect((await api("devon").patch(`/cases/${own.id}`, { description: "mine" })).status).toBe(200);

    const denied = await api("devon").patch(`/cases/${other.id}`, { description: "not mine" });
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: "out_of_scope", permission: "cases.edit" });
    expect(store.cases.find((c) => c.id === other.id)!.description).not.toBe("not mine");

    // cases.work is company-wide: a CSR can log a call and comment on it.
    expect((await api("devon").get(`/cases/${other.id}`)).status).toBe(200);
    expect(
      (await api("devon").post(`/cases/${other.id}/contacts`, {
        direction: "inbound", channel: "phone", summary: "Customer called", contact: "Client",
      })).status,
    ).toBe(201);
    expect((await api("devon").post(`/cases/${other.id}/thread`, { body: "Took a call" })).status).toBe(201);
  });

  it("a CSR Supervisor edits their team's cases, not other departments'", async () => {
    expect((await api("nadia").patch(`/cases/${caseOwnedBy("Devon Park").id}`, { priority: "high" })).status).toBe(200);
    expect((await api("nadia").patch(`/cases/${caseOwnedBy("Sara Mitchell").id}`, { priority: "high" })).status).toBe(200);
    const res = await api("nadia").patch(`/cases/${caseOwnedBy("Iris Burgos").id}`, { priority: "high" });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("out_of_scope");
  });

  it("an Admin Supervisor edits any case; an Admin only their own", async () => {
    expect((await api("rachel").patch(`/cases/${caseOwnedBy("Iris Burgos").id}`, { priority: "low" })).status).toBe(200);
    expect((await api("omar").patch(`/cases/${caseOwnedBy("Iris Burgos").id}`, { priority: "low" })).status).toBe(403);
    const created = await api("omar").post("/cases", { title: "Omar's case", accountId: 1 });
    expect(created.status).toBe(201);
    expect(created.body.ownerName).toBe("Omar Haddad");
    expect((await api("omar").patch(`/cases/${created.body.id}`, { priority: "high" })).status).toBe(200);
  });

  it("case automations follow the case owner; globals need manage_global", async () => {
    const own = caseOwnedBy("Devon Park");
    const other = caseOwnedBy("Sara Mitchell");
    expect((await api("devon").post(`/cases/${own.id}/automations`, { name: "Mine" })).status).toBe(201);
    const outside = await api("devon").post(`/cases/${other.id}/automations`, { name: "Not mine" });
    expect(outside.body).toEqual({ error: "out_of_scope", permission: "automations.edit" });

    const global = await api("devon").post(`/cases/${own.id}/automations`, { name: "Everyone", scope: "global" });
    expect(global.status).toBe(403);
    expect(global.body).toEqual({ error: "forbidden", permission: "automations.manage_global" });

    const made = await api("rachel").post(`/cases/${own.id}/automations`, { name: "Shared", scope: "global" });
    expect(made.status).toBe(201);
    const edit = await api("devon").patch(`/automations/${made.body.id}`, { name: "Hijacked" });
    expect(edit.body).toEqual({ error: "forbidden", permission: "automations.manage_global" });
    expect((await api("rachel").patch(`/automations/${made.body.id}`, { name: "Shared v2" })).status).toBe(200);
  });
});

// ── Lead scope ───────────────────────────────────────────────────────────────

describe("lead scope", () => {
  it("a Business Advisor sees and edits only their own leads", async () => {
    const mine = await api("leo").post("/leads", { firstName: "Leo's", lastName: "Prospect" });
    expect(mine.status).toBe(201);
    const grace = await api("grace").post("/leads", { firstName: "Grace's", lastName: "Prospect" });

    const list = (await api("leo").get("/leads")).body as any[];
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((l) => l.ownerName === "Leo Martinez")).toBe(true);

    // Out of view scope → 404: the record's existence is not revealed.
    expect((await api("leo").patch(`/leads/${grace.body.id}`, { notes: "x" })).status).toBe(404);
    expect((await api("leo").post(`/leads/${grace.body.id}/convert`, { accountName: "X", linkRole: "Owner" })).status).toBe(404);
    expect((await api("leo").patch(`/leads/${mine.body.id}`, { notes: "working it" })).status).toBe(200);

    // No leads.delete, no leads.assign.
    expect((await api("leo").del(`/leads/${mine.body.id}`)).body).toEqual({ error: "forbidden", permission: "leads.delete" });
    const assign = await api("leo").patch(`/leads/${mine.body.id}`, { ownerName: "Grace Kim", notes: "x" });
    expect(assign.body).toEqual({ error: "forbidden_fields", fields: ["ownerName"] });
    expect(store.leads.find((l) => l.id === mine.body.id)!.notes).toBe("working it"); // atomic
  });

  it("a BA Supervisor sees the team's leads and reassigns only inside the team", async () => {
    const leos = await api("leo").post("/leads", { firstName: "Team", lastName: "Lead" });
    const list = (await api("grace").get("/leads")).body as any[];
    expect(list.some((l) => l.id === leos.body.id)).toBe(true);
    expect(list.every((l) => ["Leo Martinez", "Grace Kim"].includes(l.ownerName))).toBe(true);

    const out = await api("grace").patch(`/leads/${leos.body.id}`, { ownerName: "Iris Burgos" });
    expect(out.body).toEqual({ error: "forbidden_fields", fields: ["ownerName"] });
    expect((await api("grace").patch(`/leads/${leos.body.id}`, { ownerName: "Grace Kim" })).status).toBe(200);
    expect((await api("grace").del(`/leads/${leos.body.id}`)).status).toBe(204);
  });
});

// ── Leads never reach CSR / Admin / HR ───────────────────────────────────────

const LEAD_ONLY_KEYS = ["estimatedValue", "intendedState", "intendedEntityType", "convertedContactId"];
const GET_URLS = [
  "/cases", "/cases/1", "/accounts", "/accounts/1", "/contacts", "/contacts/1", "/customers",
  "/customers/1", "/tasks", "/documents", "/cases/1/thread", "/cases/1/contacts", "/mentions",
  "/team", "/automations", "/stats", "/conversations", "/auth/me",
];

describe("CSR, Admin and HR never receive lead data", () => {
  for (const who of ["devon", "nadia", "omar", "rachel", "tessa"] as Who[]) {
    it(`${who}: every lead route is 403 and no response carries lead fields`, async () => {
      for (const [m, url] of [["get", "/leads"], ["post", "/leads"], ["patch", "/leads/1"], ["post", "/leads/1/convert"], ["delete", "/leads/1"]]) {
        const res = m === "get" ? await api(who).get(url) : m === "delete" ? await api(who).del(url)
          : m === "patch" ? await api(who).patch(url, { notes: "x" }) : await api(who).post(url, { firstName: "a", lastName: "b", accountName: "c", linkRole: "d" });
        expect(`${m} ${url} ${res.status} ${res.body.error}`).toBe(`${m} ${url} 403 forbidden`);
      }
      for (const url of GET_URLS) {
        const res = await api(who).get(url);
        const leaked = LEAD_ONLY_KEYS.filter((k) => keysIn(res.body).has(k));
        expect(`${url}: ${leaked.join(",")}`).toBe(`${url}: `);
      }
    });
  }
});

// ── Cases never reach Business Advisors / HR ─────────────────────────────────

const CASE_KEYS = ["caseNumber", "caseCount", "openCaseCount", "cases", "caseId", "caseTitle"];

describe("Business Advisors and HR never receive case data", () => {
  it("case routes are refused and record responses carry no case information", async () => {
    // Iris tags a case in a DM with Leo; Leo must not see the tag.
    const dm = await api("iris").post("/conversations", { type: "dm", members: ["Iris Burgos", "Leo Martinez"] });
    await api("iris").post(`/conversations/${dm.body.id}/messages`, { content: "see case", caseTags: [1] });
    expect((await api("iris").get(`/conversations/${dm.body.id}/messages`)).body[0].caseTags).toHaveLength(1);

    for (const who of ["leo", "grace", "tessa"] as Who[]) {
      for (const url of ["/cases", "/cases/1", "/tasks", "/documents", "/cases/1/thread", "/cases/1/contacts", "/cases/1/automations", "/automations", "/stats"]) {
        const res = await api(who).get(url);
        expect(`${who} ${url} ${res.status}`).toBe(`${who} ${url} 403`);
      }
      for (const url of ["/accounts", "/accounts/1", "/contacts", "/contacts/1", "/customers", "/customers/1", "/mentions", "/conversations", "/auth/me"]) {
        const res = await api(who).get(url);
        if (res.status !== 200) continue; // HR has no records at all
        const leaked = CASE_KEYS.filter((k) => keysIn(res.body).has(k));
        expect(`${who} ${url}: ${leaked.join(",")}`).toBe(`${who} ${url}: `);
      }
    }
    const leoMsgs = await api("leo").get(`/conversations/${dm.body.id}/messages`);
    expect(leoMsgs.status).toBe(200);
    expect(leoMsgs.body[0].caseTags).toEqual([]);
  });

  it("HR has no customer records at all", async () => {
    for (const url of ["/accounts", "/contacts", "/customers", "/leads", "/cases"]) {
      expect((await api("tessa").get(url)).status).toBe(403);
    }
  });
});

// ── Account redaction (R2.2) ─────────────────────────────────────────────────

describe("Account redaction", () => {
  const acct = () => store.accounts.find((a) => a.id === 1)!;
  const seed = () =>
    Object.assign(acct(), {
      ein: "12-3456789",
      fincenId: "FINCEN-123456789",
      stripeId: "cus_SECRET1234",
      bankingAppId: "BANK-7788",
      bankingAppStatus: "APPROVED",
      bankingAppMessage: "Approved",
      abandonedCartUrl: "https://example.com/cart",
    });

  const EXPECT: [Who, { ein: string; fincenId: string; stripeId: string | null; redacted: string[] }][] = [
    ["devon", { ein: "**-***6789", fincenId: "****6789", stripeId: null, redacted: ["abandonedCartUrl", "bankingAppId", "bankingAppMessage", "ein", "fincenId", "oldStripeIds", "stripeId"] }],
    ["leo", { ein: "**-***6789", fincenId: "****6789", stripeId: null, redacted: ["abandonedCartUrl", "bankingAppId", "bankingAppMessage", "ein", "fincenId", "oldStripeIds", "stripeId"] }],
    ["omar", { ein: "12-3456789", fincenId: "FINCEN-123456789", stripeId: null, redacted: ["abandonedCartUrl", "bankingAppId", "bankingAppMessage", "oldStripeIds", "stripeId"] }],
    ["rachel", { ein: "12-3456789", fincenId: "FINCEN-123456789", stripeId: null, redacted: ["abandonedCartUrl", "bankingAppId", "bankingAppMessage", "oldStripeIds", "stripeId"] }],
    ["iris", { ein: "12-3456789", fincenId: "FINCEN-123456789", stripeId: "cus_SECRET1234", redacted: [] }],
  ];

  for (const [who, e] of EXPECT) {
    it(`${who}: list, detail, case embed and client embed all redact the same way`, async () => {
      seed();
      const views: any[] = [
        (await api(who).get("/accounts")).body.find((a: any) => a.id === 1),
        (await api(who).get("/accounts/1")).body,
      ];
      const client = store.accountContactLinks.find((l) => l.accountId === 1 && !l.endedAt)!;
      views.push((await api(who).get(`/contacts/${client.contactId}`)).body.accounts.find((a: any) => a.id === 1));
      if (who !== "leo") {
        const c = store.cases.find((x) => x.accountId === 1)!;
        views.push((await api(who).get(`/cases/${c.id}`)).body.account);
        views.push((await api(who).get("/cases")).body.find((x: any) => x.accountId === 1).account);
      }
      for (const v of views) {
        expect(v.ein).toBe(e.ein);
        expect(v.fincenId).toBe(e.fincenId);
        expect(v.stripeId).toBe(e.stripeId);
        expect(v.bankingAppStatus).toBe("APPROVED"); // status stays visible
        expect([...v.redactedFields].sort()).toEqual(e.redacted);
        if (e.stripeId === null) {
          expect(v.bankingAppId).toBeNull();
          expect(v.abandonedCartUrl).toBeNull();
        }
      }
      // The stored record is untouched.
      expect(acct().ein).toBe("12-3456789");
    });
  }
});

// ── Account field rules (R2.3) ───────────────────────────────────────────────

describe("Account edit field groups", () => {
  it("rejects a crafted request as a whole: nothing is partially saved", async () => {
    const a = accountOwnedBy("Iris Burgos");
    const before = { website: a.website, ein: a.ein };
    const res = await api("devon").patch(`/accounts/${a.id}`, { website: "https://changed.example", ein: "99-9999999" });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "forbidden_fields", fields: ["ein"] });
    const after = store.accounts.find((x) => x.id === a.id)!;
    expect({ website: after.website, ein: after.ein }).toEqual(before);
    expect((await api("devon").patch(`/accounts/${a.id}`, { website: "https://ok.example" })).status).toBe(200);
  });

  it("applies each role's groups", async () => {
    const id = accountOwnedBy("Devon Park").id;
    const tryPatch = async (who: Who, body: object) => {
      const res = await api(who).patch(`/accounts/${id}`, body);
      return res.status === 200 ? "ok" : `${res.status} ${JSON.stringify(res.body.fields ?? res.body.error)}`;
    };
    expect(await tryPatch("devon", { brand: "X" })).toBe('403 ["brand"]');
    expect(await tryPatch("devon", { ownerName: "Sara Mitchell" })).toBe('403 ["ownerName"]');
    expect(await tryPatch("devon", { archived: true })).toBe('403 ["archived"]');
    expect(await tryPatch("omar", { name: "Renamed LLC", state: "WY" })).toBe("ok");
    expect(await tryPatch("omar", { ein: "11-1111111" })).toBe('403 ["ein"]');
    expect(await tryPatch("rachel", { ein: "11-1111111", brand: "Brand" })).toBe("ok");
    expect(await tryPatch("rachel", { stripeId: "cus_x" })).toBe('403 ["stripeId"]');
    expect(await tryPatch("rachel", { portalId: 5 })).toBe('403 ["portalId"]');
    expect(await tryPatch("iris", { stripeId: "cus_x", portalId: 5 })).toBe("ok");
    expect(await tryPatch("leo", { website: "https://x" })).toBe('403 ["website"]'); // BA: own accounts only
  });

  it("a Business Advisor edits profile and service on their own accounts only", async () => {
    const lead = await api("leo").post("/leads", { firstName: "Own", lastName: "Account" });
    const conv = await api("leo").post(`/leads/${lead.body.id}/convert`, { accountName: "Leo Co LLC", linkRole: "Owner" });
    expect(conv.status).toBe(201);
    expect(conv.body.account.redactedFields).toContain("ein");
    const id = conv.body.account.id;
    expect((await api("leo").patch(`/accounts/${id}`, { website: "https://leo.example", brand: "B" })).status).toBe(200);
    expect((await api("leo").patch(`/accounts/${id}`, { name: "Renamed" })).body.fields).toEqual(["name"]);
    // The BA Supervisor reassigns inside the team only.
    expect((await api("grace").patch(`/accounts/${id}`, { ownerName: "Iris Burgos" })).body.fields).toEqual(["ownerName"]);
    expect((await api("grace").patch(`/accounts/${id}`, { ownerName: "Grace Kim" })).status).toBe(200);
  });

  it("creating an account needs accounts.create plus each supplied field's group", async () => {
    expect((await api("devon").post("/accounts", { name: "Nope LLC" })).body).toEqual({ error: "forbidden", permission: "accounts.create" });
    expect((await api("omar").post("/accounts", { name: "Omar LLC", website: "https://o.example" })).status).toBe(201);
  });

  it("client edits: scope and reassignment", async () => {
    const irisClient = store.contacts.find((c) => c.ownerName === "Iris Burgos")!;
    expect((await api("devon").patch(`/contacts/${irisClient.id}`, { title: "CEO" })).status).toBe(200); // contacts.edit = all
    expect((await api("devon").patch(`/contacts/${irisClient.id}`, { ownerName: "Devon Park" })).body.fields).toEqual(["ownerName"]);
    expect((await api("leo").patch(`/contacts/${irisClient.id}`, { title: "CFO" })).body.fields).toEqual(["title"]);
  });
});

// ── Lead conversion first-Case rule (B4) ─────────────────────────────────────

describe("lead conversion first Case (B4)", () => {
  it("is refused without cases.create, atomically; the conversion itself proceeds", async () => {
    const lead = (await api("leo").post("/leads", { firstName: "Case", lastName: "Wanted" })).body;
    const counts = () => [store.accounts.length, store.contacts.length, store.cases.length, store.accountContactLinks.length];
    const before = counts();
    const refused = await api("leo").post(`/leads/${lead.id}/convert`, {
      accountName: "Wants A Case LLC", linkRole: "Owner", createInitialCase: true, initialCaseTitle: "Formation",
    });
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual({ error: "forbidden", permission: "cases.create" });
    expect(counts()).toEqual(before);
    expect(store.leads.find((l) => l.id === lead.id)!.convertedAt).toBeNull();

    const ok = await api("leo").post(`/leads/${lead.id}/convert`, { accountName: "Wants A Case LLC", linkRole: "Owner" });
    expect(ok.status).toBe(201);
    expect(ok.body.case).toBeNull();
  });

  it("creates the first Case for someone who may create cases", async () => {
    const lead = (await api("iris").post("/leads", { firstName: "Owner", lastName: "Converts" })).body;
    const ok = await api("iris").post(`/leads/${lead.id}/convert`, {
      accountName: "Full Conversion LLC", linkRole: "Owner", createInitialCase: true, initialCaseTitle: "Formation",
    });
    expect(ok.status).toBe(201);
    expect(ok.body.case.title).toBe("Formation");
  });
});

// ── Metrics scope ────────────────────────────────────────────────────────────

describe("/stats is clamped to metrics.cases scope", () => {
  const count = (names: string[]) => store.cases.filter((c) => names.includes(c.ownerName)).length;

  it("own for a CSR", async () => {
    const res = await api("devon").get("/stats");
    expect(res.body.totalCases).toBe(count(["Devon Park"]));
    expect((await api("devon").get("/stats?assignee=Sara%20Mitchell")).body).toEqual({ error: "out_of_scope", permission: "metrics.cases" });
  });

  it("team for a CSR Supervisor", async () => {
    expect((await api("nadia").get("/stats")).body.totalCases).toBe(count(["Nadia Flores", "Devon Park", "Sara Mitchell"]));
    expect((await api("nadia").get("/stats?assignee=Devon%20Park")).body.totalCases).toBe(count(["Devon Park"]));
    expect((await api("nadia").get("/stats?assignee=Iris%20Burgos")).status).toBe(403);
  });

  it("company-wide for the System Owner", async () => {
    expect((await api("iris").get("/stats")).body.totalCases).toBe(store.cases.length);
  });
});

// ── Messages and mentions ────────────────────────────────────────────────────

describe("messages are membership-scoped", () => {
  it("non-members cannot read, post or delete in a conversation", async () => {
    const dm = (await api("iris").post("/conversations", { type: "dm", members: ["Iris Burgos", "Devon Park"] })).body;
    const msg = (await api("iris").post(`/conversations/${dm.id}/messages`, { content: "private" })).body;
    expect((await api("devon").get(`/conversations/${dm.id}/messages`)).status).toBe(200);
    expect((await api("sara").get(`/conversations/${dm.id}/messages`)).status).toBe(404);
    expect((await api("sara").post(`/conversations/${dm.id}/messages`, { content: "hi" })).status).toBe(404);
    expect((await api("sara").del(`/messages/${msg.id}`)).status).toBe(404);
    expect((await api("devon").del(`/messages/${msg.id}`)).body.error).toBe("not_author");
  });

  it("you can only start conversations you are in", async () => {
    const res = await api("sara").post("/conversations", { type: "dm", members: ["Iris Burgos", "Devon Park"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("creator_not_member");
  });
});

describe("mentions are private", () => {
  it("each employee reads and marks only their own", async () => {
    await api("iris").post(`/cases/${caseOwnedBy("Devon Park").id}/thread`, { body: "@Sara Mitchell please check" });
    const saras = (await api("sara").get("/mentions")).body as any[];
    const m = saras.find((x) => x.body.includes("please check"));
    expect(m).toBeTruthy();
    expect((await api("devon").get("/mentions")).body.some((x: any) => x.id === m.id)).toBe(false);
    expect((await api("devon").get("/mentions?for=Sara%20Mitchell")).body).toEqual({ error: "not_your_mentions" });
    expect((await api("devon").patch(`/mentions/${m.id}/read`, {})).status).toBe(404);
    expect((await api("sara").patch(`/mentions/${m.id}/read`, {})).status).toBe(200);
  });
});
