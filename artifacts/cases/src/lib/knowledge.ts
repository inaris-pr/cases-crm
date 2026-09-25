/**
 * Knowledge Base — web types and presentation rules (Phase 8B).
 *
 * Pure: imports nothing, so the API test suite can import it under Node
 * (test/knowledge-ui.test.ts). The API owns the content model
 * (artifacts/api-server/src/knowledge/); these types mirror its JSON, and
 * the test checks the key lists here agree with the API's.
 *
 * Presentation rules that keep uncertainty visible:
 *   - an Open Research Item always reads as unresolved;
 *   - a disputed service never reads as available;
 *   - "unknown" never reads as "no";
 *   - an inherited (national) service never reads as printed in the state entry.
 */

// ── Vocabularies (mirrored from the API; agreement is tested) ────────────────

export const KNOWLEDGE_ENTITY_TYPE_LABELS: Record<KnowledgeEntityType, string> = {
  llc: "LLC",
  corporation: "Corporation",
};
export type KnowledgeEntityType = "llc" | "corporation";

export const SOURCE_FLAGS = [
  "none",
  "state_requirement",
  "client_disclosure",
  "known_service_gap",
  "open_research_item",
  "source_discrepancy",
] as const;
export type SourceFlag = (typeof SOURCE_FLAGS)[number];

export const SERVICE_AVAILABILITY_STATUSES = ["direct", "inherited", "not_offered", "restricted", "disputed", "unknown"] as const;
export type ServiceAvailabilityStatus = (typeof SERVICE_AVAILABILITY_STATUSES)[number];

/** Human labels for the API's controlled topics. */
export const TOPIC_LABELS: Record<string, string> = {
  formation: "Formation",
  registered_agent: "Registered agent",
  annual_report: "Annual report",
  renewal: "Renewal",
  amendment: "Amendments",
  name_change: "Name change",
  address_change: "Address change",
  good_standing: "Good standing",
  certified_copy: "Certified copies",
  apostille: "Apostille",
  ein: "EIN",
  tax_election: "Tax elections",
  operating_agreement: "Operating agreement",
  governance_documents: "Governance documents",
  membership_changes: "Membership changes",
  dba: "DBA / trade name",
  foreign_registration: "Foreign registration",
  dissolution: "Dissolution",
  reinstatement: "Reinstatement",
  conversion: "Conversion",
  business_license: "Business license",
  publication: "Publication",
  franchise_tax: "Franchise tax",
  annual_tax: "Annual tax",
  late_penalty: "Late penalty",
  corporate_binder: "Corporate binder",
  virtual_office: "Virtual office",
  mail_forwarding: "Mail forwarding",
  banking: "Banking",
  business_insurance: "Business insurance",
  business_financing: "Business financing",
  boi_compliance: "BOI compliance",
  trademark: "Trademark",
  tax_preparation: "Tax preparation",
};

