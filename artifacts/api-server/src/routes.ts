import { Router, type Express, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
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
  TEAM_MEMBERS,
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
function caseWithRelations(c: Case) {
  const account = store.accounts.find((a) => a.id === c.accountId) ?? null;
  const primaryContact =
    (c.primaryContactId
      ? store.contacts.find((p) => p.id === c.primaryContactId)
      : null) ??
    (account ? primaryContactForAccount(account.id) : null) ??
    null;
  const customer = account
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

function currentUser(req: Request): string | null {
  const h = req.header("X-User");
  return h && h.trim() ? h.trim() : null;
}

function findCaseFor(_req: Request, id: number): Case | undefined {
  return store.cases.find((x) => x.id === id);
}

// ── Routes ───────────────────────────────────────────────────────────────────
export function registerRoutes(app: Express) {
  const r = Router();

  r.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.on("finish", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) persist();
      });
    }
    next();
  });

  // ── Auth ───────────────────────────────────────────────────────────────────
  r.post(
    "/auth/login",
    asyncHandler(async (req, res) => {
      const body = z
        .object({ email: z.string().min(3), password: z.string().min(1) })
        .parse(req.body);
      const user = userByEmail(body.email);
      if (!user || user.password !== body.password) {
        return res.status(401).json({ error: "invalid_credentials" });
      }
      const { password: _p, ...safe } = user;
      res.json(safe);
    }),
  );

  // ── Cases ──────────────────────────────────────────────────────────────────
  r.get(
    "/cases",
    asyncHandler(async (req, res) => {
      const q = z
        .object({
          status: caseStatus.optional(),
          priority: casePriority.optional(),
          search: z.string().optional(),
          assignee: z.string().optional(),
          accountId: z.coerce.number().int().optional(),
          contactId: z.coerce.number().int().optional(),
        })
        .parse(req.query);

      let rows = [...store.cases];
      if (q.assignee) rows = rows.filter((c) => c.ownerName === q.assignee);
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
      res.json(rows.map(caseWithRelations));
    }),
  );

  r.post(
    "/cases",
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
      const me = currentUser(req) ?? "Iris Burgos";
      const account = store.accounts.find((a) => a.id === accountId);
      if (!account) return res.status(400).json({ error: "unknown_account" });

      // A case's primary contact must be a real person actively linked to the
      // case's account. Without this check any contact id was accepted, so a
      // case could be filed under one company with a stranger as its contact.
      if (body.primaryContactId !== undefined) {
        const contact = store.contacts.find((c) => c.id === body.primaryContactId);
        if (!contact) return res.status(400).json({ error: "unknown_contact" });
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
        createdAt: now,
        updatedAt: now,
      };
      store.cases.push(created);
      res.status(201).json(caseWithRelations(created));
    }),
  );

  r.get(
    "/cases/:id",
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const c = findCaseFor(req, id);
      if (!c) return res.status(404).json({ error: "not_found" });
      res.json({
        ...caseWithRelations(c),
        tasks: store.tasks.filter((t) => t.caseId === id),
        documents: store.documents.filter((d) => d.caseId === id),
      });
    }),
  );

  r.patch(
    "/cases/:id",
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

      // The same Account/Contact rules as POST /cases, applied to the
      // relationship the case would have AFTER this update. Nothing is
      // written unless every check passes.
      const nextAccountId = body.accountId ?? c.accountId;
      const contactSupplied = body.primaryContactId !== undefined;
      const nextContactId = contactSupplied ? body.primaryContactId ?? null : c.primaryContactId;
      const accountChanged = nextAccountId !== c.accountId;
      const contactChanged = nextContactId !== c.primaryContactId;

      if (body.accountId !== undefined && !store.accounts.some((a) => a.id === body.accountId)) {
        return res.status(400).json({ error: "unknown_account" });
      }
      // Only a changed relationship is re-checked, so partial updates (status,
      // title, …) to an existing case keep working as before.
      if ((accountChanged || contactChanged) && nextContactId !== null) {
        const contact = store.contacts.find((p) => p.id === nextContactId);
        if (!contact) return res.status(400).json({ error: "unknown_contact" });
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
      res.json(caseWithRelations(c));
    }),
  );

  // ── Accounts ───────────────────────────────────────────────────────────────
  /** Sum of all distinct contacts + cases attached to an account. */
  function accountWithCounts(a: Account) {
    const contactCount = store.accountContactLinks.filter(
      (l) => l.accountId === a.id && !l.endedAt,
    ).length;
    const caseCount = store.cases.filter((c) => c.accountId === a.id).length;
    const openCaseCount = store.cases.filter(
      (c) => c.accountId === a.id && c.status !== "completed",
    ).length;
    return { ...a, contactCount, caseCount, openCaseCount };
  }

  r.get(
    "/accounts",
    asyncHandler(async (req, res) => {
      const q = z
        .object({ owner: z.string().optional(), search: z.string().optional() })
        .parse(req.query);
      let rows = [...store.accounts];
      if (q.owner) rows = rows.filter((a) => a.ownerName === q.owner);
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
      res.json(rows.map(accountWithCounts));
    }),
  );

  r.post(
    "/accounts",
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
      const me = currentUser(req) ?? "Iris Burgos";
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
      res.status(201).json(accountWithCounts(created));
    }),
  );

  r.get(
    "/accounts/:id",
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const a = store.accounts.find((x) => x.id === id);
      if (!a) return res.status(404).json({ error: "not_found" });
      const linkedContacts = contactsForAccount(id).map(({ contact, link }) => ({
        ...contact,
        fullName: contactFullName(contact),
        link,
      }));
      const cases = store.cases
        .filter((c) => c.accountId === id)
        .sort((x, y) => +new Date(y.updatedAt) - +new Date(x.updatedAt));
      res.json({
        ...accountWithCounts(a),
        contacts: linkedContacts,
        cases,
      });
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
      const a = store.accounts.find((x) => x.id === id);
      if (!a) return res.status(404).json({ error: "not_found" });
      Object.assign(a, body);
      // Always bump last-modified on a PATCH.
      const me = currentUser(req) ?? a.ownerName;
      a.lastModifiedAt = new Date().toISOString();
      a.lastModifiedByName = me;
      res.json(accountWithCounts(a));
    }),
  );

  // ── Contacts ───────────────────────────────────────────────────────────────
  function contactWithSummary(c: Contact) {
    const accounts = accountsForContact(c.id);
    return {
      ...c,
      fullName: contactFullName(c),
      accountCount: accounts.length,
      accountNames: accounts.map(({ account }) => account.name),
      openCaseCount: store.cases.filter(
        (cs) =>
          cs.status !== "completed" &&
          (cs.primaryContactId === c.id ||
            accounts.some(({ account }) => account.id === cs.accountId)),
      ).length,
    };
  }

  r.get(
    "/contacts",
    asyncHandler(async (req, res) => {
      const q = z
        .object({
          owner: z.string().optional(),
          accountId: z.coerce.number().int().optional(),
          search: z.string().optional(),
        })
        .parse(req.query);
      let rows = [...store.contacts];
      if (q.owner) rows = rows.filter((c) => c.ownerName === q.owner);
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
      res.json(rows.map(contactWithSummary));
    }),
  );

  r.post(
    "/contacts",
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
      const me = currentUser(req) ?? "Iris Burgos";
      const created: Contact = {
        id: nextContactId(),
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email ?? null,
        phone: body.phone ?? null,
        title: body.title ?? null,
        ownerName: me,
        createdAt: new Date().toISOString(),
      };
      store.contacts.push(created);
      res.status(201).json(contactWithSummary(created));
    }),
  );

  r.get(
    "/contacts/:id",
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const c = store.contacts.find((x) => x.id === id);
      if (!c) return res.status(404).json({ error: "not_found" });
      const accounts = accountsForContact(id).map(({ account, link }) => ({
        ...account,
        link,
      }));
      const cases = store.cases
        .filter(
          (cs) =>
            cs.primaryContactId === id ||
            accounts.some((a) => a.id === cs.accountId),
        )
        .sort((x, y) => +new Date(y.updatedAt) - +new Date(x.updatedAt));
      res.json({
        ...c,
        fullName: contactFullName(c),
        accounts,
        cases,
      });
    }),
  );

  r.patch(
    "/contacts/:id",
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
      const c = store.contacts.find((x) => x.id === id);
      if (!c) return res.status(404).json({ error: "not_found" });
      Object.assign(c, body);
      res.json(contactWithSummary(c));
    }),
  );

  // ── Account ↔ Contact links ────────────────────────────────────────────────
  r.post(
    "/account-contacts",
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
      if (!store.accounts.find((a) => a.id === body.accountId))
        return res.status(400).json({ error: "unknown_account" });
      if (!store.contacts.find((c) => c.id === body.contactId))
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
      if (!link) return res.status(404).json({ error: "not_found" });
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
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const idx = store.accountContactLinks.findIndex((l) => l.id === id);
      if (idx === -1) return res.status(404).json({ error: "not_found" });
      store.accountContactLinks.splice(idx, 1);
      res.status(204).end();
    }),
  );

  // ── Leads ──────────────────────────────────────────────────────────────────
  r.get(
    "/leads",
    asyncHandler(async (req, res) => {
      const q = z
        .object({
          owner: z.string().optional(),
          status: leadStatus.optional(),
          search: z.string().optional(),
        })
        .parse(req.query);
      let rows = [...store.leads];
      if (q.owner) rows = rows.filter((l) => l.ownerName === q.owner);
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
      const me = currentUser(req) ?? "Iris Burgos";
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
      const l = store.leads.find((x) => x.id === id);
      if (!l) return res.status(404).json({ error: "not_found" });
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
      const lead = store.leads.find((l) => l.id === id);
      if (!lead) return res.status(404).json({ error: "not_found" });
      if (lead.convertedAt)
        return res.status(409).json({ error: "already_converted" });

      const now = new Date().toISOString();
      const me = currentUser(req) ?? lead.ownerName;

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
        account,
        contact,
        link,
        case: createdCase,
      });
    }),
  );

  r.delete(
    "/leads/:id",
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const idx = store.leads.findIndex((l) => l.id === id);
      if (idx === -1) return res.status(404).json({ error: "not_found" });
      store.leads.splice(idx, 1);
      res.status(204).end();
    }),
  );

  // ── Tasks ──────────────────────────────────────────────────────────────────
  r.get(
    "/tasks",
    asyncHandler(async (req, res) => {
      const q = z.object({ caseId: z.coerce.number().int().optional() }).parse(req.query);
      let rows = [...store.tasks];
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
      if (!findCaseFor(req, body.caseId))
        return res.status(404).json({ error: "case_not_found" });
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
      if (!t) return res.status(404).json({ error: "not_found" });
      Object.assign(t, body);
      res.json(t);
    }),
  );

  // ── Documents ──────────────────────────────────────────────────────────────
  r.get(
    "/documents",
    asyncHandler(async (req, res) => {
      const q = z.object({ caseId: z.coerce.number().int().optional() }).parse(req.query);
      let rows = [...store.documents];
      if (q.caseId) rows = rows.filter((d) => d.caseId === q.caseId);
      rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      res.json(rows);
    }),
  );

  r.post(
    "/documents",
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
      if (!findCaseFor(req, body.caseId))
        return res.status(404).json({ error: "case_not_found" });
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
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          direction: contactDirection,
          channel: contactChannel,
          summary: z.string().min(1),
          contact: z.string().min(1),
          byName: z.string().min(1),
        })
        .parse(req.body);
      const c = findCaseFor(req, id);
      if (!c) return res.status(404).json({ error: "not_found" });
      const created = {
        id: nextCaseInteractionId(),
        caseId: id,
        direction: body.direction,
        channel: body.channel,
        summary: body.summary,
        contact: body.contact,
        byName: body.byName,
        createdAt: new Date().toISOString(),
      };
      store.caseInteractions.push(created);
      res.status(201).json(created);
    }),
  );

  // ── Case Thread Entries ────────────────────────────────────────────────────
  r.get(
    "/cases/:id/thread",
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
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          authorName: z.string().min(1),
          body: z.string().min(1),
        })
        .parse(req.body);
      const c = findCaseFor(req, id);
      if (!c) return res.status(404).json({ error: "not_found" });
      const created = {
        id: nextThreadEntryId(),
        caseId: id,
        authorName: body.authorName,
        body: body.body,
        createdAt: new Date().toISOString(),
      };
      store.threadEntries.push(created);

      const mentioned = parseMentions(body.body, body.authorName);
      for (const recipient of mentioned) {
        store.mentions.push({
          id: nextMentionId(),
          threadEntryId: created.id,
          caseId: c.id,
          fromName: body.authorName,
          toName: recipient,
          body: body.body,
          readAt: null,
          createdAt: new Date().toISOString(),
        });
      }

      res.status(201).json({ ...created, mentioned });
    }),
  );

  // ── Mentions inbox ─────────────────────────────────────────────────────────
  r.get(
    "/mentions",
    asyncHandler(async (req, res) => {
      const q = z.object({ for: z.string().optional() }).parse(req.query);
      let rows = [...store.mentions];
      if (q.for) rows = rows.filter((m) => m.toName === q.for);
      rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      res.json(
        rows.map((m) => {
          const c = store.cases.find((x) => x.id === m.caseId);
          return {
            ...m,
            caseNumber: c?.caseNumber ?? null,
            caseTitle: c?.title ?? null,
          };
        }),
      );
    }),
  );

  r.patch(
    "/mentions/:id/read",
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const m = store.mentions.find((x) => x.id === id);
      if (!m) return res.status(404).json({ error: "not_found" });
      m.readAt = new Date().toISOString();
      res.json(m);
    }),
  );

  r.get(
    "/team",
    asyncHandler(async (_req, res) => {
      res.json(TEAM_MEMBERS);
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

  function touch(a: Automation, me: string) {
    a.updatedAt = new Date().toISOString();
    a.lastModifiedByName = me;
  }

  const autoIdParam = z.object({ autoId: z.coerce.number().int().positive() });

  /** Everything this case can see, globals first, each group by name. */
  r.get(
    "/cases/:id/automations",
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
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      if (!findCaseFor(req, id)) return res.status(404).json({ error: "case_not_found" });
      const body = z
        .object({
          name: automationName,
          graph: automationGraphSchema.optional(),
          enabled: z.boolean().optional(),
          scope: z.enum(["case", "global"]).default("case"),
        })
        .parse(req.body);
      const me = currentUser(req) ?? "Iris Burgos";
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
    asyncHandler(async (req, res) => {
      const q = z.object({ scope: z.enum(["case", "global"]).optional() }).parse(req.query);
      const rows = store.automations
        .filter((a) => (q.scope ? a.scope === q.scope : true))
        .sort((a, b) => a.name.localeCompare(b.name));
      res.json(rows.map(automationSummary));
    }),
  );

  /** One automation, graph included. */
  r.get(
    "/automations/:autoId",
    asyncHandler(async (req, res) => {
      const { autoId } = autoIdParam.parse(req.params);
      const a = findAutomation(autoId);
      if (!a) return res.status(404).json({ error: "not_found" });
      res.json(a);
    }),
  );

  /** How many cases an edit or delete would reach. */
  r.get(
    "/automations/:autoId/usage",
    asyncHandler(async (req, res) => {
      const { autoId } = autoIdParam.parse(req.params);
      const a = findAutomation(autoId);
      if (!a) return res.status(404).json({ error: "not_found" });
      res.json(automationUsage(a));
    }),
  );

  /** Rename, re-graph or enable/disable. Scope is changed elsewhere. */
  r.patch(
    "/automations/:autoId",
    asyncHandler(async (req, res) => {
      const { autoId } = autoIdParam.parse(req.params);
      const a = findAutomation(autoId);
      if (!a) return res.status(404).json({ error: "not_found" });
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
      touch(a, currentUser(req) ?? a.ownerName);
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
    asyncHandler(async (req, res) => {
      const { autoId } = autoIdParam.parse(req.params);
      const idx = store.automations.findIndex((a) => a.id === autoId);
      if (idx === -1) return res.status(404).json({ error: "not_found" });
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
    asyncHandler(async (req, res) => {
      const { autoId } = autoIdParam.parse(req.params);
      const a = findAutomation(autoId);
      if (!a) return res.status(404).json({ error: "not_found" });
      if (a.scope === "global") {
        return res.status(409).json({ error: "already_global" });
      }
      a.originCaseId = a.caseId;
      a.caseId = null;
      a.scope = "global";
      touch(a, currentUser(req) ?? a.ownerName);
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
      if (!findCaseFor(req, body.caseId)) {
        return res.status(404).json({ error: "case_not_found" });
      }
      if (forkedGlobalIds(body.caseId).has(source.id)) {
        return res.status(409).json({ error: "already_customized" });
      }
      const me = currentUser(req) ?? "Iris Burgos";
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
    asyncHandler(async (req, res) => {
      const { autoId } = autoIdParam.parse(req.params);
      const fork = findAutomation(autoId);
      if (!fork) return res.status(404).json({ error: "not_found" });
      if (fork.scope !== "case" || fork.derivedFromAutomationId === null) {
        return res.status(409).json({ error: "not_customized" });
      }
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

  // ── Stats ──────────────────────────────────────────────────────────────────
  r.get(
    "/stats",
    asyncHandler(async (req, res) => {
      const q = z.object({ assignee: z.string().optional() }).parse(req.query);
      const myCases = q.assignee
        ? store.cases.filter((c) => c.ownerName === q.assignee)
        : store.cases;
      const myAccounts = q.assignee
        ? store.accounts.filter((a) => a.ownerName === q.assignee)
        : store.accounts;
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
  function legacyCustomerView(a: Account) {
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
      caseCount: store.cases.filter((c) => c.accountId === a.id).length,
    };
  }

  r.get(
    "/customers",
    asyncHandler(async (_req, res) => {
      const rows = [...store.accounts]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(legacyCustomerView);
      res.json(rows);
    }),
  );

  r.get(
    "/customers/:id",
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const a = store.accounts.find((x) => x.id === id);
      if (!a) return res.status(404).json({ error: "not_found" });
      res.json({
        ...legacyCustomerView(a),
        cases: store.cases.filter((c) => c.accountId === id),
      });
    }),
  );

  // ── Conversations & Messages ───────────────────────────────────────────────
  r.get(
    "/conversations",
    asyncHandler(async (req, res) => {
      const me = currentUser(req);
      const all = me
        ? store.conversations.filter((c) => c.members.includes(me))
        : store.conversations;
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
            members: c.members,
            lastMessage: last?.content ?? null,
            lastMessageAt: last?.createdAt ?? null,
          };
        });
      res.json(rows);
    }),
  );

  r.post(
    "/conversations",
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          type: conversationType,
          name: z.string().optional(),
          members: z.array(z.string()).min(1),
        })
        .parse(req.body);
      const created = {
        id: nextConversationId(),
        name: body.name ?? null,
        type: body.type,
        createdAt: new Date().toISOString(),
        members: body.members,
      };
      store.conversations.push(created);
      res.status(201).json(created);
    }),
  );

  r.get(
    "/conversations/:id/messages",
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
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
          caseTags: caseTagSummaries(m.caseTags),
        }));
      res.json(rows);
    }),
  );

  r.post(
    "/conversations/:id/messages",
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z
        .object({
          senderName: z.string().min(1),
          content: z.string().min(1),
          caseTags: z.array(z.number().int().positive()).optional().default([]),
        })
        .parse(req.body);
      const conv = store.conversations.find((c) => c.id === id);
      if (!conv) return res.status(404).json({ error: "not_found" });
      const msg = {
        id: nextMessageId(),
        conversationId: id,
        senderName: body.senderName,
        content: body.content,
        createdAt: new Date().toISOString(),
        deletedAt: null,
        caseTags: body.caseTags,
      };
      store.messages.push(msg);
      res.status(201).json({
        ...msg,
        caseTags: caseTagSummaries(msg.caseTags),
      });
    }),
  );

  r.delete(
    "/messages/:id",
    asyncHandler(async (req, res) => {
      const { id } = idParam.parse(req.params);
      const body = z.object({ senderName: z.string().min(1) }).parse(req.body);
      const m = store.messages.find((x) => x.id === id);
      if (!m) return res.status(404).json({ error: "not_found" });
      if (m.senderName !== body.senderName)
        return res.status(403).json({ error: "not_author" });
      m.deletedAt = new Date().toISOString();
      m.content = "";
      res.status(204).end();
    }),
  );

  app.use("/api", r);
}
