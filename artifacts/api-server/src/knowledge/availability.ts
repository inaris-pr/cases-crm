/**
 * Effective service availability — what the Knowledge Base may say about one
 * service in one jurisdiction, combining the jurisdiction's own entry with
 * explicit shared (national) source rules (Phase 8A follow-up).
 *
 * The article text is never touched: this is derived metadata with a
 * citation path for every conclusion. Pure; no I/O.
 *
 * Precedence, most specific first:
 *   1. a recorded discrepancy that disputes availability here → disputed
 *   2. an explicit rule for THIS jurisdiction saying not offered → not_offered
 *   3. a rule restricting the service to OTHER jurisdictions → restricted
 *   4. the jurisdiction's own entry states it → direct
 *   5. a national "not a product" rule → not_offered
 *   6. a national "offered" rule: contested → disputed; otherwise → inherited
 *   7. a "varies by state" rule and the entry is silent → unknown
 *   8. nothing → unknown
 * Silence alone never yields "not_offered".
 */
import {
  SERVICE_CATALOG,
  sectionCitation,
  type JurisdictionCode,
  type KnowledgeEntityType,
  type KnowledgeSharedService,
  type KnowledgeSourceDiscrepancy,
  type KnowledgeSource,
  type ServiceAvailabilityReason,
  type ServiceAvailabilityStatus,
  type ServiceKey,
  type SharedEvidence,
} from "./model.js";
import { discrepancyCovers } from "./validate.js";

export interface ServiceAvailability {
  serviceKey: ServiceKey;
  label: string;
  status: ServiceAvailabilityStatus;
  reason: ServiceAvailabilityReason;
  /** Printed in this jurisdiction's own entry (whatever the final status). */
  directlyMentioned: boolean;
  /** Where the deciding statement comes from. */
  sourceScope: "jurisdiction" | "national" | "other_jurisdictions" | null;
  /** Sections of this article that name the service. */
  directSectionIds: string[];
  /** Shared-service records that bear on this service here. */
  sharedServiceIds: string[];
  /** Unresolved discrepancies that bear on this service here. */
  discrepancyIds: string[];
  /** Verbatim qualifications from shared records (e.g. the BOI delivery risk). */
  caveats: string[];
}

export interface AvailabilityContext {
  entityType: KnowledgeEntityType;
  jurisdictionCode: JurisdictionCode;
  /** serviceKey → ids of this article's sections naming it. */
  directSections: Map<string, string[]>;
  shared: readonly KnowledgeSharedService[];
  discrepancies: readonly KnowledgeSourceDiscrepancy[];
}

export function resolveServiceAvailability(ctx: AvailabilityContext, serviceKey: ServiceKey): ServiceAvailability {
  const j = ctx.jurisdictionCode;
  const rules = ctx.shared.filter((r) => r.entityType === ctx.entityType && r.serviceKey === serviceKey);
  const directSectionIds = ctx.directSections.get(serviceKey) ?? [];
  const direct = directSectionIds.length > 0;
  const relevantDiscrepancies = ctx.discrepancies.filter(
    (d) =>
      d.entityType === ctx.entityType &&
      d.resolution === null &&
      (d.serviceKeys as string[]).includes(serviceKey) &&
      !(d.affects.allExcept as string[]).includes(j),
  );
  const here = (r: KnowledgeSharedService) => r.scope === "jurisdictions" && (r.jurisdictions as string[]).includes(j);
  const national = (a: KnowledgeSharedService["availability"]) => rules.filter((r) => r.scope === "national" && r.availability === a);

  const out = (
    status: ServiceAvailabilityStatus,
    reason: ServiceAvailabilityReason,
    sourceScope: ServiceAvailability["sourceScope"],
    deciding: KnowledgeSharedService[],
  ): ServiceAvailability => ({
    serviceKey,
    label: SERVICE_CATALOG[serviceKey].label,
    status,
    reason,
    directlyMentioned: direct,
    sourceScope,
    directSectionIds,
    sharedServiceIds: unique([...deciding, ...rules].map((r) => r.id)),
    discrepancyIds: relevantDiscrepancies.map((d) => d.id),
    caveats: unique(rules.flatMap((r) => r.caveats.map((c) => c.quote))),
  });

  // 1. Availability itself is contested here.
  if (discrepancyCovers(ctx.discrepancies, serviceKey, j, "disputes_availability"))
    return out("disputed", "availability_disputed", null, []);
  // 2. An explicit statement for this jurisdiction.
  const notHere = rules.filter((r) => here(r) && r.availability === "not_offered");
  if (notHere.length) return out("not_offered", "not_offered_in_jurisdiction", "jurisdiction", notHere);
  // 3. Restricted to other jurisdictions.
  const elsewhere = rules.filter((r) => r.availability === "exclusive" && !here(r));
  if (elsewhere.length) return out("restricted", "restricted_to_other_jurisdictions", "other_jurisdictions", elsewhere);
  // 4. The entry states it.
  if (direct) return out("direct", "stated_in_entry", "jurisdiction", []);
  // 5. Not a product anywhere.
  const notAnywhere = national("not_offered");
  if (notAnywhere.length) return out("not_offered", "not_offered_nationally", "national", notAnywhere);
  // 6. Offered nationally — inherited unless the national claim is contested.
  const offered = national("offered");
  if (offered.length) {
    if (discrepancyCovers(ctx.discrepancies, serviceKey, j, "blocks_inheritance"))
      return out("disputed", "national_rule_disputed", "national", offered);
    return out("inherited", "national_rule", "national", offered);
  }
  // 7./8. Nothing settles it.
  const varies = national("varies_by_state");
  if (varies.length) return out("unknown", "varies_by_state_not_stated", "national", varies);
  return out("unknown", "no_statement", null, []);
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** "LLC Formation Services by State → WHAT VARIES BY STATE, AND WHAT DOES NOT (p. 3)" or the article-section citation. */
export function evidenceCitation(
  e: SharedEvidence,
  sources: readonly KnowledgeSource[],
  articleTitle: (articleId: string) => string | null,
  sectionLabel: (articleId: string, sectionKey: string) => string | null,
): string {
  const src = sources.find((s) => s.id === e.sourceId);
  if (e.location.kind === "source_notice") {
    const key = e.location.noticeKey;
    const n = src?.notices.find((x) => x.key === key);
    return `${src?.title ?? e.sourceId} → ${n?.label ?? key}${n ? ` (p. ${n.page})` : ""}`;
  }
  const { articleId, sectionKey } = e.location;
  return sectionCitation(articleTitle(articleId) ?? articleId, sectionLabel(articleId, sectionKey) ?? sectionKey);
}