/** The API's service catalog labels (the source's product names). */
export const SERVICE_LABELS: Record<string, string> = {
  llc_formation: "LLC Formation",
  instant_formation: "Instant Formation",
  registered_agent: "Registered Agent",
  registered_agent_switch: "Registered Agent Switch",
  annual_report_filing: "Annual Report / Renewal Filing",
  article_amendment: "Article Amendment",
  sos_name_change: "Name Change with the Secretary of State",
  sos_address_change: "Address Change",
  certificate_of_good_standing: "Certificate of Good Standing",
  certified_copies: "Certified Copies of Articles of Organization",
  apostille: "Apostille",
  ein: "Employer Identification Number (EIN)",
  foreign_ein: "Foreign EIN",
  s_corp_election: "S-Corp Tax Election, Form 2553",
  tax_classification_change: "Change of tax classification, Form 8832",
  irs_address_update: "Update Business Address with the IRS, Form 8822",
  irs_responsible_party_update: "Update Responsible Party",
  irs_name_change: "Change Company Name on file with the IRS",
  operating_agreement_update: "Updated Operating Agreement",
  annual_meeting_minutes: "Custom Annual Meeting Minutes",
  meeting_minutes_resolutions: "Special, Contribution, and Distribution Meeting Minutes and Resolutions",
  certificate_of_incumbency: "Certificate of Incumbency",
  assignment_of_interest: "Assignment of Interest",
  membership_change: "Membership changes",
  nda: "Non-Disclosure Agreement",
  independent_contractor_agreement: "Independent Contractor Agreement",
  digital_asset_assignment: "Digital Asset Assignment",
  dba: "DBA / Trade Name",
  dba_cancellation: "DBA Cancellation",
  dba_reassignment: "DBA Reassignment",
  foreign_registration: "Foreign Registration",
  dissolution: "Dissolution",
  reinstatement: "Reinstatement",
  convert_llc_to_close_llc: "Convert LLC to Close LLC",
  convert_llc_to_corporation: "Convert LLC to Corporation",
  corporate_binder_seal: "Corporate Binder and Seal",
  custom_operating_agreement: "Custom Operating Agreement",
  virtual_office: "Virtual Office and commercial business address",
  mail_forwarding: "Mail receipt / scanning / forwarding",
  instant_bank_account: "Instant Bank Account",
  business_insurance: "Business insurance",
  business_financing_referral: "Business financing referral",
  boi_compliance: "Corporate Transparency Act / BOI compliance",
  trademark_registration: "Trademark registration",
  business_license_services: "Standalone business license research, application, or renewal",
  tax_preparation_filing: "Tax preparation and tax filing",
};

export const topicLabel = (t: string) => TOPIC_LABELS[t] ?? t.replace(/_/g, " ");
export const serviceLabel = (k: string) => SERVICE_LABELS[k] ?? k.replace(/_/g, " ");

// ── API response shapes ──────────────────────────────────────────────────────

export interface KnowledgeFlagSummary {
  stateRequirements: number;
  clientDisclosures: number;
  knownServiceGaps: number;
  openResearchItems: number;
  sourceDiscrepancies: number;
}

export interface KnowledgeSectionOutline {
  id: string;
  key: string;
  label: string;
  order: number;
  kind: "standard" | "state_specific" | "highlighted";
  flag: SourceFlag;
  clientDisclosure: "required" | "recommended" | null;
  verification: "documented" | "unverified";
  notApplicable: boolean;
}

/** GET /api/knowledge/articles → articles[] */
export interface KnowledgeArticleSummary {
  id: string;
  slug: string;
  title: string;
  entityType: KnowledgeEntityType;
  jurisdictionCode: string;
  jurisdictionName: string;
  articleType: string;
  status: "draft" | "published" | "archived";
  audience: "internal";
  internalOnly: boolean;
  counselReviewed: boolean;
  sourceId: string;
  updatedAt: string;
  topics: string[];
  serviceKeys: string[];
  directTopics: string[];
  inheritedTopics: string[];
  effectiveTopics: string[];
  directServiceKeys: string[];
  inheritedServiceKeys: string[];
  effectiveServiceKeys: string[];
  disputedServiceKeys: string[];
  flagSummary: KnowledgeFlagSummary;
  sections: KnowledgeSectionOutline[];
  /** Present when the request had `q`. */
  matchedSectionIds?: string[];
  matchedInheritedServiceKeys?: string[];
}

export interface KnowledgeListResponse {
  count: number;
  articles: KnowledgeArticleSummary[];
}

export interface KnowledgeSection extends KnowledgeSectionOutline {
  sourceHeading: string;
  highlightCategory: string | null;
  content: string;
  sourcePages: number[];
  topics: string[];
  serviceKeys: string[];
  citation: string;
  contentHash: string;
}

export interface ServiceAvailability {
  serviceKey: string;
  label: string;
  status: ServiceAvailabilityStatus;
  reason: string;
  directlyMentioned: boolean;
  sourceScope: "jurisdiction" | "national" | "other_jurisdictions" | null;
  directSectionIds: string[];
  sharedServiceIds: string[];
  discrepancyIds: string[];
  caveats: string[];
}

export type EvidenceLocation =
  | { kind: "source_notice"; noticeKey: string }
  | { kind: "article_section"; articleId: string; sectionKey: string };

export interface CitedEvidence {
  sourceId: string;
  location: EvidenceLocation;
  quote: string;
  term: string;
  citation: string;
}

