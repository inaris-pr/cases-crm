/**
 * Links from a Case to the two records it belongs to: its Account (the
 * company) and, optionally, its primary Contact (the Client).
 *
 * The two are different tables with independent id sequences, so the same
 * number can name an unrelated Account and Contact. Each link is therefore
 * built from its own id field and nothing else:
 *
 *   Account link → /accounts/{case.accountId}
 *   Client link  → /clients/{case.primaryContactId}
 *
 * Two traps this module exists to avoid:
 *
 *  1. The legacy `customer` projection on a Case sets `customer.id` to the
 *     Account id. Using it as a Client id opens the wrong person (or a 404).
 *     Nothing here reads `customer`.
 *
 *  2. When a Case has no primaryContactId, the API still fills
 *     `primaryContact` with the Account's first linked Contact, for older
 *     pages that want "a name to show". That Contact is not the Case's
 *     primary Contact, so a Client link is only produced when
 *     `primaryContactId` is set AND the embedded Contact is that exact record.
 *
 * Pure module — imports nothing — so the API test suite can exercise it
 * under Node without a DOM (see api-server/test/case-links.test.ts).
 */

export const ACCOUNT_DETAIL_BASE = "/accounts";
export const CLIENT_DETAIL_BASE = "/clients";

export function accountDetailPath(accountId: number): string {
  return `${ACCOUNT_DETAIL_BASE}/${accountId}`;
}

export function clientDetailPath(contactId: number): string {
  return `${CLIENT_DETAIL_BASE}/${contactId}`;
}

/** The fields of a Case (as returned by GET /api/cases/:id) that links need. */
export interface CaseLinkSource {
  accountId: number;
  account: { id: number; name: string } | null;
  primaryContactId: number | null;
  primaryContact: { id: number; firstName: string; lastName: string } | null;
}

export interface RecordLink {
  href: string;
  label: string;
}

export type CaseClientLink =
  /** The Case has no primary Contact. Show no Client link. */
  | { kind: "none" }
  /** The Case's primary Contact, resolved. */
  | { kind: "linked"; contactId: number; link: RecordLink }
  /**
   * primaryContactId is set but the Contact it names did not come back with
   * the Case (the API embeds the real record whenever it exists, so this
   * means the Contact is gone). No link: /clients/{id} would be a dead page,
   * and borrowing the embedded fallback Contact's name would mislabel it.
   */
  | { kind: "unresolved"; contactId: number; label: string };

export function caseAccountLink(c: CaseLinkSource): RecordLink {
  const name = c.account && c.account.id === c.accountId ? c.account.name.trim() : "";
  return {
    href: accountDetailPath(c.accountId),
    label: name || `Account #${c.accountId}`,
  };
}

export function caseClientLink(c: CaseLinkSource): CaseClientLink {
  const contactId = c.primaryContactId;
  if (contactId == null) return { kind: "none" };

  const p = c.primaryContact;
  if (p && p.id === contactId) {
    const name = `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
    return {
      kind: "linked",
      contactId,
      link: { href: clientDetailPath(contactId), label: name || `Client #${contactId}` },
    };
  }
  return { kind: "unresolved", contactId, label: `Client #${contactId}` };
}
