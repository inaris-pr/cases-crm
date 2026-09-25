/**
 * Knowledge Base — canonical content model (Phase 8, foundation only).
 *
 * ONE article per jurisdiction per entity type ("California — LLC Services &
 * Requirements"). Formation, Registered Agent, Annual Report… are SECTIONS of
 * that article, never separate articles. A later retrieval pipeline may chunk
 * an article by section, but those chunks are retrieval units, not articles.
 *
 * The same article records will serve all three future consumers — human
 * browsing, Case recommendations and the Knowledge Assistant (hybrid RAG).
 * There is exactly one article repository (repository.ts).
 *
 * Content is copied from a source document and preserved as written: nothing
 * here corrects, reconciles or completes the source. Every tag (topic,
 * service key, service-profile value) must be supported by the text of the
 * section it sits on — validate.ts enforces that with the evidence patterns
 * below.
 *
 * Pure data and types; no I/O.
 */

// ── Classification ───────────────────────────────────────────────────────────

/** Corporation is part of the model now so it can be added without a redesign. */
export const KNOWLEDGE_ENTITY_TYPES = ["llc", "corporation"] as const;
export type KnowledgeEntityType = (typeof KNOWLEDGE_ENTITY_TYPES)[number];

export const ENTITY_TYPE_LABELS: Record<KnowledgeEntityType, string> = {
  llc: "LLC",
  corporation: "Corporation",
};

/** "state_services" = everything the source says for one jurisdiction. */
export const KNOWLEDGE_ARTICLE_TYPES = ["state_services"] as const;
export type KnowledgeArticleType = (typeof KNOWLEDGE_ARTICLE_TYPES)[number];

/**
 * Lifecycle of an article record.
 *   draft     — not visible to readers
 *   published — available INTERNALLY to employees who hold knowledge.view
 *   archived  — kept for history, not visible to readers
 * "published" never means customer-facing or counsel-approved: see
 * `audience`, `internalOnly` and `counselReviewed` on the article.
 */
export const KNOWLEDGE_ARTICLE_STATUSES = ["draft", "published", "archived"] as const;
export type KnowledgeArticleStatus = (typeof KNOWLEDGE_ARTICLE_STATUSES)[number];

/**
 * Who an article is written for. Only "internal" exists — there is
 * deliberately no customer-facing value, so no record can claim one.
 */
export const KNOWLEDGE_AUDIENCES = ["internal"] as const;
export type KnowledgeAudience = (typeof KNOWLEDGE_AUDIENCES)[number];

// ── Jurisdictions ────────────────────────────────────────────────────────────

/**
 * The 51 jurisdictions the LLC source covers (its Contents page lists the 50
 * states and the District of Columbia). Codes are USPS abbreviations, as the
 * source prints them in each entry's header.
 */
export const KNOWLEDGE_JURISDICTIONS = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
] as const;
export type JurisdictionCode = (typeof KNOWLEDGE_JURISDICTIONS)[number]["code"];
export const JURISDICTION_CODES = KNOWLEDGE_JURISDICTIONS.map((j) => j.code) as readonly JurisdictionCode[];

export function jurisdictionByCode(code: string): { code: JurisdictionCode; name: string } | null {
  const c = code.trim().toUpperCase();
  return KNOWLEDGE_JURISDICTIONS.find((j) => j.code === c) ?? null;
}

// ── Stable identity ──────────────────────────────────────────────────────────

/** "California — LLC Services & Requirements" */
export function articleTitle(jurisdictionName: string, entityType: KnowledgeEntityType): string {
  return `${jurisdictionName} — ${ENTITY_TYPE_LABELS[entityType]} Services & Requirements`;
}

/**
 * Article id — the permanent key: entity type + jurisdiction + article type.
 * "llc-ca-state-services". Never reused, never changed.
 */
export function articleId(entityType: KnowledgeEntityType, code: string, articleType: KnowledgeArticleType): string {
  return `${entityType}-${code.toLowerCase()}-${articleType.replace(/_/g, "-")}`;
}

/** Human-readable slug from the title: "california-llc-services-and-requirements". */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Section id — addressable and stable, so a future answer can cite exactly
 * one section: "llc-az-state-services:open_research_item_publication".
 */
export function sectionId(articleIdValue: string, sectionKey: string): string {
  return `${articleIdValue}:${sectionKey}`;
}

