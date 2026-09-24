/**
 * Permission resolution: an employee's roles → their effective permissions.
 *
 * - Union over all roles the employee holds.
 * - For a scoped permission, the widest scope any role grants wins.
 * - Unknown role keys grant nothing; reserved roles grant nothing.
 *
 * Pure functions only — the API uses them to decide, the web app uses the
 * result (from GET /api/auth/me) to adapt its navigation.
 */
import { ROLE_GRANTS } from "./grants";
import {
  PERMISSIONS,
  SCOPE_RANK,
  isPermission,
  widerScope,
  type Permission,
  type Scope,
} from "./permissions";
import { PRIVILEGED_ROLE_KEYS, isRoleKey, type RoleKey } from "./roles";

/** Granted permissions only: scope for scoped ones, `true` for the rest. */
export type EffectivePermissions = Partial<Record<Permission, Scope | true>>;

export function resolvePermissions(roles: readonly string[]): EffectivePermissions {
  const out: EffectivePermissions = {};
  for (const role of roles) {
    if (!isRoleKey(role)) continue;
    const grants = ROLE_GRANTS[role];
    for (const key of Object.keys(grants) as Permission[]) {
      const granted = grants[key];
      if (granted === undefined) continue;
      if (!PERMISSIONS[key].scoped) {
        out[key] = true;
        continue;
      }
      const current = out[key];
      out[key] = typeof current === "string" ? widerScope(current, granted as Scope) : (granted as Scope);
    }
  }
  return out;
}

/**
 * Whether `perms` grant `permission` — and, for a scoped permission, at least
 * `minScope` (default: any scope).
 */
export function can(perms: EffectivePermissions, permission: Permission, minScope?: Scope): boolean {
  const granted = perms[permission];
  if (granted === undefined) return false;
  if (granted === true) return true;
  return minScope === undefined || SCOPE_RANK[granted] >= SCOPE_RANK[minScope];
}

/** The scope a scoped permission is held at, or null if not held. */
export function scopeOf(perms: EffectivePermissions, permission: Permission): Scope | null {
  const granted = perms[permission];
  return typeof granted === "string" ? granted : null;
}

export function canAny(perms: EffectivePermissions, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(perms, p));
}

/**
 * Whether someone with `granter` may give another employee `role`
 * (People management, a later phase). Needs people.manage; privileged roles
 * (System Owner) additionally need system.roles.grant_privileged.
 */
export function canGrantRole(granter: EffectivePermissions, role: RoleKey): boolean {
  if (!can(granter, "people.manage")) return false;
  if (PRIVILEGED_ROLE_KEYS.includes(role)) return can(granter, "system.roles.grant_privileged");
  return true;
}

/** Drops anything that is not a real permission with a valid value (for data from the wire). */
export function sanitizeEffectivePermissions(value: unknown): EffectivePermissions {
  const out: EffectivePermissions = {};
  if (!value || typeof value !== "object") return out;
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (!isPermission(key)) continue;
    if (PERMISSIONS[key].scoped ? v === "own" || v === "team" || v === "all" : v === true) {
      out[key] = v as Scope | true;
    }
  }
  return out;
}
