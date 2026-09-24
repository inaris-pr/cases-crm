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
 * - Ownership is a stable user id (`ownerUserId`, RBAC Phase 4) — never a
 *   display name. Renaming an employee changes nothing here.
 * - Scope: "own" = records the caller owns; "team" = own + records owned by
 *   the members of every team the caller supervises, from the CURRENT stored
 *   team relationships (never from departments, role names or names);
 *   "all" = every record. A record with no owner id is reachable only with
 *   "all".
 *
 * Permissions come from lib/access (resolvePermissions over the employee's
 * roles). Nothing here trusts the request for identity.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  canAny,
  canOnOwner,
  ownerInScope as sharedOwnerInScope,
  resolvePermissions,
  type AccessContext,
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
  /** Ids of the members of every team this employee currently supervises. */
  supervisedUserIds: ReadonlySet<number>;
}

/** Members of the teams `userId` supervises, from the stored teams right now. */
export function supervisedMemberIds(userId: number): Set<number> {
  const ids = new Set<number>();
  for (const team of store.teams) {
    if (!team.supervisorUserIds.includes(userId)) continue;
    for (const id of team.memberUserIds) ids.add(id);
  }
  return ids;
}

const principals = new WeakMap<Request, Principal>();

/** The signed-in employee with their effective permissions (cached per request). */
export function principalOf(req: Request): Principal {
  const cached = principals.get(req);
  if (cached) return cached;
  const { user } = requireAuth(req);
  const p: Principal = {
    user,
    permissions: resolvePermissions(user.roles),
    supervisedUserIds: supervisedMemberIds(user.id),
  };
  principals.set(req, p);
  return p;
}

// ── Ownership and scope ──────────────────────────────────────────────────────

/** The employee with this id, if any. The only way ownership is resolved. */
export function ownerUserFor(ownerUserId: number | null | undefined): User | null {
  if (ownerUserId == null) return null;
  return store.users.find((u) => u.id === ownerUserId) ?? null;
}

/** The principal as lib/access's AccessContext (the shared scope evaluator). */
export function accessContextOf(p: Principal): AccessContext {
  return { userId: p.user.id, permissions: p.permissions, supervisedUserIds: p.supervisedUserIds };
}

/**
 * Whether a record owned by employee `ownerUserId` falls inside `scope` for
 * `p`. Delegates to lib/access, which the web app uses too.
 */
export function ownerInScope(p: Principal, scope: Scope, ownerUserId: number | null | undefined): boolean {
  return sharedOwnerInScope(accessContextOf(p), scope, ownerUserId);
}

/**
 * May `p` use `permission` on a record owned by employee `ownerUserId`?
 * Unscoped permissions ignore the owner.
 */
export function canOn(p: Principal, permission: Permission, ownerUserId: number | null | undefined): boolean {
  return canOnOwner(accessContextOf(p), permission, ownerUserId);
}

/** The rows `p` may use `permission` on. */
export function rowsInScope<T>(
  p: Principal,
  permission: Permission,
  rows: readonly T[],
  ownerOf: (row: T) => number | null | undefined,
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