/** "Arizona — LLC Services & Requirements → Open Research Item — Publication" */
export function sectionCitation(title: string, sectionLabel: string): string {
  return `${title} → ${sectionLabel}`;
}

// ── Sections ─────────────────────────────────────────────────────────────────

/**
 * Where a section sits in the source entry.
 *   standard       — the eight standard sections, present for every state
 *   state_specific — the ninth section, present for every state ("N/A" when
 *                    nothing beyond the standard obligations is documented)
 *   highlighted    — a shaded box after the standard sections, only where the
 *                    source adds one
 */
export const SECTION_KINDS = ["standard", "state_specific", "highlighted"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

export interface SectionTemplateEntry {
  key: string;
  label: string;
  /** The heading exactly as the source prints it. */
  sourceHeading: string;
  kind: Exclude<SectionKind, "highlighted">;
}

/** The LLC source's standard structure, in its order ("How to read this document"). */
export const LLC_SECTION_TEMPLATE: readonly SectionTemplateEntry[] = [
  { key: "formation_filing", label: "Formation Filing", sourceHeading: "FORMATION FILING", kind: "standard" },
  { key: "registered_agent", label: "Registered Agent", sourceHeading: "REGISTERED AGENT", kind: "standard" },
  {
    key: "annual_report_and_renewal_filing",
    label: "Annual Report and Renewal Filing",
    sourceHeading: "ANNUAL REPORT AND RENEWAL FILING",
    kind: "standard",
  },
  {
    key: "amendments_and_sos_filings",
    label: "Amendments and Secretary of State Filings",
    sourceHeading: "AMENDMENTS AND SECRETARY OF STATE FILINGS",
    kind: "standard",
  },
  {
    key: "certificates_and_certified_copies",
    label: "Certificates and Certified Copies",
    sourceHeading: "CERTIFICATES AND CERTIFIED COPIES",
    kind: "standard",
  },
  { key: "ein_and_tax_elections", label: "EIN and Tax Elections", sourceHeading: "EIN AND TAX ELECTIONS", kind: "standard" },
  {
    key: "formation_documents_included",
    label: "Formation Documents Included",
    sourceHeading: "FORMATION DOCUMENTS INCLUDED",
    kind: "standard",
  },
  {
    key: "additional_services_available",
    label: "Additional Services Available",
    sourceHeading: "ADDITIONAL SERVICES AVAILABLE",
    kind: "standard",
  },
  {
    key: "state_specific_requirements",
    label: "State-Specific Requirements",
    sourceHeading: "STATE-SPECIFIC REQUIREMENTS",
    kind: "state_specific",
  },
];

/**
 * Section templates by entity type. The Corporation template is defined when
 * its own source is ingested (a later phase) — its standard sections may
 * differ, and they are not guessed here.
 */
export const SECTION_TEMPLATES: Partial<Record<KnowledgeEntityType, readonly SectionTemplateEntry[]>> = {
  llc: LLC_SECTION_TEMPLATE,
};

// ── Source flags ─────────────────────────────────────────────────────────────

/**
 * What a section IS, as the source classifies it.
 *   none               — ordinary reference content (the eight standard sections)
 *   state_requirement  — an obligation on the client's side (the ninth
 *                        section when it has content; obligation boxes such as
 *                        an annual tax)
 *   client_disclosure  — the source says to disclose it to the client (see
 *                        `clientDisclosure` for required vs recommended)
 *   known_service_gap  — a confirmed defect in OUR catalog (source: "marks a
 *                        confirmed defect in our own catalog")
 *   open_research_item — an UNANSWERED question: researched for corporations,
 *                        not verified for LLCs. Never a confirmed requirement.
 *   source_discrepancy — the source flags conflicting data to verify before
 *                        relying on it ("Renewal Date Discrepancy")
 */
export const SOURCE_FLAGS = [
  "none",
  "state_requirement",
  "client_disclosure",
  "known_service_gap",
  "open_research_item",
  "source_discrepancy",
] as const;
export type SourceFlag = (typeof SOURCE_FLAGS)[number];

/** The source distinguishes "CLIENT DISCLOSURE REQUIRED" from "…RECOMMENDED". */
export const CLIENT_DISCLOSURE_LEVELS = ["required", "recommended"] as const;
export type ClientDisclosureLevel = (typeof CLIENT_DISCLOSURE_LEVELS)[number];

/**
 * Whether the source states the content as documented or explicitly as
 * unverified. "documented" means "stated by the source" — NOT reviewed by
 * counsel and NOT checked against the state.
 */
export const SECTION_VERIFICATION = ["documented", "unverified"] as const;
export type SectionVerification = (typeof SECTION_VERIFICATION)[number];

/**
 * The highlighted-section titles the LLC source lists ("How to read this
 * document"). A highlighted heading that is not one of them is `unlisted` —
 * kept as written rather than forced into the nearest title.
 */
export const HIGHLIGHT_CATEGORIES = [
  "publication_requirement",
  "state_business_license",
  "initial_report_requirement",
  "first_report_timing_rule",
  "franchise_tax_annual_tax_or_annual_fee",
  "per_member_fee_structure",
  "renewal_date_discrepancy",
  "known_service_gap",
  "open_research_item",
  "unlisted",
] as const;
export type HighlightCategory = (typeof HIGHLIGHT_CATEGORIES)[number];

// ── Topics (controlled vocabulary) ───────────────────────────────────────────

/**
 * Topics power future filtering, Case matching and retrieval. A topic may be
 * put on a section only when that section's own label or text supports it:
 * each topic's evidence pattern must match (validate.ts).
 */
export const TOPIC_EVIDENCE = {
  formation: /LLC formation|Formation tiers|Instant Formation|at formation|formation filing|formation price/i,
  registered_agent: /registered agent/i,
  annual_report: /annual report|biennial report|Statement of Information/i,
  renewal: /renewal/i,
  amendment: /amendment/i,
  name_change: /Name Change|Change Company Name/i,
  address_change: /Address Change|Update Business Address/i,
  good_standing: /Good Standing/i,
  certified_copy: /Certified Cop/i,
  apostille: /Apostille/i,
  ein: /\bEIN\b|Employer Identification Number/,
  tax_election: /Tax Election|tax classification|Form 2553|Form 8832/i,
  operating_agreement: /Operating Agreement/i,
  governance_documents: /Minutes|Resolutions?\b|Certificate of Incumbency/,
  membership_changes: /Membership changes/i,
  dba: /\bDBA\b|Trade Name/,
  foreign_registration: /Foreign Registration/i,
  dissolution: /dissolution/i,
  reinstatement: /reinstatement/i,
  conversion: /Convert LLC/i,
  business_license: /business license/i,
  publication: /publication/i,
  franchise_tax: /franchise tax/i,
  annual_tax: /annual tax/i,
  late_penalty: /late fee|late penalty/i,
  corporate_binder: /Corporate Binder/i,
  virtual_office: /Virtual Office/i,
  mail_forwarding: /mail receipt|forwarding/i,
  banking: /Instant Bank Account|banking/i,
  business_insurance: /insurance/i,
  business_financing: /financing/i,
  boi_compliance: /Corporate Transparency Act|\bBOI\b/,
  trademark: /trademark/i,
  tax_preparation: /tax preparation|tax filing/i,
} as const satisfies Record<string, RegExp>;
export type KnowledgeTopic = keyof typeof TOPIC_EVIDENCE;
export const KNOWLEDGE_TOPICS = Object.keys(TOPIC_EVIDENCE) as KnowledgeTopic[];

// ── Services (controlled catalog keys) ───────────────────────────────────────

/**
 * Services the LLC source names. A section lists a service key only when the
 * section offers or describes that service — and the key's evidence pattern
 * must match the section text. Labels follow the source's product names.
 * Prices stay in the section text, exactly as printed.
 */
export const SERVICE_CATALOG = {
  llc_formation: { label: "LLC Formation", evidence: /Formation tiers/ },
  instant_formation: { label: "Instant Formation", evidence: /Instant Formation/ },
  registered_agent: { label: "Registered Agent", evidence: /registered agent/i },
  registered_agent_switch: { label: "Registered Agent Switch", evidence: /Registered Agent Switch/ },
  annual_report_filing: { label: "Annual Report / Renewal Filing", evidence: /renewal filing|Renewal filing/ },
  article_amendment: { label: "Article Amendment", evidence: /Article Amendment/ },
  sos_name_change: { label: "Name Change with the Secretary of State", evidence: /Name Change with the Secretary of State/ },
  sos_address_change: { label: "Address Change", evidence: /Address Change/ },
  certificate_of_good_standing: { label: "Certificate of Good Standing", evidence: /Certificate of Good Standing/ },
  certified_copies: { label: "Certified Copies of Articles of Organization", evidence: /Certified Copies/ },
  apostille: { label: "Apostille", evidence: /Apostille/ },
  ein: { label: "Employer Identification Number (EIN)", evidence: /Employer Identification Number/ },
  foreign_ein: { label: "Foreign EIN", evidence: /Foreign EIN/ },
  s_corp_election: { label: "S-Corp Tax Election, Form 2553", evidence: /Form 2553/ },
  tax_classification_change: { label: "Change of tax classification, Form 8832", evidence: /Form 8832/ },
  irs_address_update: { label: "Update Business Address with the IRS, Form 8822", evidence: /Form 8822/ },
  irs_responsible_party_update: { label: "Update Responsible Party", evidence: /Update Responsible Party/ },
  irs_name_change: { label: "Change Company Name on file with the IRS", evidence: /Change Company Name on file with the IRS/ },
  operating_agreement_update: { label: "Updated Operating Agreement", evidence: /Updated Operating Agreement/ },
  annual_meeting_minutes: { label: "Custom Annual Meeting Minutes", evidence: /Custom Annual Meeting Minutes/ },
  meeting_minutes_resolutions: {
    label: "Special, Contribution, and Distribution Meeting Minutes and Resolutions",
    evidence: /Special, Contribution, and Distribution Meeting Minutes/,
  },
  certificate_of_incumbency: { label: "Certificate of Incumbency", evidence: /Certificate of Incumbency/ },
  assignment_of_interest: { label: "Assignment of Interest", evidence: /Assignment of Interest/ },
  membership_change: { label: "Membership changes", evidence: /Membership changes/ },
  nda: { label: "Non-Disclosure Agreement", evidence: /Non-Disclosure Agreement/ },
  independent_contractor_agreement: { label: "Independent Contractor Agreement", evidence: /Independent Contractor Agreement/ },
  digital_asset_assignment: { label: "Digital Asset Assignment", evidence: /Digital Asset Assignment/ },
  dba: { label: "DBA / Trade Name", evidence: /DBA \/ Trade Name/ },
  dba_cancellation: { label: "DBA Cancellation", evidence: /DBA Cancellation/ },
  dba_reassignment: { label: "DBA Reassignment", evidence: /DBA Reassignment/ },
  foreign_registration: { label: "Foreign Registration", evidence: /Foreign Registration/ },
  dissolution: { label: "Dissolution", evidence: /Dissolution/ },
  reinstatement: { label: "Reinstatement", evidence: /Reinstatement/ },
  convert_llc_to_close_llc: { label: "Convert LLC to Close LLC", evidence: /Convert LLC to Close LLC/ },
  convert_llc_to_corporation: { label: "Convert LLC to Corporation", evidence: /Convert LLC to Corporation/ },
  corporate_binder_seal: { label: "Corporate Binder and Seal", evidence: /Corporate Binder and Seal/ },
  custom_operating_agreement: { label: "Custom Operating Agreement", evidence: /Custom Operating Agreement/ },
  virtual_office: { label: "Virtual Office and commercial business address", evidence: /Virtual Office/ },
  mail_forwarding: { label: "Mail receipt / scanning / forwarding", evidence: /mail receipt \/ scanning \/ forwarding/ },
  instant_bank_account: { label: "Instant Bank Account", evidence: /Instant Bank Account/ },
  business_insurance: { label: "Business insurance", evidence: /business insurance/ },
  business_financing_referral: { label: "Business financing referral", evidence: /business financing referral/ },
  boi_compliance: { label: "Corporate Transparency Act / BOI compliance", evidence: /Corporate Transparency Act \/ BOI compliance/ },
  // Named by the source only as services it does NOT provide (Scope and caveats, p. 3).
  trademark_registration: { label: "Trademark registration", evidence: /Trademark registration/ },
  business_license_services: {
    label: "Standalone business license research, application, or renewal",
    evidence: /business license research, application, or renewal/,
  },
  tax_preparation_filing: { label: "Tax preparation and tax filing", evidence: /Tax preparation and tax filing/ },
} as const satisfies Record<string, { label: string; evidence: RegExp }>;
export type ServiceKey = keyof typeof SERVICE_CATALOG;
export const SERVICE_KEYS = Object.keys(SERVICE_CATALOG) as ServiceKey[];

// ── Service profile (structured, evidence-backed) ────────────────────────────

/** A verbatim quote from one section of the same article. */
export interface SourceEvidence {
  sectionKey: string;
  quote: string;
}

export const FORMATION_FULFILLMENT = ["automated_in_house", "vendor_api", "manual_case"] as const;
export const REGISTERED_AGENT_PROVIDERS = ["in_house", "vendor_network"] as const;
export const RENEWAL_CADENCES = ["annual", "biennial", "no_filing"] as const;
export const RENEWAL_FULFILLMENT = ["automated", "manual", "not_offered"] as const;

/**
 * The handful of operational facts later features filter on (automated vs
 * manual formation, RA provider, renewal cadence…). Each value carries the
 * exact quote it was read from, and validate.ts checks the quote is in the
 * named section — so the profile can never drift from the text.
 */
export interface ServiceProfile {
  formationFulfillment: { value: (typeof FORMATION_FULFILLMENT)[number]; evidence: SourceEvidence };
  registeredAgent: { value: (typeof REGISTERED_AGENT_PROVIDERS)[number]; evidence: SourceEvidence };
  renewalCadence: { value: (typeof RENEWAL_CADENCES)[number]; evidence: SourceEvidence };
  /** The due-date rule as printed, or null for a no-filing jurisdiction. */
  renewalDueDate: { value: string | null; evidence: SourceEvidence };
  renewalFulfillment: { value: (typeof RENEWAL_FULFILLMENT)[number]; evidence: SourceEvidence };
  addOnServiceCount: { value: number; evidence: SourceEvidence };
}

// ── Records ──────────────────────────────────────────────────────────────────

/** A section as authored in a content module. */
export interface KnowledgeSectionInput {
  key: string;
  label: string;
  /** Heading exactly as printed in the source. */
  sourceHeading: string;
  /** 1-based position within the article; must equal its array position. */
  order: number;
  kind: SectionKind;
  flag: SourceFlag;
  clientDisclosure: ClientDisclosureLevel | null;
  verification: SectionVerification;
  /** Highlighted sections only; null otherwise. */
  highlightCategory: HighlightCategory | null;
  /** The ninth section reads "N/A…" — nothing applies (as opposed to "nobody checked"). */
  notApplicable: boolean;
  /** Verbatim source text (line breaks joined with a space). */
  content: string;
  /** Source page(s) the section is printed on. */
  sourcePages: number[];
  topics: KnowledgeTopic[];
  serviceKeys: ServiceKey[];
}

/** An article as authored in a content module. */
export interface KnowledgeArticleInput {
  id: string;
  slug: string;
  title: string;
  entityType: KnowledgeEntityType;
  jurisdictionCode: JurisdictionCode;
  jurisdictionName: string;
  articleType: KnowledgeArticleType;
  status: KnowledgeArticleStatus;
  audience: KnowledgeAudience;
  internalOnly: boolean;
  counselReviewed: boolean;
  /** Date of an internal content review; null = none recorded (never assumed). */
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  provenance: {
    sourceId: string;
    /** Pages of the source entry. */
    pages: number[];
    /** The entry header as printed ("Arizona AZ"). */
    sourceEntryHeader: string;
    /** The source's Contents page marks entries that carry a highlighted section. */
    contentsMarksHighlighted: boolean;
  };
  aliases: string[];
  serviceProfile: ServiceProfile;
  sections: KnowledgeSectionInput[];
}

/** Provenance of a whole source document. */
export interface KnowledgeSource {
  id: string;
  fileName: string;
  title: string;
  publisher: string;
  preparedDate: string;
  entityType: KnowledgeEntityType;
  sourceType: "internal_reference_document";
  coverage: string;
  confidentiality: string;
  internalOnly: boolean;
  counselReviewed: boolean;
  sha256: string;
  /** Pages carrying content; the file has blank header/footer-only pages after these. */
  contentPages: number;
  filePages: number;
  /** The source's own framing, verbatim, with the page it is printed on. */
  notices: { key: string; label: string; text: string; page: number }[];
}

// ── Shared (national) services and source discrepancies ──────────────────────

/**
 * Where a shared-service quote is printed: one of the source's own notices
 * (front matter), or one section of a loaded article.
 */
export type SharedEvidenceLocation =
  | { kind: "source_notice"; noticeKey: string }
  | { kind: "article_section"; articleId: string; sectionKey: string };

/**
 * One verbatim passage that supports a shared-service record or a side of a
 * discrepancy. `term` is the exact words inside `quote` that name the
 * service ("banking", "the governance document library").
 */
export interface SharedEvidence {
  sourceId: string;
  location: SharedEvidenceLocation;
  quote: string;
  term: string;
}

/**
 * What a shared-service record says about a service across jurisdictions.
 *   offered          — available in every jurisdiction (scope "national")
 *   not_offered      — not a product (national) / not sold in the listed
 *                      jurisdictions (scope "jurisdictions")
 *   varies_by_state  — the source says it varies by state: there is NO
 *                      national default; only a state entry can say
 *   exclusive        — offered ONLY in the listed jurisdictions
 */
export const SHARED_AVAILABILITY = ["offered", "not_offered", "varies_by_state", "exclusive"] as const;
export type SharedAvailability = (typeof SHARED_AVAILABILITY)[number];

export const SHARED_SCOPES = ["national", "jurisdictions"] as const;
export type SharedScope = (typeof SHARED_SCOPES)[number];

/**
 * A service rule the source states for more than one entry — never inferred
 * from a service merely appearing in several states. Every record carries
 * the verbatim passage(s) it rests on.
 */
export interface KnowledgeSharedService {
  /** Stable id, e.g. "llc-shared:instant_bank_account:national-offered". */
  id: string;
  entityType: KnowledgeEntityType;
  serviceKey: ServiceKey;
  scope: SharedScope;
  /** Scope "jurisdictions" only; null for national records. */
  jurisdictions: JurisdictionCode[] | null;
  availability: SharedAvailability;
  /** Offered everywhere, but the terms (fulfillment, tiers…) are set per state. */
  termsVaryByState: boolean;
  topics: KnowledgeTopic[];
  /** At least one verbatim passage. */
  evidence: SharedEvidence[];
  /** Verbatim qualifications that travel with the service wherever it applies. */
  caveats: SharedEvidence[];
  /** Why a generic source term names this catalog service, when it is not literal. */
  mappingNote: string | null;
}

/**
 * How an unresolved source contradiction limits what may be concluded.
 *   blocks_inheritance    — the national claim is contested, so a
 *                           jurisdiction that does not state the service
 *                           gets "disputed", never "inherited"
 *   disputes_availability — availability itself is contested in the
 *                           affected jurisdictions, even where an entry
 *                           lists the service
 */
export const DISCREPANCY_EFFECTS = ["blocks_inheritance", "disputes_availability"] as const;
export type DiscrepancyEffect = (typeof DISCREPANCY_EFFECTS)[number];

/** Conflicting source statements, kept side by side and never resolved in code. */
export interface KnowledgeSourceDiscrepancy {
  id: string;
  entityType: KnowledgeEntityType;
  serviceKeys: ServiceKey[];
  /** A neutral statement of the open question (authored). */
  question: string;
  effect: DiscrepancyEffect;
  /** Jurisdictions affected: all of them, or all except those listed. */
  affects: { allExcept: JurisdictionCode[] };
  /** Two or more verbatim, conflicting passages. */
  claims: SharedEvidence[];
  /** Always null until a person resolves it from a better source. */
  resolution: null;
}

// ── Effective availability (derived) ─────────────────────────────────────────

/**
 * What the Knowledge Base can say about one service in one jurisdiction.
 *   direct      — stated in this jurisdiction's own entry
 *   inherited   — not stated in the entry; an uncontested national source
 *                 rule makes it available
 *   not_offered — the source says it is not a product (nationally or here)
 *   restricted  — the source restricts it to other jurisdictions
 *   disputed    — conflicting source statements; do not assert either way
 *   unknown     — nothing in the source settles it. Silence is NEVER "not offered".
 */
export const SERVICE_AVAILABILITY_STATUSES = ["direct", "inherited", "not_offered", "restricted", "disputed", "unknown"] as const;
export type ServiceAvailabilityStatus = (typeof SERVICE_AVAILABILITY_STATUSES)[number];

export const SERVICE_AVAILABILITY_REASONS = [
  "stated_in_entry",
  "national_rule",
  "national_rule_disputed",
  "availability_disputed",
  "not_offered_nationally",
  "not_offered_in_jurisdiction",
  "restricted_to_other_jurisdictions",
  "varies_by_state_not_stated",
  "no_statement",
] as const;
export type ServiceAvailabilityReason = (typeof SERVICE_AVAILABILITY_REASONS)[number];