export interface KnowledgeSharedService {
  id: string;
  entityType: KnowledgeEntityType;
  serviceKey: string;
  label: string;
  scope: "national" | "jurisdictions";
  jurisdictions: string[] | null;
  availability: "offered" | "not_offered" | "varies_by_state" | "exclusive";
  termsVaryByState: boolean;
  topics: string[];
  evidence: CitedEvidence[];
  caveats: CitedEvidence[];
  mappingNote: string | null;
  discrepancyIds: string[];
}

export interface KnowledgeSourceDiscrepancy {
  id: string;
  serviceKeys: string[];
  question: string;
  effect: "blocks_inheritance" | "disputes_availability";
  affects: { allExcept: string[] };
  claims: CitedEvidence[];
  resolution: null;
}

export interface KnowledgeSourceRecord {
  id: string;
  fileName: string;
  title: string;
  publisher: string;
  preparedDate: string;
  coverage: string;
  confidentiality: string;
  internalOnly: boolean;
  counselReviewed: boolean;
  notices: { key: string; label: string; text: string; page: number }[];
}

/** GET /api/knowledge/articles/:idOrSlug */
export interface KnowledgeArticleDetail extends Omit<KnowledgeArticleSummary, "sections" | "sourceId"> {
  lastReviewedAt: string | null;
  createdAt: string;
  provenance: { sourceId: string; pages: number[]; sourceEntryHeader: string; contentsMarksHighlighted: boolean };
  aliases: string[];
  sections: KnowledgeSection[];
  serviceAvailability: ServiceAvailability[];
  source: KnowledgeSourceRecord | null;
  sharedServices: KnowledgeSharedService[];
  sourceDiscrepancies: KnowledgeSourceDiscrepancy[];
}

// ── Presentation rules ───────────────────────────────────────────────────────

export type Tone = "neutral" | "info" | "notice" | "warning" | "unresolved" | "positive" | "muted";

export interface SectionPresentation {
  /** Short badge text, or null for an ordinary section. */
  badge: string | null;
  tone: Tone;
  /** An Open Research Item: must read as an open question. */
  unresolved: boolean;
  /** One-line guidance shown under the badge (from the source's own definitions). */
  note: string | null;
}

/** How a section is marked, from its source flag. The text itself is never changed. */
export function sectionPresentation(s: Pick<KnowledgeSectionOutline, "flag" | "clientDisclosure" | "notApplicable" | "verification">): SectionPresentation {
  if (s.flag === "open_research_item" || s.verification === "unverified") {
    return {
      badge: "Open research item · Unresolved",
      tone: "unresolved",
      unresolved: true,
      note: "Researched for corporations, not verified for LLCs — treat as an unanswered question, not a settled fact.",
    };
  }
  switch (s.flag) {
    case "known_service_gap":
      return { badge: "Known service gap", tone: "warning", unresolved: false, note: "A confirmed defect in our own catalog." };
    case "client_disclosure":
      return {
        badge: s.clientDisclosure === "required" ? "Client disclosure · Required" : "Client disclosure · Recommended",
        tone: "notice",
        unresolved: false,
        note: s.clientDisclosure === "required" ? "The source says to disclose this to the client." : "The source recommends disclosing this to the client.",
      };
    case "state_requirement":
      return { badge: "State requirement", tone: "info", unresolved: false, note: null };
    case "source_discrepancy":
      return { badge: "Source discrepancy", tone: "unresolved", unresolved: true, note: "The source flags conflicting data — verify before relying on it." };
    default:
      return s.notApplicable
        ? { badge: "N/A", tone: "muted", unresolved: false, note: null }
        : { badge: null, tone: "neutral", unresolved: false, note: null };
  }
}

export interface AvailabilityPresentation {
  label: string;
  tone: Tone;
  /** True only for statuses that assert the service is available here. */
  confirmedAvailable: boolean;
}

