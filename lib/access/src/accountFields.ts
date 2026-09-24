/**
 * Account field groups and their read/edit rules (architecture plan,
 * Revision 1, §R2).
 *
 * Every Account field belongs to exactly one group. Reading and editing are
 * governed separately; sensitive groups need an extra read permission, and
 * editing a sensitive group also requires being able to read it.
 *
 * Phase 2 defines the rules and pure helpers; the API applies them in
 * Phase 3.
 */
import { can, type EffectivePermissions } from "./resolve";
import type { Permission } from "./permissions";

export const ACCOUNT_FIELD_GROUPS = {
  base: ["id", "ownerName", "archived", "createdAt", "createdByName", "lastModifiedAt", "lastModifiedByName"],
  profile: ["companyPhone", "website", "industry", "principalAddress", "mailingAddress"],
  service: ["brand", "subscriptionBundle", "formationTier", "phoneForwardingPhone", "voPhone"],
  formation: [
    "name",
    "oldCompanyName",
    "entityType",
    "state",
    "formationStatus",
    "formationDate",
    "filingId",
    "renewalStatus",
    "renewalDate",
    "parentAccountId",
    "shareType",
    "commonShareQuantity",
    "commonShareValue",
    "preferredShareQuantity",
    "preferredShareValue",
  ],
  regulatory_ids: ["ein", "fincenId", "fincenFilingDate"],
  financial: [
    "stripeId",
    "oldStripeIds",
    "bankingAppId",
    "bankingAppStatus",
    "bankingAppMessage",
    "firstTransactionDate",
    "abandonedCartUrl",
  ],
  system: ["portalId", "portalLink", "automationStatus", "isFormationAutomated"],
} as const;

export type AccountFieldGroup = keyof typeof ACCOUNT_FIELD_GROUPS;
export type AccountField = (typeof ACCOUNT_FIELD_GROUPS)[AccountFieldGroup][number];

export const ACCOUNT_FIELDS: readonly AccountField[] = Object.values(ACCOUNT_FIELD_GROUPS).flat();

const GROUP_OF = new Map<string, AccountFieldGroup>(
  (Object.keys(ACCOUNT_FIELD_GROUPS) as AccountFieldGroup[]).flatMap((g) =>
    ACCOUNT_FIELD_GROUPS[g].map((f) => [f, g] as const),
  ),
);

export function accountFieldGroup(field: string): AccountFieldGroup | null {
  return GROUP_OF.get(field) ?? null;
}

// ── Read rules (§R2.2) ──────────────────────────────────────────────────────

export type AccountReadRule =
  | { visibility: "visible" }
  | { visibility: "masked"; requires: Permission; mask: "ein" | "last4" }
  | { visibility: "omitted"; requires: Permission };

/**
 * How each field is shown to someone with accounts.view. Fields not listed
 * are visible. `fincenFilingDate`, `bankingAppStatus` and
 * `firstTransactionDate` stay visible on purpose (dates and a status, not
 * identifiers).
 */
export const ACCOUNT_READ_RULES: Partial<Record<AccountField, AccountReadRule>> = {
  ein: { visibility: "masked", requires: "accounts.view.regulatory_ids", mask: "ein" },
  fincenId: { visibility: "masked", requires: "accounts.view.regulatory_ids", mask: "last4" },
  stripeId: { visibility: "omitted", requires: "accounts.view.financial" },
  oldStripeIds: { visibility: "omitted", requires: "accounts.view.financial" },
  bankingAppId: { visibility: "omitted", requires: "accounts.view.financial" },
  bankingAppMessage: { visibility: "omitted", requires: "accounts.view.financial" },
  abandonedCartUrl: { visibility: "omitted", requires: "accounts.view.financial" },
};

/** "12-3456789" → "**-***6789". */
export function maskEin(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length <= 4 ? "**-*******" : `**-***${digits.slice(-4)}`;
}

/** "FINCEN-123456789" → "****6789". Values of 4 characters or fewer are fully masked. */
export function maskLast4(value: string): string {
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

/** The fields this viewer cannot see in full. */
export function redactedAccountFields(perms: EffectivePermissions): AccountField[] {
  return (Object.keys(ACCOUNT_READ_RULES) as AccountField[]).filter((f) => {
    const rule = ACCOUNT_READ_RULES[f]!;
    return rule.visibility !== "visible" && !can(perms, rule.requires);
  });
}

/**
 * A copy of `account` as this viewer may read it, plus the list of fields
 * that were masked or omitted. Null values stay null.
 */
export function redactAccount<T extends object>(
  account: T,
  perms: EffectivePermissions,
): { account: T; redactedFields: AccountField[] } {
  const out: Record<string, unknown> = { ...(account as Record<string, unknown>) };
  const redactedFields = redactedAccountFields(perms);
  for (const field of redactedFields) {
    const rule = ACCOUNT_READ_RULES[field]!;
    const value = out[field];
    if (rule.visibility === "omitted") {
      out[field] = null;
    } else if (rule.visibility === "masked" && typeof value === "string" && value.length > 0) {
      out[field] = rule.mask === "ein" ? maskEin(value) : maskLast4(value);
    }
  }
  return { account: out as T, redactedFields };
}

// ── Edit rules (§R2.3) ──────────────────────────────────────────────────────

export const ACCOUNT_EDIT_PERMISSION: Record<Exclude<AccountFieldGroup, "base">, Permission> = {
  profile: "accounts.edit.profile",
  service: "accounts.edit.service",
  formation: "accounts.edit.formation",
  regulatory_ids: "accounts.edit.regulatory_ids",
  financial: "accounts.edit.financial",
  system: "accounts.edit.system",
};

/** Read permission an editor of a sensitive group must also hold. */
export const ACCOUNT_EDIT_ALSO_REQUIRES: Partial<Record<AccountFieldGroup, Permission>> = {
  regulatory_ids: "accounts.view.regulatory_ids",
  financial: "accounts.view.financial",
};

/**
 * The permission(s) needed to write `field`, or null if no client may write
 * it (id, created/last-modified audit fields). ownerName → accounts.assign,
 * archived → accounts.archive.
 */
export function accountFieldWritePermissions(field: string): Permission[] | null {
  if (field === "ownerName") return ["accounts.assign"];
  if (field === "archived") return ["accounts.archive"];
  const group = accountFieldGroup(field);
  if (group === null || group === "base") return null;
  const also = ACCOUNT_EDIT_ALSO_REQUIRES[group];
  return also ? [ACCOUNT_EDIT_PERMISSION[group], also] : [ACCOUNT_EDIT_PERMISSION[group]];
}

/**
 * The fields in `fields` this viewer may not write at all (ignoring
 * own/team/all scope, which depends on the record and is checked by the API).
 * Unknown fields are reported too.
 */
export function forbiddenAccountFields(fields: readonly string[], perms: EffectivePermissions): string[] {
  return fields.filter((f) => {
    const needed = accountFieldWritePermissions(f);
    return needed === null || !needed.every((p) => can(perms, p));
  });
}
