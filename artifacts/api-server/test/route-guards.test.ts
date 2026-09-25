import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { buildApiRouter } from "../src/routes";
import { ROUTE_ACCESS_KEY, type RouteAccess } from "../src/auth/authorize";
import { canAny, resolvePermissions, type Permission, type RoleKey } from "../src/access";
import { store } from "../src/store";
import { createTestApp, asMe } from "./helpers/app";
import { sessionForRole } from "./helpers/roles";

/**
 * RBAC Phase 3 — every route declares its access, and the declaration is
 * what the API enforces.
 *
 * 1. Deny by default: walking the /api router, every route's first handler
 *    must be a guard (publicRoute / signedIn / allow(...)).
 * 2. The declarations must equal the table below, so adding or changing a
 *    route means reviewing its access here.
 * 3. Role × route: for every role and every route, a real request is refused
 *    with 403 `forbidden` exactly when the role lacks the route's capability
 *    (per the approved matrix in lib/access).
 */

type Access = "public" | "signed_in" | Permission[];

/** method, path → access. The reviewed access table. */
const ACCESS: [string, string, Access][] = [
  ["POST", "/auth/login", "public"],
  ["POST", "/auth/logout", "public"],
  ["GET", "/auth/me", "signed_in"],
  ["GET", "/cases", ["cases.view"]],
  ["POST", "/cases", ["cases.create"]],
  ["GET", "/cases/:id", ["cases.view"]],
  ["PATCH", "/cases/:id", ["cases.edit"]],
  ["POST", "/cases/:id/escalations", ["cases.work"]],
  ["POST", "/cases/:id/escalations/:escalationId/resolve", ["cases.edit"]],
  ["GET", "/accounts", ["accounts.view"]],
  ["POST", "/accounts", ["accounts.create"]],
  ["GET", "/accounts/:id", ["accounts.view"]],
  ["PATCH", "/accounts/:id", [
    "accounts.edit.profile", "accounts.edit.service", "accounts.edit.formation",
    "accounts.edit.regulatory_ids", "accounts.edit.financial", "accounts.edit.system",
    "accounts.archive",
  ]],
  ["GET", "/contacts", ["contacts.view"]],
  ["POST", "/contacts", ["contacts.create"]],
  ["GET", "/contacts/:id", ["contacts.view"]],
  ["PATCH", "/contacts/:id", ["contacts.edit"]],
  ["POST", "/account-contacts", ["contacts.link"]],
  ["PATCH", "/account-contacts/:id", ["contacts.link"]],
  ["DELETE", "/account-contacts/:id", ["contacts.link"]],
  ["GET", "/leads", ["leads.view"]],
  ["POST", "/leads", ["leads.create"]],
  ["PATCH", "/leads/:id", ["leads.edit"]],
  ["POST", "/leads/:id/convert", ["leads.convert"]],
  ["DELETE", "/leads/:id", ["leads.delete"]],
  // Reassign pickers (Phase 5): valid new owners for the caller
  ["GET", "/owners/cases/candidates", ["cases.assign"]],
  ["GET", "/owners/leads/candidates", ["leads.assign"]],
  ["GET", "/owners/accounts/candidates", ["accounts.assign"]],
  ["GET", "/owners/contacts/candidates", ["contacts.assign"]],
  // Reassignment by employee id (Phase 4)
  ["PUT", "/cases/:id/owner", ["cases.assign"]],
  ["PUT", "/leads/:id/owner", ["leads.assign"]],
  ["PUT", "/accounts/:id/owner", ["accounts.assign"]],
  ["PUT", "/contacts/:id/owner", ["contacts.assign"]],
  ["GET", "/tasks", ["cases.view"]],
  ["POST", "/tasks", ["cases.work"]],
  ["PATCH", "/tasks/:id", ["cases.work"]],
  ["GET", "/documents", ["cases.view"]],
  ["POST", "/documents", ["cases.work"]],
  ["GET", "/cases/:id/contacts", ["cases.view"]],
  ["POST", "/cases/:id/contacts", ["cases.work"]],
  ["GET", "/cases/:id/thread", ["cases.view"]],
  ["POST", "/cases/:id/thread", ["cases.work"]],
  ["GET", "/mentions", ["messages.use"]],
  ["PATCH", "/mentions/:id/read", ["messages.use"]],
  ["GET", "/team", ["messages.use"]],
  ["GET", "/cases/:id/automations", ["cases.view"]],
  ["POST", "/cases/:id/automations", ["automations.edit", "automations.manage_global"]],
  ["GET", "/automations", ["cases.view"]],
  ["GET", "/automations/:autoId", ["cases.view"]],
  ["GET", "/automations/:autoId/usage", ["cases.view"]],
  ["PATCH", "/automations/:autoId", ["automations.edit", "automations.manage_global"]],
  ["DELETE", "/automations/:autoId", ["automations.edit", "automations.manage_global"]],
  ["POST", "/automations/:autoId/promote", ["automations.manage_global"]],
  ["POST", "/automations/:autoId/fork", ["automations.edit"]],
  ["POST", "/automations/:autoId/revert", ["automations.edit"]],
  ["GET", "/dashboard", ["dashboard.view"]],
  ["GET", "/stats", ["metrics.cases"]],
  ["GET", "/customers", ["accounts.view"]],
  ["GET", "/customers/:id", ["accounts.view"]],
  ["GET", "/conversations", ["messages.use"]],
  ["POST", "/conversations", ["messages.use"]],
  ["GET", "/conversations/:id/messages", ["messages.use"]],
  ["POST", "/conversations/:id/messages", ["messages.use"]],
  ["DELETE", "/messages/:id", ["messages.use"]],
];