/** Wording for a service status. Unknown is never "no"; disputed is never "yes". */
export function availabilityPresentation(status: ServiceAvailabilityStatus, jurisdictionName = "this state"): AvailabilityPresentation {
  switch (status) {
    case "direct":
      return { label: `Stated in the ${jurisdictionName} entry`, tone: "positive", confirmedAvailable: true };
    case "inherited":
      return { label: "Applies from a national source statement", tone: "positive", confirmedAvailable: true };
    case "disputed":
      return { label: "Source discrepancy — not confirmed", tone: "unresolved", confirmedAvailable: false };
    case "restricted":
      return { label: "Restricted to other jurisdictions (per source)", tone: "muted", confirmedAvailable: false };
    case "not_offered":
      return { label: "Not offered (per source)", tone: "muted", confirmedAvailable: false };
    default:
      return { label: "No confirmed information in the current Knowledge Base", tone: "muted", confirmedAvailable: false };
  }
}

/**
 * Where a piece of shared-service evidence comes from, in words:
 * the source document's front matter, this state's own entry, or another
 * state's entry that prints a national statement.
 */
export function evidenceOrigin(e: Pick<CitedEvidence, "location">, articleId: string): "source_document" | "this_entry" | "other_entry" {
  if (e.location.kind === "source_notice") return "source_document";
  return e.location.articleId === articleId ? "this_entry" : "other_entry";
}

/**
 * `national` marks evidence for a national rule: a sentence printed in
 * another state's entry is then labelled as the national statement it is.
 */
export function evidenceLabel(e: Pick<CitedEvidence, "location" | "citation">, articleId: string, national = false): string {
  switch (evidenceOrigin(e, articleId)) {
    case "source_document":
      return `Source document — ${e.citation}`;
    case "this_entry":
      return `This state's entry — ${e.citation}`;
    default:
      return `${national ? "National statement printed in another state's entry" : "Another state's entry"} — ${e.citation}`;
  }
}

export interface SharedServiceRow {
  serviceKey: string;
  label: string;
  status: ServiceAvailabilityStatus;
  presentation: AvailabilityPresentation;
  directlyMentioned: boolean;
  /** Where in THIS article the service is printed (section keys and labels). */
  directSectionKeys: string[];
  directSectionLabels: string[];
  /** Whether the evidence below backs a national rule (vs a jurisdiction-specific one). */
  nationalEvidence: boolean;
  /** The shared records' evidence, for provenance. */
  evidence: CitedEvidence[];
  caveats: string[];
  discrepancyIds: string[];
}

function rowFor(a: KnowledgeArticleDetail, x: ServiceAvailability): SharedServiceRow {
  const records = a.sharedServices.filter((r) => x.sharedServiceIds.includes(r.id));
  const national = records.filter((r) => r.scope === "national" && r.availability === "offered");
  const negative = x.status === "restricted" || x.status === "not_offered";
  const deciding = negative ? records.filter((r) => r.availability === "exclusive" || r.availability === "not_offered") : national;
  const directSectionKeys = x.directSectionIds.map((id) => id.slice(id.indexOf(":") + 1));
  return {
    serviceKey: x.serviceKey,
    label: x.label,
    status: x.status,
    presentation: availabilityPresentation(x.status, a.jurisdictionName),
    directlyMentioned: x.directlyMentioned,
    directSectionKeys,
    directSectionLabels: directSectionKeys.map((k) => a.sections.find((s) => s.key === k)?.label ?? k),
    nationalEvidence: deciding.length > 0 && deciding.every((r) => r.scope === "national"),
    evidence: deciding.flatMap((r) => r.evidence),
    caveats: x.caveats,
    discrepancyIds: x.discrepancyIds,
  };
}

const STATUS_ORDER: ServiceAvailabilityStatus[] = ["inherited", "disputed", "direct", "restricted", "not_offered", "unknown"];

/**
 * The "Shared services" panel: services the source states nationally
 * ("offered" national records) — each shown as stated here, inherited or
 * disputed. Unknown services are not listed.
 */
export function sharedServiceRows(a: KnowledgeArticleDetail): SharedServiceRow[] {
  const nationalKeys = new Set(a.sharedServices.filter((r) => r.scope === "national" && r.availability === "offered").map((r) => r.serviceKey));
  return a.serviceAvailability
    .filter((x) => nationalKeys.has(x.serviceKey) && x.status !== "unknown")
    .map((x) => rowFor(a, x))
    .sort((p, q) => STATUS_ORDER.indexOf(p.status) - STATUS_ORDER.indexOf(q.status));
}

