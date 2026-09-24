import { Router, type Express, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { authenticate, requireAuth, requireSameOrigin } from "./auth/middleware.js";
import { publicUser } from "./auth/identity.js";
import {
  ASSIGN_PERMISSION,
  OWNER_MUST_VIEW,
  accountFieldWritePermissions,
  can,
  redactAccount,
  resolvePermissions,
  type Permission,
} from "./access.js";
import {
  allow,
  canOn,
  forbidden,
  forbiddenFields,
  outOfScope,
  principalOf,
  publicRoute,
  rowsInScope,
  signedIn,
  supervisedMemberIds,
  type Principal,
} from "./auth/authorize.js";
import { dummyPasswordHash, verifyPassword } from "./auth/password.js";
import {
  absoluteTimeoutMs,
  buildClearedSessionCookie,
  buildSessionCookie,
  cookieShouldBeSecure,
  createSession,
  revokeSessionToken,
  sessionTokenFrom,
} from "./auth/sessions.js";
import { loginThrottle } from "./auth/throttle.js";
import { buildDashboard } from "./dashboard.js";
import {
  store,
  seed,
  nextCaseId,
  nextCaseNumber,
  nextAccountId,
  nextContactId,
  nextAccountContactLinkId,
  nextLeadId,
  nextTaskId,
  nextDocumentId,
  nextConversationId,
  nextMessageId,
  nextCaseInteractionId,
  nextThreadEntryId,
  nextMentionId,
  caseTagSummaries,
  parseMentions,
  persist,
  userByEmail,
  activeEmployees,
  userById,
  contactFullName,
  contactsForAccount,
  accountsForContact,
  primaryContactForAccount,
  makeAccount,
  nextAutomationId,
  type Case,
  type CasePriority,
  type CaseStatus,
  type DocumentType,
  type TaskStatus,
  type Contact,
  type Account,
  type Lead,
  type AccountContactLink,
  type Automation,
  type AutomationGraph,
  type User,
} from "./store.js";

// Seed once at startup.
seed();

// ── Helpers ──────────────────────────────────────────────────────────────────
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const idParam = z.object({ id: z.coerce.number().int().positive() });

const caseStatus = z.enum(["intake", "review", "in_progress", "waiting", "completed"]);
const casePriority = z.enum(["low", "medium", "high", "critical"]);
const taskStatus = z.enum(["pending", "in_progress", "completed"]);
const docType = z.enum(["contract", "invoice", "report", "identity", "other"]);
const conversationType = z.enum(["dm", "group"]);
const leadStatus = z.enum(["new", "working", "qualified", "unqualified", "converted"]);
const leadSource = z.enum(["referral", "website", "event", "cold_call", "partner", "other"]);

// ── Automation schemas ───────────────────────────────────────────────────────
const automationNodeType = z.enum([
  "trigger", "filter", "assign", "notify", "delay", "branch", "http", "update",
]);

const automationNodeSchema = z.object({
  id: z.string().min(1),
  type: automationNodeType,
  x: z.number().finite(),
  y: z.number().finite(),
  config: z.record(z.string()),
});

const automationEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

/**
 * A workflow graph. Structural validation only: node ids unique, every edge
 * endpoint resolves to a node. Cycles are allowed — there is no execution
 * engine yet, and a half-built graph is a legitimate thing to save.
 */
const automationGraphSchema = z
  .object({
    nodes: z.array(automationNodeSchema),
    edges: z.array(automationEdgeSchema),
    viewport: z
      .object({
        pan: z.object({ x: z.number().finite(), y: z.number().finite() }),
        zoom: z.number().finite().positive(),
      })
      .nullable()
      .optional(),
  })
  .superRefine((graph, ctx) => {
    const ids = new Set<string>();
    for (const [i, n] of graph.nodes.entries()) {
      if (ids.has(n.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", i, "id"],
          message: `duplicate node id: ${n.id}`,
        });
      }
      ids.add(n.id);
    }
    for (const [i, e] of graph.edges.entries()) {
      if (!ids.has(e.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i, "from"],
          message: `edge references unknown node: ${e.from}`,
        });
      }
      if (!ids.has(e.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i, "to"],
          message: `edge references unknown node: ${e.to}`,
        });
      }
    }
  });

const automationName = z.string().trim().min(1).max(80);

const EMPTY_GRAPH: AutomationGraph = { nodes: [], edges: [], viewport: null };

/**
 * Returns the case with its account, primary contact, and a synthesized
 * "customer" object for backwards-compatibility with the existing frontend.
 * The customer object presents the account+contact as the legacy flat record
 * so older pages keep rendering until they're refactored.
 *
 * STAND-IN CONTACT (known debt — behaviour intentionally unchanged):
 * `primaryContact` is NOT always the case's primary contact. When
 * `primaryContactId` is null, or names a contact that no longer exists, it
 * falls back to the account's primary (or first linked) contact. Only
 * `primaryContactId` is authoritative.
 *   Depends on the fallback (a name to show in a "Customer" slot):
 *     `customer.name/email/phone` → Cases table + Cards "Customer" column
 *     (CasesList.tsx), Dashboard recent cases, Insights "top customers".
 *   Deliberately ignores it: Case Detail links and the board's case modal
 *     (cases/src/lib/caseLinks.ts check primaryContact.id === primaryContactId).
 *   No frontend code reads `primaryContact` directly any more.
 * Future cleanup: return `primaryContact` only for a real primaryContactId,
 * and have the pages above show the Account (or "No primary contact")
 * instead of a borrowed name. That changes what those pages display, so it
 * needs its own decision. Tests pinning the current fallback:
 * case-links.test.ts, case-update-validation.test.ts.
 */
function caseWithRelations(c: Case, p: Principal) {
  const rawAccount = store.accounts.find((a) => a.id === c.accountId) ?? null;
  // The embedded account obeys the viewer's Account rules (scope + R2.2 redaction).
  const account = rawAccount && canViewAccount(p, rawAccount) ? shapeAccount(p, rawAccount) : null;
  const primaryContact =
    (c.primaryContactId
      ? store.contacts.find((p) => p.id === c.primaryContactId)
      : null) ??
    (account ? primaryContactForAccount(account.id) : null) ??
    null;
  const customer = account && rawAccount
    ? {
        id: account.id, // legacy: use account id as the customer id
        name: primaryContact ? contactFullName(primaryContact) : account.name,
        email: primaryContact?.email ?? null,
        phone: primaryContact?.phone ?? null,
        company: account.name,
        ownerName: account.ownerName,
        createdAt: account.createdAt,
      }
    : null;
  // Include legacy `customerId` (= accountId) so older list/board pages and
  // the New Case modal keep working without simultaneous changes.
  return { ...c, customerId: c.accountId, account, primaryContact, customer };
}

/**
 * Display name of the signed-in employee, from the server session.
 * Never from the X-User header or a request body (Phase 1).
 */
function currentUser(req: Request): string {
  return requireAuth(req).user.name;
}

// ── Access helpers (RBAC Phase 3) ────────────────────────────────────────────
// Record-level rules on top of the route guards (auth/authorize.ts). A record
// outside the caller's view scope is treated exactly like a missing one.

function canViewCase(p: Principal, c: Case): boolean {
  return canOn(p, "cases.view", c.ownerUserId);
}
function canViewAccount(p: Principal, a: Account): boolean {
  return canOn(p, "accounts.view", a.ownerUserId);
}
function canViewContact(p: Principal, c: Contact): boolean {
  return canOn(p, "contacts.view", c.ownerUserId);
}
function canViewLead(p: Principal, l: Lead): boolean {
  return canOn(p, "leads.view", l.ownerUserId);
}

/** An Account as this viewer may read it: R2.2 redaction plus `redactedFields`. */
function shapeAccount<T extends Account>(p: Principal, a: T): T & { redactedFields: string[] } {
  const { account, redactedFields } = redactAccount(a, p.permissions);
  return { ...account, redactedFields };
}

/** The case, if it exists AND the caller may view it; otherwise undefined (→ 404). */
function findCaseFor(req: Request, id: number): Case | undefined {
  const c = store.cases.find((x) => x.id === id);
  return c && canViewCase(principalOf(req), c) ? c : undefined;
}

/** Cases the caller may view. */
function viewableCases(p: Principal): Case[] {
  return rowsInScope(p, "cases.view", store.cases, (c) => c.ownerUserId);
}

/**
 * Which of `fields` the caller may not write on a record owned by employee
 * `ownerUserId`, given each field's required permissions (scoped ones must
 * cover the owner). Ownership itself never changes through these writes —
 * see the reassignment routes.
 */
function writeViolations(
  p: Principal,
  ownerUserId: number | null,
  fields: readonly string[],
  permissionsFor: (field: string) => Permission[] | null,
): string[] {
  return fields.filter((field) => {
    const needed = permissionsFor(field);
    if (needed === null) return true;
    return !needed.every((perm) => canOn(p, perm, ownerUserId));
  });
}

/**
 * A record's owner may change only through the reassignment routes, by
 * employee id. A display name in a PATCH body is never used to pick an owner.
 */
function ownerNameInBody(res: Response, body: { ownerName?: unknown }, route: string): boolean {
  if (body.ownerName === undefined) return false;
  res.status(400).json({
    error: "owner_change_requires_reassign",
    message: `Change the owner with PUT ${route} and { ownerUserId }.`,
  });
  return true;
}

/** Does the record's owner — by id, under their CURRENT name — match this name filter? */
function ownerNamed(ownerUserId: number | null, storedName: string, name: string): boolean {
  const owner = userById(ownerUserId);
  return (owner ? owner.name : storedName) === name;
}

/** The session's employee as a Principal-like view for someone else (mention recipients). */
function principalFor(u: User): Principal {
  return { user: u, permissions: resolvePermissions(u.roles), supervisedUserIds: supervisedMemberIds(u.id) };
}

/** Keys actually present in a parsed body (undefined = not supplied). */
function suppliedKeys(body: Record<string, unknown>): string[] {
  return Object.keys(body).filter((k) => body[k] !== undefined);
}