const key = (method: string, path: string) => `${method} ${path}`;

/** Every route on the /api router with the access its first handler declares. */
function declaredRoutes(): Map<string, RouteAccess | null> {
  const out = new Map<string, RouteAccess | null>();
  const router = buildApiRouter() as unknown as { stack: any[] };
  for (const layer of router.stack) {
    const route = layer.route;
    if (!route) continue; // router-level middleware (persist hook, same-origin, authenticate)
    const methods = Object.keys(route.methods ?? {}).filter((m) => route.methods[m] && m !== "_all");
    for (const m of methods) {
      const first = route.stack[0]?.handle;
      out.set(key(m.toUpperCase(), route.path), (first && first[ROUTE_ACCESS_KEY]) ?? null);
    }
  }
  return out;
}

function asAccess(d: RouteAccess | null): Access | null {
  if (!d) return null;
  if (d.kind === "public") return "public";
  if (d.kind === "signed_in") return "signed_in";
  return [...d.anyOf];
}

describe("deny by default", () => {
  const declared = declaredRoutes();

  it("finds the whole API", () => {
    expect(declared.size).toBe(ACCESS.length);
  });

  it("every route's first handler declares its access", () => {
    const undeclared = [...declared].filter(([, d]) => d === null).map(([k]) => k);
    expect(undeclared).toEqual([]);
  });

  it("the declarations match the reviewed access table exactly", () => {
    const actual = Object.fromEntries([...declared].map(([k, d]) => [k, asAccess(d)]));
    const expected = Object.fromEntries(ACCESS.map(([m, p, a]) => [key(m, p), a]));
    expect(actual).toEqual(expected);
  });

  it("only sign-in and sign-out are public", () => {
    const pub = ACCESS.filter(([, , a]) => a === "public").map(([m, p]) => key(m, p));
    expect(pub).toEqual(["POST /auth/login", "POST /auth/logout"]);
  });
});

// ── Role × route ─────────────────────────────────────────────────────────────

const ROLES: RoleKey[] = [
  "csr", "csr_supervisor", "business_advisor", "business_advisor_supervisor",
  "operations_admin", "operations_admin_supervisor", "hr", "filing", "system_owner",
];

type Sample = { method: string; path: string; url: () => string; body?: (me: string) => unknown };

const app = createTestApp();
const fx = { caseAuto: 0, caseAuto2: 0, global: 0, fork: 0, lead: 0, lead2: 0, task: 0, link: 0, convo: 0, msg: 0 };

