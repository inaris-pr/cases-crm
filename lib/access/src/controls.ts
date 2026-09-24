/**
 * Record-level access and UI controls (RBAC Phases 4–5).
 *
 * `ownerInScope` / `canOnOwner` are THE scope evaluator: the API
 * (auth/authorize.ts) and the web app both use them, so a control is shown
 * exactly when the API would accept the action. The API stays authoritative.
 *
 * Scope: own = records the caller owns; team = own + records owned by
 * members of the teams the caller supervises (ids from stored teams); all =
 * everything. A record with no owner id is reachable only with "all".
 */
import { can, scopeOf, type EffectivePermissions } from "./resolve";
import { isScoped, type Permission, type Scope } from "./permissions";
import { accountFieldWritePermissions, type AccountField } from "./accountFields";

/** Who is asking: their id, effective permissions and supervised members. */
export interface AccessContext {
  userId: number;
  permissions: EffectivePermissions;
  /** Members of every team this employee supervises (by user id). */
  supervisedUserIds: ReadonlySet<number> | readonly number[];
}

function supervises(ctx: AccessContext, userId: number): boolean {
  const s = ctx.supervisedUserIds;
  return "has" in s ? s.has(userId) : s.includes(userId);
}

/** Whether a record owned by `ownerUserId` falls inside `scope` for `ctx`. */
export function ownerInScope(ctx: AccessContext, scope: Scope, ownerUserId: number | null | undefined): boolean {
  if (scope === "all") return true;
  if (ownerUserId == null) return false;
  if (ownerUserId === ctx.userId) return true; // own
  return scope === "team" && supervises(ctx, ownerUserId);
}

/** May `ctx` use `permission` on a record owned by `ownerUserId`? Unscoped permissions ignore the owner. */
export function canOnOwner(ctx: AccessContext, permission: Permission, ownerUserId: number | null | undefined): boolean {
  if (!isScoped(permission)) return can(ctx.permissions, permission);
  const scope = scopeOf(ctx.permissions, permission);
  return scope !== null && ownerInScope(ctx, scope, ownerUserId);
}

type Owned = { ownerUserId?: number | null };

// ── Page-level actions ──────────────────────────────────────────────────────

export interface CreateActions {
  newLead: boolean;
  newCase: boolean;
  newAccount: boolean;
  newClient: boolean;
}

export function createActions(perms: EffectivePermissions): CreateActions {
  return {
    newLead: can(perms, "leads.create"),
    newCase: can(perms, "cases.create"),
    newAccount: can(perms, "accounts.create"),
    newClient: can(perms, "contacts.create"),
  };
}

// ── Per-record controls ─────────────────────────────────────────────────────

export interface CaseControls {
  /** Title, description, tags, status, priority, account/contact. */
  edit: boolean;
  /** Log calls, comment, tasks, documents. */
  work: boolean;
  reassign: boolean;
  /** Create/edit/customize this case's own automations. */
  editAutomations: boolean;
  /** Create, edit, promote or delete global automations. */
  manageGlobalAutomations: boolean;
}

export function caseControls(ctx: AccessContext, c: Owned): CaseControls {
  return {
    edit: canOnOwner(ctx, "cases.edit", c.ownerUserId),
    work: canOnOwner(ctx, "cases.work", c.ownerUserId),
    reassign: canOnOwner(ctx, "cases.assign", c.ownerUserId),
    editAutomations: canOnOwner(ctx, "automations.edit", c.ownerUserId),
    manageGlobalAutomations: can(ctx.permissions, "automations.manage_global"),
  };
}

export interface LeadControls {
  edit: boolean;
  convert: boolean;
  /** Conversion may also create the first Case (B4). */
  convertWithCase: boolean;
  reassign: boolean;
  delete: boolean;
}

export function leadControls(ctx: AccessContext, l: Owned): LeadControls {
  const convert = canOnOwner(ctx, "leads.convert", l.ownerUserId);
  return {
    edit: canOnOwner(ctx, "leads.edit", l.ownerUserId),
    convert,
    convertWithCase: convert && can(ctx.permissions, "cases.create"),
    reassign: canOnOwner(ctx, "leads.assign", l.ownerUserId),
    delete: canOnOwner(ctx, "leads.delete", l.ownerUserId),
  };
}

export interface AccountControls {
  /** May write this field (R2.3 group permission in scope, plus the read permission for sensitive groups). */
  canEditField: (field: AccountField | string) => boolean;
  reassign: boolean;
  archive: boolean;
  /** Link / edit / end client links. */
  linkClients: boolean;
  /** Show the account's cases and case counts. */
  viewCases: boolean;
  createCase: boolean;
}

export function accountControls(ctx: AccessContext, a: Owned): AccountControls {
  return {
    canEditField: (field) => {
      if (field === "ownerName" || field === "ownerUserId") return false; // reassignment only
      const needed = accountFieldWritePermissions(field);
      return needed !== null && needed.every((p) => canOnOwner(ctx, p, a.ownerUserId));
    },
    reassign: canOnOwner(ctx, "accounts.assign", a.ownerUserId),
    archive: canOnOwner(ctx, "accounts.archive", a.ownerUserId),
    linkClients: can(ctx.permissions, "contacts.link"),
    viewCases: can(ctx.permissions, "cases.view"),
    createCase: can(ctx.permissions, "cases.create"),
  };
}

export interface ClientControls {
  edit: boolean;
  reassign: boolean;
  linkAccounts: boolean;
  viewCases: boolean;
  createCase: boolean;
}

export function clientControls(ctx: AccessContext, c: Owned): ClientControls {
  return {
    edit: canOnOwner(ctx, "contacts.edit", c.ownerUserId),
    reassign: canOnOwner(ctx, "contacts.assign", c.ownerUserId),
    linkAccounts: can(ctx.permissions, "contacts.link"),
    viewCases: can(ctx.permissions, "cases.view"),
    createCase: can(ctx.permissions, "cases.create"),
  };
}

/** The assign permission for each record type that can be reassigned. */
export const ASSIGN_PERMISSION = {
  cases: "cases.assign",
  leads: "leads.assign",
  accounts: "accounts.assign",
  contacts: "contacts.assign",
} as const satisfies Record<string, Permission>;

/** The view permission a new owner of each record type must hold. */
export const OWNER_MUST_VIEW = {
  cases: "cases.view",
  leads: "leads.view",
  accounts: "accounts.view",
  contacts: "contacts.view",
} as const satisfies Record<keyof typeof ASSIGN_PERMISSION, Permission>;

export type ReassignableType = keyof typeof ASSIGN_PERMISSION;