// ── Routes ───────────────────────────────────────────────────────────────────
export function registerRoutes(app: Express) {
  app.use("/api", buildApiRouter());
}

/**
 * The /api router. Every route declares its access as its first handler
 * (`publicRoute`, `signedIn` or `allow(...)`, from auth/authorize.ts);
 * test/route-guards.test.ts walks this router and fails on any route that
 * does not.
 */
export function buildApiRouter(): Router {
  const r = Router();

  r.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.on("finish", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) persist();
      });
    }
    next();
  });

  // Every state-changing /api request must come from this origin (CSRF).
  r.use(requireSameOrigin);

  // ── Auth ───────────────────────────────────────────────────────────────────
  // POST /api/auth/login   — public; sets the session cookie
  // POST /api/auth/logout  — public; ends the session if there is one
  // GET  /api/auth/me      — the signed-in employee (behind authenticate)
  r.post(
    "/auth/login",
    publicRoute,
    asyncHandler(async (req, res) => {
      const body = z
        .object({ email: z.string().min(3), password: z.string().min(1) })
        .parse(req.body);
      const email = body.email.trim().toLowerCase();
      const ip = req.ip ?? "unknown";

      const gate = loginThrottle.check(email, ip);
      if (!gate.allowed) {
        res.setHeader("Retry-After", String(gate.retryAfterSeconds));
        return res
          .status(429)
          .json({ error: "too_many_attempts", retryAfterSeconds: gate.retryAfterSeconds });
      }

      const user = userByEmail(email);
      // Verify against a dummy hash for unknown emails so both paths cost the same.
      const ok = await verifyPassword(body.password, user?.passwordHash || dummyPasswordHash());
      if (!user || !ok) {
        loginThrottle.recordFailure(email, ip);
        return res.status(401).json({ error: "invalid_credentials" });
      }
      if (!user.active) {
        return res.status(403).json({ error: "account_inactive" });
      }

      loginThrottle.recordSuccess(email);
      user.lastLoginAt = new Date().toISOString();
      const { token } = createSession(user.id);
      res.setHeader(
        "Set-Cookie",
        buildSessionCookie(token, {
          secure: cookieShouldBeSecure(req),
          maxAgeSeconds: Math.floor(absoluteTimeoutMs() / 1000),
        }),
      );
      res.json(publicUser(user));
    }),
  );

  r.post(
    "/auth/logout",
    publicRoute,
    asyncHandler(async (req, res) => {
      const token = sessionTokenFrom(req);
      if (token) revokeSessionToken(token);
      res.setHeader("Set-Cookie", buildClearedSessionCookie({ secure: cookieShouldBeSecure(req) }));
      res.status(204).end();
    }),
  );

  // ── Everything below requires a signed-in employee ──────────────────────────
  r.use(authenticate);

  r.get(
    "/auth/me",
    signedIn,
    asyncHandler(async (req, res) => {
      const { user } = requireAuth(req);
      const teams = store.teams
        .filter((t) => t.memberUserIds.includes(user.id) || t.supervisorUserIds.includes(user.id))
        .map((t) => ({
          id: t.id,
          name: t.name,
          departmentKey: t.departmentKey,
          relation: t.supervisorUserIds.includes(user.id) ? ("supervisor" as const) : ("member" as const),
        }));
      // Effective permissions from the shared role bundles (lib/access),
      // enforced by every route below (Phase 3).
      res.json({
        user: publicUser(user),
        teams,
        permissions: resolvePermissions(user.roles),
        // Members of the teams this employee supervises: the web app needs
        // them to evaluate "team" scope for controls (lib/access controls).
        supervisedUserIds: [...supervisedMemberIds(user.id)].sort((a, b) => a - b),
      });
    }),
  );

  // ── Cases ──────────────────────────────────────────────────────────────────
  r.get(
    "/cases",
    allow("cases.view"),
    asyncHandler(async (req, res) => {
      const q = z
        .object({
          status: caseStatus.optional(),
          priority: casePriority.optional(),
          search: z.string().optional(),
          assignee: z.string().optional(),
          assigneeUserId: z.coerce.number().int().positive().optional(),
          accountId: z.coerce.number().int().optional(),
          contactId: z.coerce.number().int().optional(),
        })
        .parse(req.query);

      const p = principalOf(req);
      let rows = viewableCases(p);
      if (q.assigneeUserId) rows = rows.filter((c) => c.ownerUserId === q.assigneeUserId);
      if (q.assignee) rows = rows.filter((c) => ownerNamed(c.ownerUserId, c.ownerName, q.assignee!));
      if (q.status) rows = rows.filter((c) => c.status === q.status);
      if (q.priority) rows = rows.filter((c) => c.priority === q.priority);
      if (q.accountId) rows = rows.filter((c) => c.accountId === q.accountId);
      if (q.contactId) {
        // Cases where the contact is the primary contact OR is linked to the
        // case's account via AccountContactLink.
        const accIdsForContact = new Set(
          store.accountContactLinks
            .filter((l) => l.contactId === q.contactId && !l.endedAt)
            .map((l) => l.accountId),
        );
        rows = rows.filter(
          (c) => c.primaryContactId === q.contactId || accIdsForContact.has(c.accountId),
        );
      }
      if (q.search) {
        const raw = q.search.toLowerCase().trim();
        const numeric = raw.replace(/^#/, "").replace(/^case[\s-]*/, "");
        const isAllDigits = /^\d+$/.test(numeric);
        const padded = isAllDigits ? numeric.padStart(3, "0") : numeric;
        rows = rows.filter((c) => {
          const num = c.caseNumber.toLowerCase();
          const numTail = num.replace(/^case-/, "");
          return (
            c.title.toLowerCase().includes(raw) ||
            num.includes(raw) ||
            numTail.includes(numeric) ||
            (isAllDigits && numTail === padded) ||
            (c.description ?? "").toLowerCase().includes(raw)
          );
        });
      }
      rows.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
      res.json(rows.map((c) => caseWithRelations(c, p)));
    }),
  );

  r.post(
    "/cases",
    allow("cases.create"),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          title: z.string().min(1),
          // Accept either accountId (preferred) or legacy customerId.
          accountId: z.number().int().positive().optional(),
          customerId: z.number().int().positive().optional(),
          primaryContactId: z.number().int().positive().optional(),
          status: caseStatus.default("intake"),
          priority: casePriority.default("medium"),
          description: z.string().optional().default(""),
          tags: z.array(z.string()).optional().default([]),
        })
        .parse(req.body);

      const accountId = body.accountId ?? body.customerId;
      if (!accountId) return res.status(400).json({ error: "missing_account" });
      const me = currentUser(req);
      const meId = requireAuth(req).user.id;
      const p = principalOf(req);
      const account = store.accounts.find((a) => a.id === accountId);
      // An account the caller may not view is reported as unknown.
      if (!account || !canViewAccount(p, account)) return res.status(400).json({ error: "unknown_account" });

      // A case's primary contact must be a real person actively linked to the
      // case's account. Without this check any contact id was accepted, so a
      // case could be filed under one company with a stranger as its contact.
      if (body.primaryContactId !== undefined) {
        const contact = store.contacts.find((c) => c.id === body.primaryContactId);
        if (!contact || !canViewContact(p, contact)) return res.status(400).json({ error: "unknown_contact" });
        const linked = store.accountContactLinks.some(
          (l) =>
            l.accountId === accountId &&
            l.contactId === body.primaryContactId &&
            !l.endedAt,
        );
        if (!linked) {
          return res.status(400).json({ error: "contact_not_linked_to_account" });
        }
      }

      const now = new Date().toISOString();
      const created: Case = {
        id: nextCaseId(),
        caseNumber: nextCaseNumber(),
        title: body.title,
        accountId,
        primaryContactId: body.primaryContactId ?? null,
        status: body.status,
        priority: body.priority,
        description: body.description,
        tags: body.tags,
        ownerName: me,
        ownerUserId: meId,
        createdAt: now,
        updatedAt: now,
      };
      store.cases.push(created);
      res.status(201).json(caseWithRelations(created, p));
    }),
  );

  r.get(
    "/cases/:id",
    allow("cases.view"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const c = findCaseFor(req, id);
      if (!c) return res.status(404).json({ error: "not_found" });
      res.json({
        ...caseWithRelations(c, principalOf(req)),
        tasks: store.tasks.filter((t) => t.caseId === id),
        documents: store.documents.filter((d) => d.caseId === id),
      });
    }),
  );

  r.patch(
    "/cases/:id",
    allow("cases.edit"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          title: z.string().optional(),
          status: caseStatus.optional(),
          priority: casePriority.optional(),
          description: z.string().optional(),
          tags: z.array(z.string()).optional(),
          accountId: z.number().int().positive().optional(),
          // null clears the primary contact; omitted leaves it unchanged.
          primaryContactId: z.number().int().positive().nullable().optional(),
        })
        .parse(req.body);
      const c = findCaseFor(req, id);
      if (!c) return res.status(404).json({ error: "not_found" });
      const p = principalOf(req);
      // Visible but outside the caller's edit scope (e.g. a CSR on a
      // colleague's case: they may log calls on it, not change it).
      if (!canOn(p, "cases.edit", c.ownerUserId)) return outOfScope(res, "cases.edit");

      // The same Account/Contact rules as POST /cases, applied to the
      // relationship the case would have AFTER this update. Nothing is
      // written unless every check passes.
      const nextAccountId = body.accountId ?? c.accountId;
      const contactSupplied = body.primaryContactId !== undefined;
      const nextContactId = contactSupplied ? body.primaryContactId ?? null : c.primaryContactId;
      const accountChanged = nextAccountId !== c.accountId;
      const contactChanged = nextContactId !== c.primaryContactId;

      if (
        body.accountId !== undefined &&
        !store.accounts.some((a) => a.id === body.accountId && canViewAccount(p, a))
      ) {
        return res.status(400).json({ error: "unknown_account" });
      }
      // Only a changed relationship is re-checked, so partial updates (status,
      // title, …) to an existing case keep working as before.
      if ((accountChanged || contactChanged) && nextContactId !== null) {
        const contact = store.contacts.find((x) => x.id === nextContactId);
        if (!contact || !canViewContact(p, contact)) return res.status(400).json({ error: "unknown_contact" });
        const linked = store.accountContactLinks.some(
          (l) => l.accountId === nextAccountId && l.contactId === nextContactId && !l.endedAt,
        );
        if (!linked) {
          if (!contactSupplied) {
            // Moving the case to another account would strand its current
            // primary contact. Never reassign silently: the caller must
            // supply a contact linked to the new account, or clear it (null).
            return res.status(400).json({
              error: "primary_contact_not_linked_to_account",
              message:
                "The case's primary contact is not linked to the new account. " +
                "Supply a primaryContactId linked to that account, or set it to null.",
            });
          }
          return res.status(400).json({ error: "contact_not_linked_to_account" });
        }
      }

      Object.assign(c, body, { updatedAt: new Date().toISOString() });
      res.json(caseWithRelations(c, p));
    }),
  );

  // ── Accounts ───────────────────────────────────────────────────────────────
  /**
   * An account as this viewer may read it (R2.2 redaction), with its linked
   * contact count and — only for viewers with cases.view — its case counts.
   * Without cases.view no case information is sent at all (R5).
   */
  function accountWithCounts(a: Account, p: Principal) {
    const contactCount = store.accountContactLinks.filter(
      (l) => l.accountId === a.id && !l.endedAt,
    ).length;
    const shaped = shapeAccount(p, a);
    if (!can(p.permissions, "cases.view")) return { ...shaped, contactCount };
    const cases = viewableCases(p).filter((c) => c.accountId === a.id);
    const caseCount = cases.length;
    const openCaseCount = cases.filter((c) => c.status !== "completed").length;
    return { ...shaped, contactCount, caseCount, openCaseCount };
  }

  r.get(
    "/accounts",
    allow("accounts.view"),
    asyncHandler(async (req, res) => {
      const q = z
        .object({ owner: z.string().optional(), search: z.string().optional() })
        .parse(req.query);
      const p = principalOf(req);
      // Search matches only name, state and industry — fields every viewer
      // may read in full (R2.2).
      let rows = rowsInScope(p, "accounts.view", store.accounts, (a) => a.ownerUserId);
      if (q.owner) rows = rows.filter((a) => ownerNamed(a.ownerUserId, a.ownerName, q.owner!));
      if (q.search) {
        const needle = q.search.toLowerCase();
        rows = rows.filter(
          (a) =>
            a.name.toLowerCase().includes(needle) ||
            (a.state ?? "").toLowerCase().includes(needle) ||
            (a.industry ?? "").toLowerCase().includes(needle),
        );
      }
      rows.sort((a, b) => a.name.localeCompare(b.name));
      res.json(rows.map((a) => accountWithCounts(a, p)));
    }),
  );

  r.post(
    "/accounts",
    allow("accounts.create"),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          name: z.string().min(1),
          state: z.string().optional(),
          entityType: z.string().optional(),
          industry: z.string().optional(),
          website: z.string().optional(),
          parentAccountId: z.number().int().positive().nullable().optional(),
        })
        .parse(req.body);
      const me = currentUser(req);
      const meId = requireAuth(req).user.id;
      const p = principalOf(req);
      // Every supplied field needs its group's edit permission (R2.3); the
      // new account is the caller's own, so any scope covers it.
      const denied = writeViolations(p, meId, suppliedKeys(body), accountFieldWritePermissions);
      if (denied.length) return forbiddenFields(res, denied);
      const now = new Date().toISOString();
      const created: Account = {
        id: nextAccountId(),
        name: body.name,
        portalId: null,
        oldCompanyName: null,
        state: body.state ?? null,
        entityType: body.entityType ?? null,
        portalLink: null,
        brand: null,
        subscriptionBundle: null,
        fincenId: null,
        fincenFilingDate: null,
        formationTier: null,
        automationStatus: null,
        stripeId: null,
        oldStripeIds: null,
        formationStatus: null,
        ownerName: me,
        ownerUserId: meId,
        archived: false,
        parentAccountId: body.parentAccountId ?? null,
        companyPhone: null,
        filingId: null,
        ein: null,
        formationDate: null,
        firstTransactionDate: null,
        abandonedCartUrl: null,
        phoneForwardingPhone: null,
        voPhone: null,
        isFormationAutomated: false,
        shareType: null,
        commonShareQuantity: null,
        commonShareValue: null,
        preferredShareQuantity: null,
        preferredShareValue: null,
        renewalStatus: null,
        renewalDate: null,
        principalAddress: null,
        mailingAddress: null,
        bankingAppId: null,
        bankingAppStatus: null,
        bankingAppMessage: null,
        industry: body.industry ?? null,
        website: body.website ?? null,
        createdAt: now,
        createdByName: me,
        lastModifiedAt: now,
        lastModifiedByName: me,
      };
      store.accounts.push(created);
      res.status(201).json(accountWithCounts(created, p));
    }),
  );

  r.get(
    "/accounts/:id",
    allow("accounts.view"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const p = principalOf(req);
      const a = store.accounts.find((x) => x.id === id);
      if (!a || !canViewAccount(p, a)) return res.status(404).json({ error: "not_found" });
      const linkedContacts = contactsForAccount(id)
        .filter(({ contact }) => canViewContact(p, contact))
        .map(({ contact, link }) => ({
          ...contact,
          fullName: contactFullName(contact),
          link,
        }));
      const detail = { ...accountWithCounts(a, p), contacts: linkedContacts };
      // No case data at all without cases.view (R5: Business Advisors).
      if (!can(p.permissions, "cases.view")) return res.json(detail);
      const cases = viewableCases(p)
        .filter((c) => c.accountId === id)
        .sort((x, y) => +new Date(y.updatedAt) - +new Date(x.updatedAt));
      res.json({ ...detail, cases });
    }),
  );

  const addressSchema = z.object({
    line1: z.string(),
    line2: z.string().nullable().optional(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
    country: z.string(),
  });

  r.patch(
    "/accounts/:id",
    allow(
      "accounts.edit.profile",
      "accounts.edit.service",
      "accounts.edit.formation",
      "accounts.edit.regulatory_ids",
      "accounts.edit.financial",
      "accounts.edit.system",
      "accounts.archive",
    ),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          // Core
          name: z.string().optional(),
          ownerName: z.string().optional(),
          // Account information
          portalId: z.number().int().nullable().optional(),
          oldCompanyName: z.string().nullable().optional(),
          state: z.string().nullable().optional(),
          entityType: z.string().nullable().optional(),
          portalLink: z.string().nullable().optional(),
          brand: z.string().nullable().optional(),
          subscriptionBundle: z.string().nullable().optional(),
          fincenId: z.string().nullable().optional(),
          fincenFilingDate: z.string().nullable().optional(),
          formationTier: z.string().nullable().optional(),
          automationStatus: z.string().nullable().optional(),
          stripeId: z.string().nullable().optional(),
          oldStripeIds: z.string().nullable().optional(),
          formationStatus: z.string().nullable().optional(),
          archived: z.boolean().optional(),
          parentAccountId: z.number().int().positive().nullable().optional(),
          companyPhone: z.string().nullable().optional(),
          filingId: z.string().nullable().optional(),
          ein: z.string().nullable().optional(),
          formationDate: z.string().nullable().optional(),
          firstTransactionDate: z.string().nullable().optional(),
          abandonedCartUrl: z.string().nullable().optional(),
          phoneForwardingPhone: z.string().nullable().optional(),
          voPhone: z.string().nullable().optional(),
          isFormationAutomated: z.boolean().optional(),
          shareType: z.string().nullable().optional(),
          commonShareQuantity: z.number().nullable().optional(),
          commonShareValue: z.number().nullable().optional(),
          preferredShareQuantity: z.number().nullable().optional(),
          preferredShareValue: z.number().nullable().optional(),
          // Renewal
          renewalStatus: z.string().nullable().optional(),
          renewalDate: z.string().nullable().optional(),
          // Addresses
          principalAddress: addressSchema.nullable().optional(),
          mailingAddress: addressSchema.nullable().optional(),
          // Banking
          bankingAppId: z.string().nullable().optional(),
          bankingAppStatus: z.string().nullable().optional(),
          bankingAppMessage: z.string().nullable().optional(),
          // Misc
          industry: z.string().nullable().optional(),
          website: z.string().nullable().optional(),
        })
        .parse(req.body);
      const p = principalOf(req);
      const a = store.accounts.find((x) => x.id === id);
      if (!a || !canViewAccount(p, a)) return res.status(404).json({ error: "not_found" });
      // R2.3: every touched field needs its group's edit permission, in scope
      // for this account. Any violation rejects the whole request — nothing
      // is partially saved.
      if (ownerNameInBody(res, body, `/api/accounts/${id}/owner`)) return;
      const denied = writeViolations(p, a.ownerUserId, suppliedKeys(body), accountFieldWritePermissions);
      if (denied.length) return forbiddenFields(res, denied);
      Object.assign(a, body);
      // Always bump last-modified on a PATCH.
      const me = currentUser(req);
      const meId = requireAuth(req).user.id;
      a.lastModifiedAt = new Date().toISOString();
      a.lastModifiedByName = me;
      res.json(accountWithCounts(a, p));
    }),
  );

  // ── Contacts ───────────────────────────────────────────────────────────────
  /** A contact with its (viewable) accounts and, with cases.view only, open case count. */
  function contactWithSummary(c: Contact, p: Principal) {
    const accounts = accountsForContact(c.id).filter(({ account }) => canViewAccount(p, account));
    const summary = {
      ...c,
      fullName: contactFullName(c),
      accountCount: accounts.length,
      accountNames: accounts.map(({ account }) => account.name),
    };
    if (!can(p.permissions, "cases.view")) return summary;
    return {
      ...summary,
      openCaseCount: viewableCases(p).filter(
        (cs) =>
          cs.status !== "completed" &&
          (cs.primaryContactId === c.id ||
            accounts.some(({ account }) => account.id === cs.accountId)),
      ).length,
    };
  }

  r.get(
    "/contacts",
    allow("contacts.view"),
    asyncHandler(async (req, res) => {
      const q = z
        .object({
          owner: z.string().optional(),
          accountId: z.coerce.number().int().optional(),
          search: z.string().optional(),
        })
        .parse(req.query);
      const p = principalOf(req);
      let rows = rowsInScope(p, "contacts.view", store.contacts, (c) => c.ownerUserId);
      if (q.owner) rows = rows.filter((c) => ownerNamed(c.ownerUserId, c.ownerName, q.owner!));
      if (q.accountId) {
        const ids = new Set(
          store.accountContactLinks
            .filter((l) => l.accountId === q.accountId && !l.endedAt)
            .map((l) => l.contactId),
        );
        rows = rows.filter((c) => ids.has(c.id));
      }
      if (q.search) {
        const needle = q.search.toLowerCase();
        rows = rows.filter(
          (c) =>
            contactFullName(c).toLowerCase().includes(needle) ||
            (c.email ?? "").toLowerCase().includes(needle) ||
            (c.title ?? "").toLowerCase().includes(needle),
        );
      }
      rows.sort((a, b) =>
        contactFullName(a).localeCompare(contactFullName(b)),
      );
      res.json(rows.map((c) => contactWithSummary(c, p)));
    }),
  );

  r.post(
    "/contacts",
    allow("contacts.create"),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          firstName: z.string().min(1),
          lastName: z.string().min(1),
          email: z.string().optional(),
          phone: z.string().optional(),
          title: z.string().optional(),
        })
        .parse(req.body);
      const me = currentUser(req);
      const meId = requireAuth(req).user.id;
      const created: Contact = {
        id: nextContactId(),
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email ?? null,
        phone: body.phone ?? null,
        title: body.title ?? null,
        ownerName: me,
        ownerUserId: meId,
        createdAt: new Date().toISOString(),
      };
      store.contacts.push(created);
      res.status(201).json(contactWithSummary(created, principalOf(req)));
    }),
  );

  r.get(
    "/contacts/:id",
    allow("contacts.view"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const p = principalOf(req);
      const c = store.contacts.find((x) => x.id === id);
      if (!c || !canViewContact(p, c)) return res.status(404).json({ error: "not_found" });
      const accounts = accountsForContact(id)
        .filter(({ account }) => canViewAccount(p, account))
        .map(({ account, link }) => ({
          ...shapeAccount(p, account),
          link,
        }));
      const detail = { ...c, fullName: contactFullName(c), accounts };
      // No case data at all without cases.view (R5: Business Advisors).
      if (!can(p.permissions, "cases.view")) return res.json(detail);
      const cases = viewableCases(p)
        .filter(
          (cs) =>
            cs.primaryContactId === id ||
            accounts.some((a) => a.id === cs.accountId),
        )
        .sort((x, y) => +new Date(y.updatedAt) - +new Date(x.updatedAt));
      res.json({ ...detail, cases });
    }),
  );

  r.patch(
    "/contacts/:id",
    allow("contacts.edit"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().nullable().optional(),
          phone: z.string().nullable().optional(),
          title: z.string().nullable().optional(),
          ownerName: z.string().optional(),
        })
        .parse(req.body);
      const p = principalOf(req);
      const c = store.contacts.find((x) => x.id === id);
      if (!c || !canViewContact(p, c)) return res.status(404).json({ error: "not_found" });
      if (ownerNameInBody(res, body, `/api/contacts/${id}/owner`)) return;
      // Every field needs contacts.edit in scope. All or nothing.
      const denied = writeViolations(p, c.ownerUserId, suppliedKeys(body), () => ["contacts.edit"]);
      if (denied.length) return forbiddenFields(res, denied);
      Object.assign(c, body);
      res.json(contactWithSummary(c, p));
    }),
  );

  // ── Account ↔ Contact links ────────────────────────────────────────────────
  /** A link is visible when both its account and its contact are. */
  function linkVisible(p: Principal, link: AccountContactLink): boolean {
    const acct = store.accounts.find((a) => a.id === link.accountId);
    const person = store.contacts.find((c) => c.id === link.contactId);
    return !!acct && !!person && canViewAccount(p, acct) && canViewContact(p, person);
  }

  r.post(
    "/account-contacts",
    allow("contacts.link"),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          accountId: z.number().int().positive(),
          contactId: z.number().int().positive(),
          role: z.string().min(1),
          ownershipPct: z.number().min(0).max(100).nullable().optional(),
          isPrimary: z.boolean().optional(),
          isSignatory: z.boolean().optional(),
        })
        .parse(req.body);
      const p = principalOf(req);
      // Records the caller may not view are reported as unknown.
      const acct = store.accounts.find((a) => a.id === body.accountId);
      if (!acct || !canViewAccount(p, acct))
        return res.status(400).json({ error: "unknown_account" });
      const person = store.contacts.find((c) => c.id === body.contactId);
      if (!person || !canViewContact(p, person))
        return res.status(400).json({ error: "unknown_contact" });
      // If we're marking this as primary, demote any other primary on the same account.
      if (body.isPrimary) {
        for (const l of store.accountContactLinks) {
          if (l.accountId === body.accountId && !l.endedAt) l.isPrimary = false;
        }
      }
      const created: AccountContactLink = {
        id: nextAccountContactLinkId(),
        accountId: body.accountId,
        contactId: body.contactId,
        role: body.role,
        ownershipPct: body.ownershipPct ?? null,
        isPrimary: body.isPrimary ?? false,
        isSignatory: body.isSignatory ?? false,
        startedAt: new Date().toISOString(),
        endedAt: null,
      };
      store.accountContactLinks.push(created);
      res.status(201).json(created);
    }),
  );

  r.patch(
    "/account-contacts/:id",
    allow("contacts.link"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          role: z.string().optional(),
          ownershipPct: z.number().min(0).max(100).nullable().optional(),
          isPrimary: z.boolean().optional(),
          isSignatory: z.boolean().optional(),
          endedAt: z.string().datetime().nullable().optional(),
        })
        .parse(req.body);
      const link = store.accountContactLinks.find((l) => l.id === id);
      if (!link || !linkVisible(principalOf(req), link)) return res.status(404).json({ error: "not_found" });
      if (body.isPrimary) {
        for (const l of store.accountContactLinks) {
          if (l.accountId === link.accountId && l.id !== link.id && !l.endedAt) l.isPrimary = false;
        }
      }
      Object.assign(link, body);
      res.json(link);
    }),
  );

  r.delete(
    "/account-contacts/:id",
    allow("contacts.link"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const idx = store.accountContactLinks.findIndex((l) => l.id === id);
      if (idx === -1 || !linkVisible(principalOf(req), store.accountContactLinks[idx]))
        return res.status(404).json({ error: "not_found" });
      store.accountContactLinks.splice(idx, 1);
      res.status(204).end();
    }),
  );

  // ── Leads ──────────────────────────────────────────────────────────────────
  r.get(
    "/leads",
    allow("leads.view"),
    asyncHandler(async (req, res) => {
      const q = z
        .object({
          owner: z.string().optional(),
          status: leadStatus.optional(),
          search: z.string().optional(),
        })
        .parse(req.query);
      let rows = rowsInScope(principalOf(req), "leads.view", store.leads, (l) => l.ownerUserId);
      if (q.owner) rows = rows.filter((l) => ownerNamed(l.ownerUserId, l.ownerName, q.owner!));
      if (q.status) rows = rows.filter((l) => l.status === q.status);
      if (q.search) {
        const needle = q.search.toLowerCase();
        rows = rows.filter(
          (l) =>
            `${l.firstName} ${l.lastName}`.toLowerCase().includes(needle) ||
            (l.companyName ?? "").toLowerCase().includes(needle) ||
            (l.email ?? "").toLowerCase().includes(needle),
        );
      }
      rows.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
      res.json(rows);
    }),
  );

  r.post(
    "/leads",
    allow("leads.create"),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          firstName: z.string().min(1),
          lastName: z.string().min(1),
          email: z.string().optional(),
          phone: z.string().optional(),
          companyName: z.string().optional(),
          intendedState: z.string().optional(),
          intendedEntityType: z.string().optional(),
          source: leadSource.default("other"),
          status: leadStatus.default("new"),
          notes: z.string().optional(),
          estimatedValue: z.number().optional(),
        })
        .parse(req.body);
      const me = currentUser(req);
      const meId = requireAuth(req).user.id;
      const now = new Date().toISOString();
      const created: Lead = {
        id: nextLeadId(),
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email ?? null,
        phone: body.phone ?? null,
        companyName: body.companyName ?? null,
        intendedState: body.intendedState ?? null,
        intendedEntityType: body.intendedEntityType ?? null,
        source: body.source,
        status: body.status,
        notes: body.notes ?? null,
        ownerName: me,
        ownerUserId: meId,
        estimatedValue: body.estimatedValue ?? null,
        convertedAt: null,
        convertedAccountId: null,
        convertedContactId: null,
        createdAt: now,
        updatedAt: now,
      };
      store.leads.push(created);
      res.status(201).json(created);
    }),
  );

  r.patch(
    "/leads/:id",
    allow("leads.edit"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().nullable().optional(),
          phone: z.string().nullable().optional(),
          companyName: z.string().nullable().optional(),
          intendedState: z.string().nullable().optional(),
          intendedEntityType: z.string().nullable().optional(),
          source: leadSource.optional(),
          status: leadStatus.optional(),
          notes: z.string().nullable().optional(),
          ownerName: z.string().optional(),
          estimatedValue: z.number().nullable().optional(),
        })
        .parse(req.body);
      const p = principalOf(req);
      const l = store.leads.find((x) => x.id === id);
      if (!l || !canViewLead(p, l)) return res.status(404).json({ error: "not_found" });
      if (ownerNameInBody(res, body, `/api/leads/${id}/owner`)) return;
      // Every field needs leads.edit in scope. All or nothing.
      const denied = writeViolations(p, l.ownerUserId, suppliedKeys(body), () => ["leads.edit"]);
      if (denied.length) return forbiddenFields(res, denied);
      Object.assign(l, body, { updatedAt: new Date().toISOString() });
      res.json(l);
    }),
  );

  /**
   * Convert a lead into a real Account + Contact (+ optional starter Case).
   * Atomic operation: creates all records, links them, marks lead converted.
   */
  r.post(
    "/leads/:id/convert",
    allow("leads.convert"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          accountName: z.string().min(1),
          accountState: z.string().optional(),
          accountEntityType: z.string().optional(),
          accountIndustry: z.string().optional(),
          contactTitle: z.string().optional(),
          linkRole: z.string().min(1),
          ownershipPct: z.number().min(0).max(100).nullable().optional(),
          createInitialCase: z.boolean().optional(),
          initialCaseTitle: z.string().optional(),
          initialCasePriority: casePriority.optional(),
        })
        .parse(req.body);
      const p = principalOf(req);
      const lead = store.leads.find((l) => l.id === id);
      if (!lead || !canViewLead(p, lead)) return res.status(404).json({ error: "not_found" });
      if (!canOn(p, "leads.convert", lead.ownerUserId)) return outOfScope(res, "leads.convert");
      if (lead.convertedAt)
        return res.status(409).json({ error: "already_converted" });
      // B4: the optional first Case needs cases.create. Refused as a whole —
      // nothing is created — so the caller can retry without it.
      if (body.createInitialCase && !can(p.permissions, "cases.create"))
        return forbidden(res, "cases.create");

      const now = new Date().toISOString();
      const me = currentUser(req);
      const meId = requireAuth(req).user.id;

      // 1. Create Account
      const account: Account = makeAccount({
        id: nextAccountId(),
        name: body.accountName,
        state: body.accountState ?? lead.intendedState ?? null,
        entityType: body.accountEntityType ?? lead.intendedEntityType ?? null,
        industry: body.accountIndustry ?? null,
        website: null,
        parentAccountId: null,
        ownerName: me,
        ownerUserId: meId,
        createdAt: now,
        createdByName: me,
        lastModifiedAt: now,
        lastModifiedByName: me,
      });
      store.accounts.push(account);

      // 2. Create Contact
      const contact: Contact = {
        id: nextContactId(),
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        title: body.contactTitle ?? null,
        ownerName: me,
        ownerUserId: meId,
        createdAt: now,
      };
      store.contacts.push(contact);

      // 3. Link them
      const link: AccountContactLink = {
        id: nextAccountContactLinkId(),
        accountId: account.id,
        contactId: contact.id,
        role: body.linkRole,
        ownershipPct: body.ownershipPct ?? null,
        isPrimary: true,
        isSignatory: true,
        startedAt: now,
        endedAt: null,
      };
      store.accountContactLinks.push(link);

      // 4. (Optional) Create initial Case
      let createdCase: Case | null = null;
      if (body.createInitialCase && body.initialCaseTitle) {
        createdCase = {
          id: nextCaseId(),
          caseNumber: nextCaseNumber(),
          title: body.initialCaseTitle,
          accountId: account.id,
          primaryContactId: contact.id,
          status: "intake",
          priority: body.initialCasePriority ?? "medium",
          description: lead.notes ?? "",
          tags: [],
          ownerName: me,
        ownerUserId: meId,
          createdAt: now,
          updatedAt: now,
        };
        store.cases.push(createdCase);
      }

      // 5. Mark lead converted
      lead.status = "converted";
      lead.convertedAt = now;
      lead.convertedAccountId = account.id;
      lead.convertedContactId = contact.id;
      lead.updatedAt = now;

      res.status(201).json({
        lead,
        account: shapeAccount(p, account),
        contact,
        link,
        case: createdCase,
      });
    }),
  );

  r.delete(
    "/leads/:id",
    allow("leads.delete"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const p = principalOf(req);
      const idx = store.leads.findIndex((l) => l.id === id);
      if (idx === -1 || !canViewLead(p, store.leads[idx])) return res.status(404).json({ error: "not_found" });
      if (!canOn(p, "leads.delete", store.leads[idx].ownerUserId)) return outOfScope(res, "leads.delete");
      store.leads.splice(idx, 1);
      res.status(204).end();
    }),
  );

  // ── Reassignment (RBAC Phase 4) ─────────────────────────────────────────────
  // PUT /api/{cases|leads|accounts|contacts}/:id/owner  { ownerUserId }
  //
  // The only way a record changes owner. By employee id — a display name from
  // the client is never used. Rules (D7):
  //   - the caller holds <type>.assign; the record must be visible (else 404)
  //   - the CURRENT owner must be inside the caller's assign scope
  //   - the TARGET must exist, be active, be able to view that record type,
  //     and be inside the caller's assign scope too (team scope never crosses
  //     teams; only "all" does)
  const ownerBody = z.object({ ownerUserId: z.number().int().positive() }).strict();

  /**
   * The employees the caller may make owner of a record of this type — the
   * reassign picker (Phase 5). The same target rules as the PUT routes:
   * active, able to view the record type, inside the caller's assign scope.
   * (The PUT still checks the record's current owner and everything else.)
   */
  for (const type of ["cases", "leads", "accounts", "contacts"] as const) {
    r.get(
      `/owners/${type}/candidates`,
      allow(ASSIGN_PERMISSION[type]),
      asyncHandler(async (req, res) => {
        const p = principalOf(req);
        const assign = ASSIGN_PERMISSION[type];
        const mustView = OWNER_MUST_VIEW[type];
        const rows = activeEmployees()
          .filter((u) => can(resolvePermissions(u.roles), mustView))
          .filter((u) => canOn(p, assign, u.id))
          .map((u) => ({ id: u.id, name: u.name }));
        res.json(rows);
      }),
    );
  }

  type Owned = { ownerUserId: number | null; ownerName: string };

  /** Validates a reassignment; sends the error and returns null, or the target. */
  function reassignTarget(
    req: Request,
    res: Response,
    record: Owned,
    assign: Permission,
    targetMustHold: Permission,
  ): User | null {
    const p = principalOf(req);
    const body = ownerBody.parse(req.body);
    if (!canOn(p, assign, record.ownerUserId)) {
      outOfScope(res, assign);
      return null;
    }
    const target = userById(body.ownerUserId);
    if (!target) {
      res.status(400).json({ error: "unknown_user" });
      return null;
    }
    if (!target.active) {
      res.status(400).json({ error: "inactive_user" });
      return null;
    }
    if (!can(resolvePermissions(target.roles), targetMustHold)) {
      res.status(400).json({ error: "target_cannot_own", permission: targetMustHold });
      return null;
    }
    if (!canOn(p, assign, target.id)) {
      res.status(403).json({ error: "target_out_of_scope", permission: assign });
      return null;
    }
    return target;
  }

  function setOwner(record: Owned, target: User) {
    record.ownerUserId = target.id;
    record.ownerName = target.name; // display label follows the new owner
  }

  r.put(
    "/cases/:id/owner",
    allow("cases.assign"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const c = findCaseFor(req, id);
      if (!c) return res.status(404).json({ error: "not_found" });
      const target = reassignTarget(req, res, c, "cases.assign", "cases.view");
      if (!target) return;
      setOwner(c, target);
      c.updatedAt = new Date().toISOString();
      res.json(caseWithRelations(c, principalOf(req)));
    }),
  );

  r.put(
    "/leads/:id/owner",
    allow("leads.assign"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const l = store.leads.find((x) => x.id === id);
      if (!l || !canViewLead(principalOf(req), l)) return res.status(404).json({ error: "not_found" });
      const target = reassignTarget(req, res, l, "leads.assign", "leads.view");
      if (!target) return;
      setOwner(l, target);
      l.updatedAt = new Date().toISOString();
      res.json(l);
    }),
  );

  r.put(
    "/accounts/:id/owner",
    allow("accounts.assign"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const p = principalOf(req);
      const a = store.accounts.find((x) => x.id === id);
      if (!a || !canViewAccount(p, a)) return res.status(404).json({ error: "not_found" });
      const target = reassignTarget(req, res, a, "accounts.assign", "accounts.view");
      if (!target) return;
      setOwner(a, target);
      a.lastModifiedAt = new Date().toISOString();
      a.lastModifiedByName = currentUser(req);
      res.json(accountWithCounts(a, p));
    }),
  );

  r.put(
    "/contacts/:id/owner",
    allow("contacts.assign"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const p = principalOf(req);
      const c = store.contacts.find((x) => x.id === id);
      if (!c || !canViewContact(p, c)) return res.status(404).json({ error: "not_found" });
      const target = reassignTarget(req, res, c, "contacts.assign", "contacts.view");
      if (!target) return;
      setOwner(c, target);
      res.json(contactWithSummary(c, p));
    }),
  );

  // ── Tasks ──────────────────────────────────────────────────────────────────
  r.get(
    "/tasks",
    allow("cases.view"),
    asyncHandler(async (req, res) => {
      const q = z.object({ caseId: z.coerce.number().int().optional() }).parse(req.query);
      const visible = new Set(viewableCases(principalOf(req)).map((c) => c.id));
      let rows = store.tasks.filter((t) => visible.has(t.caseId));
      if (q.caseId) rows = rows.filter((t) => t.caseId === q.caseId);
      rows.sort((a, b) => {
        const ad = a.dueDate ? +new Date(a.dueDate) : Infinity;
        const bd = b.dueDate ? +new Date(b.dueDate) : Infinity;
        return ad - bd;
      });
      res.json(rows);
    }),
  );

  r.post(
    "/tasks",
    allow("cases.work"),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          caseId: z.number().int().positive(),
          title: z.string().min(1),
          description: z.string().optional(),
          status: taskStatus.default("pending"),
          dueDate: z.string().datetime().optional(),
        })
        .parse(req.body);
      const taskCase = findCaseFor(req, body.caseId);
      if (!taskCase) return res.status(404).json({ error: "case_not_found" });
      if (!canOn(principalOf(req), "cases.work", taskCase.ownerUserId)) return outOfScope(res, "cases.work");
      const created = {
        id: nextTaskId(),
        caseId: body.caseId,
        title: body.title,
        description: body.description ?? null,
        status: body.status as TaskStatus,
        dueDate: body.dueDate ?? null,
        createdAt: new Date().toISOString(),
      };
      store.tasks.push(created);
      res.status(201).json(created);
    }),
  );

  r.patch(
    "/tasks/:id",
    allow("cases.work"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          title: z.string().optional(),
          description: z.string().optional(),
          status: taskStatus.optional(),
          dueDate: z.string().datetime().nullable().optional(),
        })
        .parse(req.body);
      const t = store.tasks.find((x) => x.id === id);
      const taskCase = t ? findCaseFor(req, t.caseId) : undefined;
      if (!t || !taskCase) return res.status(404).json({ error: "not_found" });
      if (!canOn(principalOf(req), "cases.work", taskCase.ownerUserId)) return outOfScope(res, "cases.work");
      Object.assign(t, body);
      res.json(t);
    }),
  );

  // ── Documents ──────────────────────────────────────────────────────────────
  r.get(
    "/documents",
    allow("cases.view"),
    asyncHandler(async (req, res) => {
      const q = z.object({ caseId: z.coerce.number().int().optional() }).parse(req.query);
      const visible = new Set(viewableCases(principalOf(req)).map((c) => c.id));
      let rows = store.documents.filter((d) => visible.has(d.caseId));
      if (q.caseId) rows = rows.filter((d) => d.caseId === q.caseId);
      rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      res.json(rows);
    }),
  );

  r.post(
    "/documents",
    allow("cases.work"),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          caseId: z.number().int().positive(),
          filename: z.string().min(1),
          fileUrl: z.string().min(1),
          type: docType.default("other"),
          size: z.number().int().nonnegative().default(0),
          tags: z.array(z.string()).optional().default([]),
        })
        .parse(req.body);
      const docCase = findCaseFor(req, body.caseId);
      if (!docCase) return res.status(404).json({ error: "case_not_found" });
      if (!canOn(principalOf(req), "cases.work", docCase.ownerUserId)) return outOfScope(res, "cases.work");
      const created = {
        id: nextDocumentId(),
        caseId: body.caseId,
        filename: body.filename,
        fileUrl: body.fileUrl,
        type: body.type as DocumentType,
        size: body.size,
        tags: body.tags,
        createdAt: new Date().toISOString(),
      };
      store.documents.push(created);
      res.status(201).json(created);
    }),
  );

  // ── Case Interactions (phone/email/meeting logs) ───────────────────────────
  const contactDirection = z.enum(["inbound", "outbound"]);
  const contactChannel = z.enum(["phone", "email", "sms", "meeting", "other"]);

  r.get(
    "/cases/:id/contacts",
    allow("cases.view"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      if (!findCaseFor(req, id)) return res.status(404).json({ error: "not_found" });
      const rows = store.caseInteractions
        .filter((c) => c.caseId === id)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      res.json(rows);
    }),
  );

  r.post(
    "/cases/:id/contacts",
    allow("cases.work"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          direction: contactDirection,
          channel: contactChannel,
          summary: z.string().min(1),
          contact: z.string().min(1),
          // Accepted for compatibility but ignored: the author is the session.
          byName: z.string().optional(),
        })
        .parse(req.body);
      const c = findCaseFor(req, id);
      if (!c) return res.status(404).json({ error: "not_found" });
      if (!canOn(principalOf(req), "cases.work", c.ownerUserId)) return outOfScope(res, "cases.work");
      const created = {
        id: nextCaseInteractionId(),
        caseId: id,
        direction: body.direction,
        channel: body.channel,
        summary: body.summary,
        contact: body.contact,
        byName: currentUser(req),
        byUserId: requireAuth(req).user.id,
        createdAt: new Date().toISOString(),
      };
      store.caseInteractions.push(created);
      res.status(201).json(created);
    }),
  );

  // ── Case Thread Entries ────────────────────────────────────────────────────
  r.get(
    "/cases/:id/thread",
    allow("cases.view"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      if (!findCaseFor(req, id)) return res.status(404).json({ error: "not_found" });
      const rows = store.threadEntries
        .filter((t) => t.caseId === id)
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
      res.json(rows);
    }),
  );

  r.post(
    "/cases/:id/thread",
    allow("cases.work"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          // Accepted for compatibility but ignored: the author is the session.
          authorName: z.string().optional(),
          body: z.string().min(1),
        })
        .parse(req.body);
      const c = findCaseFor(req, id);
      if (!c) return res.status(404).json({ error: "not_found" });
      if (!canOn(principalOf(req), "cases.work", c.ownerUserId)) return outOfScope(res, "cases.work");
      const authorUser = requireAuth(req).user;
      const created = {
        id: nextThreadEntryId(),
        caseId: id,
        authorName: authorUser.name,
        authorUserId: authorUser.id,
        body: body.body,
        createdAt: new Date().toISOString(),
      };
      store.threadEntries.push(created);

      // Only active employees who may view this case are notified.
      const mentioned = parseMentions(body.body, authorUser.id).filter((u) =>
        canViewCase(principalFor(u), c),
      );
      for (const recipient of mentioned) {
        store.mentions.push({
          id: nextMentionId(),
          threadEntryId: created.id,
          caseId: c.id,
          fromName: authorUser.name,
          toName: recipient.name,
          fromUserId: authorUser.id,
          toUserId: recipient.id,
          body: body.body,
          readAt: null,
          createdAt: new Date().toISOString(),
        });
      }

      res.status(201).json({ ...created, mentioned: mentioned.map((u) => u.name) });
    }),
  );

  // ── Mentions inbox ─────────────────────────────────────────────────────────
  /**
   * Your own mentions only. `for` is accepted for compatibility but must be
   * you; asking for anyone else's inbox is refused. A mention from a case you
   * may not view is left out entirely (its text is case content).
   */
  r.get(
    "/mentions",
    allow("messages.use"),
    asyncHandler(async (req, res) => {
      const q = z.object({ for: z.string().optional() }).parse(req.query);
      const p = principalOf(req);
      if (q.for !== undefined && q.for !== p.user.name) {
        return res.status(403).json({ error: "not_your_mentions" });
      }
      const rows = store.mentions
        .map((m) => ({ m, c: store.cases.find((x) => x.id === m.caseId) ?? null }))
        .filter(({ m, c }) => m.toUserId === p.user.id && (c === null || canViewCase(p, c)));
      rows.sort((a, b) => +new Date(b.m.createdAt) - +new Date(a.m.createdAt));
      res.json(
        rows.map(({ m, c }) => ({
          ...m,
          caseNumber: c?.caseNumber ?? null,
          caseTitle: c?.title ?? null,
        })),
      );
    }),
  );

  r.patch(
    "/mentions/:id/read",
    allow("messages.use"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const m = store.mentions.find((x) => x.id === id);
      // Only your own mentions exist, as far as you can tell.
      if (!m || m.toUserId !== requireAuth(req).user.id) return res.status(404).json({ error: "not_found" });
      m.readAt = new Date().toISOString();
      res.json(m);
    }),
  );

  // Names for owner pickers and @mention autocomplete: the active employees.
  r.get(
    "/team",
    allow("messages.use"),
    asyncHandler(async (_req, res) => {
      res.json(activeEmployees().map((u) => u.name));
    }),
  );

  // ── Automations ────────────────────────────────────────────────────────────
  // Scope model (see store.ts): a global automation is ONE row offered to every
  // case by union at read time. A case that forks a global gets its own copy and
  // the original is hidden from that case only.

  /** Global ids this case has forked, and which are therefore hidden from it. */
  function forkedGlobalIds(caseId: number): Set<number> {
    return new Set(
      store.automations
        .filter(
          (a) =>
            a.scope === "case" &&
            a.caseId === caseId &&
            a.derivedFromAutomationId !== null,
        )
        .map((a) => a.derivedFromAutomationId as number),
    );
  }

  /**
   * What this case can actually see: every global it has not customised, plus
   * everything it owns. Nothing is written to produce this list, which is why a
   * case created tomorrow already has today's globals.
   */
  function effectiveAutomationsForCase(caseId: number): Automation[] {
    const hidden = forkedGlobalIds(caseId);
    const byName = (a: Automation, b: Automation) => a.name.localeCompare(b.name);
    const globals = store.automations
      .filter((a) => a.scope === "global" && !hidden.has(a.id))
      .sort(byName);
    const own = store.automations
      .filter((a) => a.scope === "case" && a.caseId === caseId)
      .sort(byName);
    return [...globals, ...own];
  }

  /** List shape: the graph is omitted, and the UI-facing flags are derived. */
  function automationSummary(a: Automation) {
    const { graph, ...rest } = a;
    return {
      ...rest,
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      /** Reaches the case through the global union rather than being owned by it. */
      inherited: a.scope === "global",
      /** A case-scoped row standing in for a global. */
      customized: a.scope === "case" && a.derivedFromAutomationId !== null,
    };
  }

  /** Blast radius, for the confirmation dialogs. */
  function automationUsage(a: Automation) {
    if (a.scope === "case") {
      return { scope: a.scope, caseCount: 1, forkedByCaseCount: 0 };
    }
    const forks = store.automations.filter(
      (x) => x.scope === "case" && x.derivedFromAutomationId === a.id,
    ).length;
    return {
      scope: a.scope,
      caseCount: Math.max(store.cases.length - forks, 0),
      forkedByCaseCount: forks,
    };
  }

  function findAutomation(id: number): Automation | undefined {
    return store.automations.find((a) => a.id === id);
  }

  /** The case a case-scoped automation belongs to (null for globals). */
  function automationCase(a: Automation): Case | null {
    return a.caseId === null ? null : store.cases.find((c) => c.id === a.caseId) ?? null;
  }

  /** Globals are visible to every case viewer; a case automation follows its case. */
  function automationVisible(p: Principal, a: Automation): boolean {
    if (a.scope === "global") return true;
    const c = automationCase(a);
    return !!c && canViewCase(p, c);
  }

  /**
   * May `p` change `a`? Globals need automations.manage_global; a case
   * automation needs automations.edit in scope for its case's owner (the
   * permission follows the case). Sends the 403 and returns false if not.
   */
  function mayWriteAutomation(p: Principal, a: Automation, res: Response): boolean {
    if (a.scope === "global") {
      if (!can(p.permissions, "automations.manage_global")) {
        forbidden(res, "automations.manage_global");
        return false;
      }
      return true;
    }
    if (!canOn(p, "automations.edit", automationCase(a)?.ownerUserId)) {
      outOfScope(res, "automations.edit");
      return false;
    }
    return true;
  }

  function touch(a: Automation, me: string) {
    a.updatedAt = new Date().toISOString();
    a.lastModifiedByName = me;
  }

  const autoIdParam = z.object({ autoId: z.coerce.number().int().positive() });

  /** Everything this case can see, globals first, each group by name. */
  r.get(
    "/cases/:id/automations",
    allow("cases.view"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      if (!findCaseFor(req, id)) return res.status(404).json({ error: "case_not_found" });
      res.json(effectiveAutomationsForCase(id).map(automationSummary));
    }),
  );

  /**
   * Create an automation from a case.
   *
   * `scope` decides where it lives, in one atomic operation — a global is
   * created global, never created case-scoped and then promoted:
   *
   *   "case"   (default) owned by this case, invisible elsewhere
   *   "global" owned by no case, offered to every case by union at read time,
   *            with this case recorded as originCaseId for provenance
   *
   * Omitting `scope` keeps the original behaviour, so older callers still
   * create case-scoped automations.
   */
  r.post(
    "/cases/:id/automations",
    allow("automations.edit", "automations.manage_global"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const target = findCaseFor(req, id);
      if (!target) return res.status(404).json({ error: "case_not_found" });
      const body = z
        .object({
          name: automationName,
          graph: automationGraphSchema.optional(),
          enabled: z.boolean().optional(),
          scope: z.enum(["case", "global"]).default("case"),
        })
        .parse(req.body);
      const p = principalOf(req);
      if (body.scope === "global" && !can(p.permissions, "automations.manage_global"))
        return forbidden(res, "automations.manage_global");
      if (body.scope === "case" && !canOn(p, "automations.edit", target.ownerUserId))
        return outOfScope(res, "automations.edit");
      const me = currentUser(req);
      const meId = requireAuth(req).user.id;
      const now = new Date().toISOString();
      const isGlobal = body.scope === "global";
      const created: Automation = {
        id: nextAutomationId(),
        name: body.name,
        scope: body.scope,
        caseId: isGlobal ? null : id,
        graph: body.graph ?? EMPTY_GRAPH,
        enabled: body.enabled ?? true,
        derivedFromAutomationId: null,
        originCaseId: isGlobal ? id : null,
        ownerName: me,
        ownerUserId: meId,
        createdAt: now,
        createdByName: me,
        updatedAt: now,
        lastModifiedByName: me,
      };
      store.automations.push(created);
      res.status(201).json(created);
    }),
  );

  /** Global library listing, for admin surfaces. */
  r.get(
    "/automations",
    allow("cases.view"),
    asyncHandler(async (req, res) => {
      const q = z.object({ scope: z.enum(["case", "global"]).optional() }).parse(req.query);
      const p = principalOf(req);
      const rows = store.automations
        .filter((a) => (q.scope ? a.scope === q.scope : true))
        .filter((a) => automationVisible(p, a))
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json(rows.map(automationSummary));
    }),
  );

  /** One automation, graph included. */
  r.get(
    "/automations/:autoId",
    allow("cases.view"),
    asyncHandler(async (req, res) => {
      const { autoId } = autoIdParam.parse(req.params);
      const a = findAutomation(autoId);
      if (!a || !automationVisible(principalOf(req), a)) return res.status(404).json({ error: "not_found" });
      res.json(a);
    }),
  );

  /** How many cases an edit or delete would reach. */
  r.get(
    "/automations/:autoId/usage",
    allow("cases.view"),
    asyncHandler(async (req, res) => {
      const { autoId } = autoIdParam.parse(req.params);
      const a = findAutomation(autoId);
      if (!a || !automationVisible(principalOf(req), a)) return res.status(404).json({ error: "not_found" });
      res.json(automationUsage(a));
    }),
  );

  /** Rename, re-graph or enable/disable. Scope is changed elsewhere. */
  r.patch(
    "/automations/:autoId",
    allow("automations.edit", "automations.manage_global"),
    asyncHandler(async (req, res) => {
      const { autoId } = autoIdParam.parse(req.params);
      const p = principalOf(req);
      const a = findAutomation(autoId);
      if (!a || !automationVisible(p, a)) return res.status(404).json({ error: "not_found" });
      if (!mayWriteAutomation(p, a, res)) return;
      const body = z
        .object({
          name: automationName.optional(),
          graph: automationGraphSchema.optional(),
          enabled: z.boolean().optional(),
        })
        .parse(req.body);
      if (body.name !== undefined) a.name = body.name;
      if (body.graph !== undefined) a.graph = body.graph;
      if (body.enabled !== undefined) a.enabled = body.enabled;
      touch(a, currentUser(req));
      res.json(a);
    }),
  );

  /**
   * Delete. Removing a global removes it from every case at once; any
   * case-scoped fork of it survives as an independent automation, with its
   * now-dangling provenance pointer cleared.
   */
  r.delete(
    "/automations/:autoId",
    allow("automations.edit", "automations.manage_global"),
    asyncHandler(async (req, res) => {
      const { autoId } = autoIdParam.parse(req.params);
      const p = principalOf(req);
      const idx = store.automations.findIndex((a) => a.id === autoId);
      if (idx === -1 || !automationVisible(p, store.automations[idx]))
        return res.status(404).json({ error: "not_found" });
      if (!mayWriteAutomation(p, store.automations[idx], res)) return;
      const [removed] = store.automations.splice(idx, 1);
      if (removed.scope === "global") {
        for (const other of store.automations) {
          if (other.derivedFromAutomationId === removed.id) {
            other.derivedFromAutomationId = null;
          }
        }
      }
      res.status(204).end();
    }),
  );

  /**
   * "Apply to all cases" — promote a case automation to global, in place.
   * Promoting rather than copying keeps one row, so the originating case does
   * not end up editing a private twin of the shared automation.
   */
  r.post(
    "/automations/:autoId/promote",
    allow("automations.manage_global"),
    asyncHandler(async (req, res) => {
      const { autoId } = autoIdParam.parse(req.params);
      const a = findAutomation(autoId);
      if (!a || !automationVisible(principalOf(req), a)) return res.status(404).json({ error: "not_found" });
      if (a.scope === "global") {
        return res.status(409).json({ error: "already_global" });
      }
      a.originCaseId = a.caseId;
      a.caseId = null;
      a.scope = "global";
      touch(a, currentUser(req));
      res.json(a);
    }),
  );

  /**
   * "Customize for this case" — copy a global into one case. The copy carries
   * derivedFromAutomationId, which hides the original from that case only.
   * Every other case keeps the shared original, and later edits to the global
   * do not reach this copy.
   */
  r.post(
    "/automations/:autoId/fork",
    allow("automations.edit"),
    asyncHandler(async (req, res) => {
      const { autoId } = autoIdParam.parse(req.params);
      const source = findAutomation(autoId);
      if (!source) return res.status(404).json({ error: "not_found" });
      const body = z
        .object({ caseId: z.number().int().positive(), name: automationName.optional() })
        .parse(req.body);
      if (source.scope !== "global") {
        return res.status(409).json({ error: "not_global" });
      }
      const forkCase = findCaseFor(req, body.caseId);
      if (!forkCase) {
        return res.status(404).json({ error: "case_not_found" });
      }
      if (!canOn(principalOf(req), "automations.edit", forkCase.ownerUserId)) {
        return outOfScope(res, "automations.edit");
      }
      if (forkedGlobalIds(body.caseId).has(source.id)) {
        return res.status(409).json({ error: "already_customized" });
      }
      const me = currentUser(req);
      const meId = requireAuth(req).user.id;
      const now = new Date().toISOString();
      const copy: Automation = {
        id: nextAutomationId(),
        name: body.name ?? `${source.name} (this case)`,
        scope: "case",
        caseId: body.caseId,
        // Deep clone: the fork must not share structure with the global.
        graph: JSON.parse(JSON.stringify(source.graph)) as AutomationGraph,
        enabled: source.enabled,
        derivedFromAutomationId: source.id,
        originCaseId: null,
        ownerName: me,
        ownerUserId: meId,
        createdAt: now,
        createdByName: me,
        updatedAt: now,
        lastModifiedByName: me,
      };
      store.automations.push(copy);
      res.status(201).json(copy);
    }),
  );

  /**
   * "Revert to global" — discard a customised copy and let the case inherit the
   * original again. Destructive for the copy, untouched for the global.
   */
  r.post(
    "/automations/:autoId/revert",
    allow("automations.edit"),
    asyncHandler(async (req, res) => {
      const { autoId } = autoIdParam.parse(req.params);
      const p = principalOf(req);
      const fork = findAutomation(autoId);
      if (!fork || !automationVisible(p, fork)) return res.status(404).json({ error: "not_found" });
      if (fork.scope !== "case" || fork.derivedFromAutomationId === null) {
        return res.status(409).json({ error: "not_customized" });
      }
      if (!mayWriteAutomation(p, fork, res)) return;
      const original = findAutomation(fork.derivedFromAutomationId);
      if (!original) {
        // The global was deleted after the fork was made; there is nothing to
        // revert to, so the copy is all the case has. Refuse rather than
        // silently destroying it.
        return res.status(409).json({ error: "original_deleted" });
      }
      store.automations.splice(store.automations.indexOf(fork), 1);
      res.json({ restored: automationSummary(original) });
    }),
  );

  // ── Dashboard (RBAC Phase 6) ────────────────────────────────────────────────
  // One permission-composed response; see src/dashboard.ts for what each
  // section needs and how it is scoped.
  r.get(
    "/dashboard",
    allow("dashboard.view"),
    asyncHandler(async (req, res) => {
      res.json(buildDashboard(principalOf(req), store));
    }),
  );

  // ── Stats ──────────────────────────────────────────────────────────────────
  /**
   * Case metrics, clamped to the caller's metrics.cases scope: company-wide
   * (all), their teams (team) or their own (own). Asking for an employee
   * outside that scope is refused.
   */
  r.get(
    "/stats",
    allow("metrics.cases"),
    asyncHandler(async (req, res) => {
      const q = z
        .object({
          assignee: z.string().optional(),
          assigneeUserId: z.coerce.number().int().positive().optional(),
        })
        .parse(req.query);
      const p = principalOf(req);
      // The employee asked about, by id. A name is resolved to exactly one
      // employee (current names) or refused — never guessed.
      let assigneeId: number | undefined = q.assigneeUserId;
      if (assigneeId === undefined && q.assignee !== undefined) {
        const matches = store.users.filter((u) => u.name === q.assignee);
        if (matches.length !== 1) return res.status(400).json({ error: "unknown_assignee" });
        assigneeId = matches[0].id;
      }
      if (assigneeId !== undefined && !canOn(p, "metrics.cases", assigneeId))
        return outOfScope(res, "metrics.cases");
      const inMetricScope = <T extends { ownerUserId: number | null }>(rows: readonly T[]) =>
        rowsInScope(p, "metrics.cases", rows, (x) => x.ownerUserId);
      const myCases = assigneeId !== undefined
        ? store.cases.filter((c) => c.ownerUserId === assigneeId)
        : inMetricScope(store.cases);
      const viewableAccounts = rowsInScope(p, "accounts.view", store.accounts, (a) => a.ownerUserId);
      const myAccounts = assigneeId !== undefined
        ? viewableAccounts.filter((a) => a.ownerUserId === assigneeId)
        : inMetricScope(viewableAccounts);
      const myCaseIds = new Set(myCases.map((c) => c.id));
      const myTasks = store.tasks.filter((t) => myCaseIds.has(t.caseId));

      const totalCases = myCases.length;
      const completedCases = myCases.filter((c) => c.status === "completed").length;
      const openTasks = myTasks.filter((t) => t.status !== "completed").length;
      // Backwards-compat key name; now counts Accounts.
      const totalCustomers = myAccounts.length;

      const statusBreakdown = (
        ["intake", "review", "in_progress", "waiting", "completed"] as CaseStatus[]
      ).map((s) => ({ status: s, count: myCases.filter((c) => c.status === s).length }));

      const days: { date: string; cases: number; tasks: number }[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        d.setUTCDate(d.getUTCDate() - i);
        const iso = d.toISOString().slice(0, 10);
        const sameDay = (dateStr: string) => dateStr.slice(0, 10) === iso;
        days.push({
          date: iso,
          cases: myCases.filter((c) => sameDay(c.createdAt)).length,
          tasks: myTasks.filter((t) => sameDay(t.createdAt)).length,
        });
      }

      res.json({
        totalCases,
        completedCases,
        openTasks,
        totalCustomers,
        statusBreakdown,
        trend30: days,
      });
    }),
  );

  // ── Backwards-compat: /customers → maps to /accounts shape ─────────────────
  // Returns the legacy { id, name, email, phone, company, ownerName, createdAt, caseCount }
  // shape so the existing /customers and /clients/:id pages keep rendering
  // while we migrate them to the new Account/Contact UI.
  function legacyCustomerView(a: Account, p: Principal) {
    const primary = primaryContactForAccount(a.id);
    return {
      // `id` is the ACCOUNT id. `primaryContactId` is the Contact whose name,
      // email and phone fill this row (null when the account has no linked
      // contact) — use it, never `id`, to link to /clients/:id.
      id: a.id,
      primaryContactId: primary?.id ?? null,
      name: primary ? contactFullName(primary) : a.name,
      email: primary?.email ?? null,
      phone: primary?.phone ?? null,
      company: a.name,
      ownerName: a.ownerName,
      createdAt: a.createdAt,
      // Case information only for viewers with cases.view (R5).
      ...(can(p.permissions, "cases.view")
        ? { caseCount: viewableCases(p).filter((c) => c.accountId === a.id).length }
        : {}),
    };
  }

  r.get(
    "/customers",
    allow("accounts.view"),
    asyncHandler(async (req, res) => {
      const p = principalOf(req);
      const rows = rowsInScope(p, "accounts.view", store.accounts, (a) => a.ownerUserId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => legacyCustomerView(a, p));
      res.json(rows);
    }),
  );

  r.get(
    "/customers/:id",
    allow("accounts.view"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const p = principalOf(req);
      const a = store.accounts.find((x) => x.id === id);
      if (!a || !canViewAccount(p, a)) return res.status(404).json({ error: "not_found" });
      const view = legacyCustomerView(a, p);
      if (!can(p.permissions, "cases.view")) return res.json(view);
      res.json({ ...view, cases: viewableCases(p).filter((c) => c.accountId === id) });
    }),
  );

  // ── Conversations & Messages ───────────────────────────────────────────────
  // Messaging is membership-scoped: you read and write only conversations you
  // are a member of, and see case tags only for cases you may view.
  function memberConversation(req: Request, id: number) {
    const me = requireAuth(req).user.id;
    return store.conversations.find((c) => c.id === id && c.memberUserIds.includes(me));
  }
  /** Members' current display names, from their ids. */
  function memberNames(c: { members: string[]; memberUserIds: number[] }): string[] {
    return c.memberUserIds.map((id, i) => userById(id)?.name ?? c.members[i] ?? `#${id}`);
  }
  function visibleCaseTags(p: Principal, ids: number[]) {
    return caseTagSummaries(
      ids.filter((id) => {
        const c = store.cases.find((x) => x.id === id);
        return !!c && canViewCase(p, c);
      }),
    );
  }

  r.get(
    "/conversations",
    allow("messages.use"),
    asyncHandler(async (req, res) => {
      const meId = requireAuth(req).user.id;
      const all = store.conversations.filter((c) => c.memberUserIds.includes(meId));
      const rows = [...all]
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .map((c) => {
          const msgs = store.messages
            .filter((m) => m.conversationId === c.id)
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
          const last = msgs[0];
          return {
            id: c.id,
            name: c.name,
            type: c.type,
            createdAt: c.createdAt,
            members: memberNames(c),
            memberUserIds: c.memberUserIds,
            lastMessage: last?.content ?? null,
            lastMessageAt: last?.createdAt ?? null,
          };
        });
      res.json(rows);
    }),
  );

  r.post(
    "/conversations",
    allow("messages.use"),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          type: conversationType,
          name: z.string().optional(),
          // Members by employee id (preferred), or by display name for older
          // clients — each name must match exactly one active employee.
          memberUserIds: z.array(z.number().int().positive()).min(1).optional(),
          members: z.array(z.string()).min(1).optional(),
        })
        .refine((b) => b.memberUserIds || b.members, { message: "members or memberUserIds required" })
        .parse(req.body);
      const active = activeEmployees();
      let people: User[];
      if (body.memberUserIds) {
        const missing = body.memberUserIds.filter((id) => !active.some((u) => u.id === id));
        if (missing.length) return res.status(400).json({ error: "unknown_member", memberUserIds: missing });
        people = body.memberUserIds.map((id) => active.find((u) => u.id === id)!);
      } else {
        const unknown = body.members!.filter((n) => active.filter((u) => u.name === n).length !== 1);
        if (unknown.length) return res.status(400).json({ error: "unknown_member", members: unknown });
        people = body.members!.map((n) => active.find((u) => u.name === n)!);
      }
      people = people.filter((u, i) => people.findIndex((x) => x.id === u.id) === i);
      // You can only start conversations you are part of.
      if (!people.some((u) => u.id === requireAuth(req).user.id))
        return res.status(400).json({ error: "creator_not_member" });
      const created = {
        id: nextConversationId(),
        name: body.name ?? null,
        type: body.type,
        createdAt: new Date().toISOString(),
        members: people.map((u) => u.name),
        memberUserIds: people.map((u) => u.id),
      };
      store.conversations.push(created);
      res.status(201).json(created);
    }),
  );

  r.get(
    "/conversations/:id/messages",
    allow("messages.use"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      if (!memberConversation(req, id)) return res.status(404).json({ error: "not_found" });
      const p = principalOf(req);
      const rows = store.messages
        .filter((m) => m.conversationId === id)
        .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
        .map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          senderName: m.senderName,
          content: m.content,
          createdAt: m.createdAt,
          deletedAt: m.deletedAt,
          caseTags: visibleCaseTags(p, m.caseTags),
        }));
      res.json(rows);
    }),
  );

  r.post(
    "/conversations/:id/messages",
    allow("messages.use"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          // Accepted for compatibility but ignored: the sender is the session.
          senderName: z.string().optional(),
          content: z.string().min(1),
          caseTags: z.array(z.number().int().positive()).optional().default([]),
        })
        .parse(req.body);
      const conv = memberConversation(req, id);
      if (!conv) return res.status(404).json({ error: "not_found" });
      const p = principalOf(req);
      const msg = {
        id: nextMessageId(),
        conversationId: id,
        senderName: currentUser(req),
        senderUserId: requireAuth(req).user.id,
        content: body.content,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        // Only cases the sender may view can be tagged.
        caseTags: body.caseTags.filter((cid) => {
          const c = store.cases.find((x) => x.id === cid);
          return !!c && canViewCase(p, c);
        }),
      };
      store.messages.push(msg);
      res.status(201).json({
        ...msg,
        caseTags: visibleCaseTags(p, msg.caseTags),
      });
    }),
  );

  r.delete(
    "/messages/:id",
    allow("messages.use"),
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const m = store.messages.find((x) => x.id === id);
      if (!m || !memberConversation(req, m.conversationId)) return res.status(404).json({ error: "not_found" });
      // Only the author may delete — judged by the session, not a body field.
      if (m.senderUserId !== requireAuth(req).user.id)
        return res.status(403).json({ error: "not_author" });
      m.deletedAt = new Date().toISOString();
      m.content = "";
      res.status(204).end();
    }),
  );

  return r;
}
