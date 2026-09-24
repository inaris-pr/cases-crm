/**
 * Authorization (RBAC Phase 3): what a signed-in employee may do.
 *
 * - Every /api route declares its access with one of the guards below as its
 *   FIRST handler: `publicRoute`, `signedIn`, or `allow(...permissions)`.
 *   test/route-guards.test.ts walks the router and fails on any route without
 *   a declaration (deny by default).
 * - A missing capability is `403 { error: "forbidden", permission }`.
 * - Scoped permissions (own / team / all) are checked per record: a record
 *   the caller may not see is `404` (its existence is not revealed); a record
 *   they may see but not act on is `403 { error: "out_of_scope", permission }`.
 * - Ownership is resolved in ONE place, `ownerUserFor`: by display name now,
 *   by stored user id from Phase 4.
 * - TEMPORARY (Phase 3 safety restriction): a permission held with scope
 *   "team" authorizes only the caller's OWN records until Phase 4. Record
 *   ownership is still a display name, and cross-employee decisions must not
 *   rest on it. The permission matrix is unchanged — supervisors still
 *   RESOLVE "team" (see /api/auth/me) — only this evaluator does not expand
 *   "team" to other employees yet. Phase 4 adds stable owner user ids and
 *   turns on real team ownership here (TEAM_SCOPE_COVERS_MEMBERS).
 *
 * Permissions come from lib/access (resolvePermissions over the employee's
 * roles). Nothing here trusts the request for identity.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  canAny,
  resolvePermissions,
  scopeOf,
  can,
  isScoped,
  type EffectivePermissions,
  type Permission,
  type Scope,
} from "../access.js";
import { store, type User } from "../store.js";
import { requireAuth } from "./middleware.js";

// ── Principal ────────────────────────────────────────────────────────────────

export interface Principal {
  user: User;
  permissions: EffectivePermissions;
}

const principals = new WeakMap<Request, Principal>();

/** The signed-in employee with their effective permissions (cached per request). */
export function principalOf(req: Request): Principal {
  const cached = principals.get(req);
  if (cached) return cached;
  const { user } = requireAuth(req);
  const p: Principal = { user, permissions: resolvePermissions(user.roles) };
  principals.set(req, p);
  return p;
}

// ── Ownership and scope ──────────────────────────────────────────────────────

/**
 * The employee a record's owner/author name refers to, or null when no single
 * employee has that name (unknown names such as integration users, and
 * ambiguous duplicates, match no one). The only place ownership is resolved;
 * Phase 4 replaces the name with a stored user id.
 */
export function ownerUserFor(ownerName: string | null | undefined): User | null {
  if (!ownerName) return null;
  const matches = store.users.filter((u) => u.name === ownerName);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Whether "team" scope reaches records owned by the members of teams the
 * caller supervises. FALSE until Phase 4 (see the header): team-scoped
 * permissions cover the caller's own records only, because ownership is
 * still stored as a display name. Phase 4 sets this from stable owner ids.
 */
export const TEAM_SCOPE_COVERS_MEMBERS = false as const;

/** Whether a record owned by `ownerName` falls inside `scope` for `p`. */
export function ownerInScope(p: Principal, scope: Scope, ownerName: string | null | undefined): boolean {
  if (scope === "all") return true;
  // "own", and — until Phase 4 — "team" (team logically includes own).
  const owner = ownerUserFor(ownerName);
  return owner !== null && owner.id === p.user.id;
}

/**
 * May `p` use `permission` on a record owned by `ownerName`? Unscoped
 * permissions ignore the owner.
 */
export function canOn(p: Principal, permission: Permission, ownerName: string | null | undefined): boolean {
  if (!isScoped(permission)) return can(p.permissions, permission);
  const scope = scopeOf(p.permissions, permission);
  return scope !== null && ownerInScope(p, scope, ownerName);
}

/** The rows `p` may use `permission` on. */
export function rowsInScope<T>(
  p: Principal,
  permission: Permission,
  rows: readonly T[],
  ownerOf: (row: T) => string | null | undefined,
): T[] {
  return rows.filter((row) => canOn(p, permission, ownerOf(row)));
}

// ── Responses ────────────────────────────────────────────────────────────────

export function forbidden(res: Response, permission: Permission | readonly Permission[]) {
  return res.status(403).json({ error: "forbidden", permission });
}

export function outOfScope(res: Response, permission: Permission) {
  return res.status(403).json({ error: "out_of_scope", permission });
}

export function forbiddenFields(res: Response, fields: readonly string[]) {
  return res.status(403).json({ error: "forbidden_fields", fields });
}

// ── Route declarations ───────────────────────────────────────────────────────

export type RouteAccess =
  | { kind: "public" }
  | { kind: "signed_in" }
  | { kind: "permission"; anyOf: readonly Permission[] };

/** Where a guard keeps its declaration, for the router-walking test. */
export const ROUTE_ACCESS_KEY = "routeAccess" as const;

export type GuardHandler = RequestHandler & { [ROUTE_ACCESS_KEY]: RouteAccess };

function guard(access: RouteAccess, handler: RequestHandler): GuardHandler {
  return Object.assign(handler, { [ROUTE_ACCESS_KEY]: access });
}

/** No session needed (sign-in, sign-out). */
export const publicRoute: GuardHandler = guard({ kind: "public" }, (_req, _res, next) => next());

/**
 * Any signed-in employee, whatever their roles (their own identity only —
 * never another employee's or a customer's data).
 */
export const signedIn: GuardHandler = guard({ kind: "signed_in" }, (req, _res, next) => {
  principalOf(req);
  next();
});

/** The caller must hold at least one of these permissions (any scope). */
export function allow(...anyOf: Permission[]): GuardHandler {
  if (anyOf.length === 0) throw new Error("allow() needs at least one permission");
  return guard({ kind: "permission", anyOf }, (req: Request, res: Response, next: NextFunction) => {
    if (!canAny(principalOf(req).permissions, anyOf)) {
      forbidden(res, anyOf.length === 1 ? anyOf[0] : anyOf);
      return;
    }
    next();
  });
}