/** Services the source says are not offered here, or restricted to other jurisdictions. */
export function unavailableRows(a: KnowledgeArticleDetail): SharedServiceRow[] {
  return a.serviceAvailability.filter((x) => x.status === "restricted" || x.status === "not_offered").map((x) => rowFor(a, x));
}

/** Services whose availability here the source contradicts. */
export function disputedRows(a: KnowledgeArticleDetail): SharedServiceRow[] {
  return a.serviceAvailability.filter((x) => x.status === "disputed").map((x) => rowFor(a, x));
}

// ── Search results ───────────────────────────────────────────────────────────

export interface KnowledgeQuery {
  q?: string;
  entityType?: string;
  jurisdiction?: string;
  topic?: string;
}

/** Query-string parameters for GET /api/knowledge/articles (empty values dropped). */
export function knowledgeSearchParams(query: KnowledgeQuery): string {
  const p = new URLSearchParams();
  for (const key of ["q", "entityType", "jurisdiction", "topic"] as const) {
    const v = query[key]?.trim();
    if (v) p.set(key, v);
  }
  return p.toString();
}

export interface MatchExplanation {
  /** Section labels of this article that matched (printed text). */
  sections: string[];
  /** National shared services the match came through (never printed in this entry). */
  inherited: string[];
  /** Disputed services the search names — shown as a source discrepancy, never as available. */
  disputed: string[];
}

function words(q: string): string[] {
  return q.toLowerCase().split(/[^a-z0-9$.]+/).filter(Boolean);
}

/**
 * Why a result matched. Topic filters match effective metadata, so a topic
 * that is only inherited is reported as such; `q` matches are split into
 * printed sections and inherited services by the API.
 */
export function explainMatch(a: KnowledgeArticleSummary, query: KnowledgeQuery): MatchExplanation | null {
  const q = query.q?.trim() ?? "";
  const topic = query.topic?.trim() ?? "";
  if (!q && !topic) return null;
  const out: MatchExplanation = { sections: [], inherited: [], disputed: [] };
  if (q) {
    const ids = new Set(a.matchedSectionIds ?? []);
    out.sections = a.sections.filter((s) => ids.has(s.id)).map((s) => s.label);
    out.inherited = (a.matchedInheritedServiceKeys ?? []).map(serviceLabel);
    const terms = words(q);
    out.disputed = a.disputedServiceKeys
      .filter((k) => {
        const text = `${serviceLabel(k)} ${k.replace(/_/g, " ")}`.toLowerCase();
        return terms.length > 0 && terms.every((t) => text.includes(t));
      })
      .map(serviceLabel);
  }
  if (topic && !a.directTopics.includes(topic) && a.inheritedTopics.includes(topic)) {
    const label = topicLabel(topic);
    if (!out.inherited.includes(label)) out.inherited.push(label);
  }
  return out;
}

/** Filter options present in the loaded articles — no options for content that does not exist. */
export function filterOptions(articles: KnowledgeArticleSummary[]) {
  const entityTypes = [...new Set(articles.map((a) => a.entityType))].sort();
  const jurisdictions = [...new Map(articles.map((a) => [a.jurisdictionCode, a.jurisdictionName])).entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((x, y) => x.name.localeCompare(y.name));
  const topics = [...new Set(articles.flatMap((a) => a.effectiveTopics))].sort((x, y) => topicLabel(x).localeCompare(topicLabel(y)));
  return { entityTypes, jurisdictions, topics };
}

/** Highlighted sections worth surfacing in a result row (label + presentation). */
export function highlightedOutline(a: Pick<KnowledgeArticleSummary, "sections">) {
  return a.sections
    .filter((s) => s.kind === "highlighted")
    .map((s) => ({ key: s.key, label: s.label, presentation: sectionPresentation(s) }));
}

/** "2026-09-10" → "Sep 10, 2026" (no time zone shift). */
export function formatSourceDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}