beforeAll(async () => {
  const ok = (res: request.Response) => {
    if (res.status >= 300) throw new Error(`fixture failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const as = (m: "post" | "get") => (url: string, body?: unknown) =>
    m === "get" ? request(app).get(`/api${url}`).set(asMe) : request(app).post(`/api${url}`).set(asMe).send(body as object);
  const post = as("post");
  fx.caseAuto = ok(await post("/cases/1/automations", { name: "Case auto" })).id;
  fx.caseAuto2 = ok(await post("/cases/1/automations", { name: "Case auto 2" })).id;
  fx.global = ok(await post("/cases/1/automations", { name: "Global auto", scope: "global" })).id;
  fx.fork = ok(await post(`/automations/${fx.global}/fork`, { caseId: 2 })).id;
  fx.lead = ok(await post("/leads", { firstName: "Pat", lastName: "Lead" })).id;
  fx.lead2 = ok(await post("/leads", { firstName: "Sam", lastName: "Lead" })).id;
  fx.task = ok(await post("/tasks", { caseId: 1, title: "Fixture task" })).id;
  fx.link = ok(await post("/account-contacts", { accountId: 1, contactId: 5, role: "Member" })).id;
  fx.convo = ok(await post("/conversations", { type: "group", name: "All", members: store.users.map((u) => u.name) })).id;
  fx.msg = ok(await post(`/conversations/${fx.convo}/messages`, { content: "hello" })).id;
});

const SAMPLES: Record<string, Sample> = {};
const add = (method: string, path: string, url: () => string, body?: (me: string) => unknown) => {
  SAMPLES[key(method, path)] = { method, path, url, body };
};
add("GET", "/auth/me", () => "/auth/me");
add("GET", "/cases", () => "/cases");
add("POST", "/cases", () => "/cases", () => ({ title: "Role test", accountId: 1 }));
add("GET", "/cases/:id", () => "/cases/1");
add("PATCH", "/cases/:id", () => "/cases/1", () => ({ description: "role test" }));
add("POST", "/cases/:id/escalations", () => "/cases/1/escalations", () => ({ reason: "other" }));
add("POST", "/cases/:id/escalations/:escalationId/resolve", () => "/cases/1/escalations/999999/resolve");
add("GET", "/accounts", () => "/accounts");
add("POST", "/accounts", () => "/accounts", () => ({ name: "Role Test LLC" }));
add("GET", "/accounts/:id", () => "/accounts/1");
add("PATCH", "/accounts/:id", () => "/accounts/1", () => ({ website: "https://role.test" }));
add("GET", "/contacts", () => "/contacts");
add("POST", "/contacts", () => "/contacts", () => ({ firstName: "Role", lastName: "Test" }));
add("GET", "/contacts/:id", () => "/contacts/1");
add("PATCH", "/contacts/:id", () => "/contacts/1", () => ({ title: "Founder" }));
add("POST", "/account-contacts", () => "/account-contacts", () => ({ accountId: 2, contactId: 3, role: "Member" }));
add("PATCH", "/account-contacts/:id", () => `/account-contacts/${fx.link}`, () => ({ role: "Advisor" }));
add("DELETE", "/account-contacts/:id", () => `/account-contacts/${fx.link}`);
add("GET", "/leads", () => "/leads");
add("POST", "/leads", () => "/leads", () => ({ firstName: "New", lastName: "Lead" }));
add("PATCH", "/leads/:id", () => `/leads/${fx.lead}`, () => ({ notes: "role test" }));
add("POST", "/leads/:id/convert", () => `/leads/${fx.lead}/convert`, () => ({ accountName: "Converted LLC", linkRole: "Owner" }));
add("DELETE", "/leads/:id", () => `/leads/${fx.lead2}`);
// Reassign to the System Owner (id 1): refused by scope for most roles, but
// never with the capability error unless the role lacks <type>.assign.
for (const t of ["cases", "leads", "accounts", "contacts"]) add("GET", `/owners/${t}/candidates`, () => `/owners/${t}/candidates`);
add("PUT", "/cases/:id/owner", () => "/cases/1/owner", () => ({ ownerUserId: 1 }));
add("PUT", "/leads/:id/owner", () => `/leads/${fx.lead}/owner`, () => ({ ownerUserId: 1 }));
add("PUT", "/accounts/:id/owner", () => "/accounts/1/owner", () => ({ ownerUserId: 1 }));
add("PUT", "/contacts/:id/owner", () => "/contacts/1/owner", () => ({ ownerUserId: 1 }));
add("GET", "/tasks", () => "/tasks");
add("POST", "/tasks", () => "/tasks", () => ({ caseId: 1, title: "Role task" }));
add("PATCH", "/tasks/:id", () => `/tasks/${fx.task}`, () => ({ title: "Renamed" }));
add("GET", "/documents", () => "/documents");
add("POST", "/documents", () => "/documents", () => ({ caseId: 1, filename: "a.pdf", fileUrl: "https://example.com/a.pdf" }));
add("GET", "/cases/:id/contacts", () => "/cases/1/contacts");
add("POST", "/cases/:id/contacts", () => "/cases/1/contacts", () => ({ direction: "inbound", channel: "phone", summary: "Called", contact: "Amelia" }));
add("GET", "/cases/:id/thread", () => "/cases/1/thread");
add("POST", "/cases/:id/thread", () => "/cases/1/thread", () => ({ body: "role test" }));
add("GET", "/mentions", () => "/mentions");
add("PATCH", "/mentions/:id/read", () => "/mentions/999999/read");
add("GET", "/team", () => "/team");
add("GET", "/cases/:id/automations", () => "/cases/1/automations");
add("POST", "/cases/:id/automations", () => "/cases/1/automations", () => ({ name: "Role auto" }));
add("GET", "/automations", () => "/automations");
add("GET", "/automations/:autoId", () => `/automations/${fx.caseAuto}`);
add("GET", "/automations/:autoId/usage", () => `/automations/${fx.caseAuto}/usage`);
add("PATCH", "/automations/:autoId", () => `/automations/${fx.caseAuto}`, () => ({ name: "Renamed auto" }));
add("DELETE", "/automations/:autoId", () => `/automations/${fx.caseAuto2}`);
add("POST", "/automations/:autoId/promote", () => `/automations/${fx.caseAuto}/promote`);
add("POST", "/automations/:autoId/fork", () => `/automations/${fx.global}/fork`, () => ({ caseId: 3 }));
add("POST", "/automations/:autoId/revert", () => `/automations/${fx.fork}/revert`);
add("GET", "/dashboard", () => "/dashboard");
add("GET", "/stats", () => "/stats");
add("GET", "/customers", () => "/customers");
add("GET", "/customers/:id", () => "/customers/1");
add("GET", "/conversations", () => "/conversations");
add("POST", "/conversations", () => "/conversations", (me) => ({ type: "dm", members: [me, "Iris Burgos"] }));
add("GET", "/conversations/:id/messages", () => `/conversations/${fx.convo}/messages`);
add("POST", "/conversations/:id/messages", () => `/conversations/${fx.convo}/messages`, () => ({ content: "hi" }));
add("DELETE", "/messages/:id", () => `/messages/${fx.msg}`);

describe("role × route", () => {
  it("built its fixtures (so 404s below are about scope, not missing data)", () => {
    for (const [name, id] of Object.entries(fx)) expect(`${name}:${id > 0}`).toBe(`${name}:true`);
  });

  it("has a sample request for every non-public route", () => {
    const needed = ACCESS.filter(([, , a]) => a !== "public").map(([m, p]) => key(m, p));
    expect(Object.keys(SAMPLES).sort()).toEqual(needed.sort());
  });

  for (const role of ROLES) {
    it(`${role}: refused exactly the routes its permissions do not cover`, async () => {
      const cookie = await sessionForRole(role);
      const me = (await request(app).get("/api/auth/me").set(cookie)).body.user.name as string;
      const perms = resolvePermissions([role]);
      const wrong: string[] = [];
      for (const [m, p, access] of ACCESS) {
        if (access === "public") continue;
        const s = SAMPLES[key(m, p)];
        const call = request(app)[m.toLowerCase() as "get"](`/api${s.url()}`).set(cookie);
        const res = s.body ? await call.send(s.body(me) as object) : await call;
        const refused = res.status === 403 && res.body?.error === "forbidden";
        const shouldRefuse = access !== "signed_in" && !canAny(perms, access);
        if (refused !== shouldRefuse) wrong.push(`${key(m, p)} → ${res.status} ${JSON.stringify(res.body).slice(0, 80)}`);
        if (refused && JSON.stringify(res.body.permission) !== JSON.stringify(access.length === 1 ? access[0] : access)) {
          wrong.push(`${key(m, p)} names the wrong permission: ${JSON.stringify(res.body)}`);
        }
      }
      expect(wrong).toEqual([]);
    });
  }

  it("the reserved Filing role is refused everything but its own identity", async () => {
    const cookie = await sessionForRole("filing");
    const me = await request(app).get("/api/auth/me").set(cookie);
    expect(me.status).toBe(200);
    expect(me.body.permissions).toEqual({});
    for (const [m, p, access] of ACCESS) {
      if (access === "public" || access === "signed_in") continue;
      const s = SAMPLES[key(m, p)];
      const call = request(app)[m.toLowerCase() as "get"](`/api${s.url()}`).set(cookie);
      const res = s.body ? await call.send(s.body("Test filing") as object) : await call;
      expect(`${key(m, p)} ${res.status}`).toBe(`${key(m, p)} 403`);
    }
  });

  it("an unauthenticated request is 401 before any permission check", async () => {
    for (const [m, p, access] of ACCESS) {
      if (access === "public") continue;
      const s = SAMPLES[key(m, p)];
      const res = await request(app)[m.toLowerCase() as "get"](`/api${s.url()}`);
      expect(`${key(m, p)} ${res.status}`).toBe(`${key(m, p)} 401`);
    }
  });
});
