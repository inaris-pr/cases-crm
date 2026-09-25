/**
 * The ONE canonical Knowledge Base repository (Phase 8).
 *
 * Built once from source-controlled content (content/*.ts), validated
 * (validate.ts) and frozen. The future article UI, Case recommendations and
 * the Knowledge Assistant all read these same records — no second store.
 *
 * Nothing here is persisted to store.json: the articles are code-reviewed
 * content, not business data, so adding them needed no collection, no
 * schema version and no migration of the live store.
 *
 * No embeddings, no semantic search: `searchText` and `contentHash` on each
 * section are the hooks a later indexing pipeline will use (re-embed only the
 * sections whose hash changed; cite by section id).
 */
import { createHash } from "node:crypto";
import { LLC_PILOT_ARTICLES } from "./content/llcPilot.js";
import { LLC_SOURCE } from "./content/llcSource.js";
import { LLC_SHARED_SERVICES, LLC_SOURCE_DISCREPANCIES } from "./content/llcShared.js";
import { evidenceCitation, resolveServiceAvailability, type ServiceAvailability } from "./availability.js";
import {
  SERVICE_CATALOG,
  SERVICE_KEYS,
  sectionCitation,
  sectionId,
  type ClientDisclosureLevel,
  type HighlightCategory,
  type JurisdictionCode,
  type KnowledgeArticleInput,
  type KnowledgeArticleStatus,
  type KnowledgeArticleType,
  type KnowledgeAudience,
  type KnowledgeEntityType,
  type KnowledgeSharedService,
  type KnowledgeSource,
  type KnowledgeSourceDiscrepancy,
  type KnowledgeTopic,
  type SharedEvidence,
  type SectionKind,
  type SectionVerification,
  type ServiceKey,
  type ServiceProfile,
  type SourceFlag,
} from "./model.js";
import {
  KnowledgeValidationError,
  sharedContentProblems,
  validateKnowledgeContent,
  type ValidateOptions,
} from "./validate.js";

// ── Records served by the repository ─────────────────────────────────────────

export interface KnowledgeSection {
  /** Stable, addressable id: "<articleId>:<key>". */
  id: string;
  key: string;
  label: string;
  sourceHeading: string;
  order: number;
  kind: SectionKind;
  flag: SourceFlag;
  clientDisclosure: ClientDisclosureLevel | null;
  verification: SectionVerification;
  highlightCategory: HighlightCategory | null;
  notApplicable: boolean;
  content: string;
  sourcePages: number[];
  topics: KnowledgeTopic[];
  serviceKeys: ServiceKey[];
  /** "Arizona — LLC Services & Requirements → Annual Report and Renewal Filing" */
  citation: string;
  /** sha256 of label + content — changes exactly when the section's words do. */
  contentHash: string;
}

export interface KnowledgeFlagSummary {
  stateRequirements: number;
  clientDisclosures: number;
  knownServiceGaps: number;
  openResearchItems: number;
  sourceDiscrepancies: number;
}

export interface KnowledgeArticle {
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
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  provenance: KnowledgeArticleInput["provenance"];
  aliases: string[];
  serviceProfile: ServiceProfile;
  sections: KnowledgeSection[];
  /**
   * DIRECT metadata: union of the sections' topics / services — what this
   * jurisdiction's entry itself prints. (Kept under these names for
   * compatibility; `directTopics` / `directServiceKeys` are the same lists.)
   */
  topics: KnowledgeTopic[];
  serviceKeys: ServiceKey[];
  directTopics: KnowledgeTopic[];
  directServiceKeys: ServiceKey[];
  /**
   * INHERITED metadata: services the entry does not print but an
   * uncontested national source rule makes available, and their topics.
   * Never text of this article.
   */
  inheritedServiceKeys: ServiceKey[];
  inheritedTopics: KnowledgeTopic[];
  /**
   * EFFECTIVE metadata for filtering/retrieval: services whose status is
   * `direct` or `inherited` (a disputed, restricted or not-offered service is
   * never effective, even if printed), and direct ∪ inherited topics.
   */
  effectiveServiceKeys: ServiceKey[];
  effectiveTopics: KnowledgeTopic[];
  /** Services whose availability here is contested by the source. */
  disputedServiceKeys: ServiceKey[];
  /** One entry per catalog service, each with its status, reason and citation path. */
  serviceAvailability: ServiceAvailability[];
  flagSummary: KnowledgeFlagSummary;
}

/** A shared-service record with human-readable citations for its evidence. */
export interface CitedEvidence extends SharedEvidence {
  citation: string;
}
export interface CitedSharedService extends Omit<KnowledgeSharedService, "evidence" | "caveats"> {
  label: string;
  evidence: CitedEvidence[];
  caveats: CitedEvidence[];
  discrepancyIds: string[];
}
export interface CitedDiscrepancy extends Omit<KnowledgeSourceDiscrepancy, "claims"> {
  claims: CitedEvidence[];
}

export interface KnowledgeRepository {
  sources: readonly KnowledgeSource[];
  /** Explicit shared (national / multi-jurisdiction) service rules, with citations. */
  sharedServices: readonly CitedSharedService[];
  /** Unresolved source contradictions, with citations. */
  discrepancies: readonly CitedDiscrepancy[];
  /** Every article, any status. Readers must go through `readable()`. */
  all: readonly KnowledgeArticle[];
  byIdOrSlug(idOrSlug: string): KnowledgeArticle | null;
  source(id: string): KnowledgeSource | null;
}

// ── Build ────────────────────────────────────────────────────────────────────

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v as object)) deepFreeze(x);
  }
  return v;
}

function buildArticle(
  a: KnowledgeArticleInput,
  shared: readonly KnowledgeSharedService[],
  discrepancies: readonly KnowledgeSourceDiscrepancy[],
): KnowledgeArticle {
  const sections: KnowledgeSection[] = a.sections.map((s) => ({
    id: sectionId(a.id, s.key),
    key: s.key,
    label: s.label,
    sourceHeading: s.sourceHeading,
    order: s.order,
    kind: s.kind,
    flag: s.flag,
    clientDisclosure: s.clientDisclosure,
    verification: s.verification,
    highlightCategory: s.highlightCategory,
    notApplicable: s.notApplicable,
    content: s.content,
    sourcePages: [...s.sourcePages],
    topics: [...s.topics],
    serviceKeys: [...s.serviceKeys],
    citation: sectionCitation(a.title, s.label),
    contentHash: createHash("sha256").update(`${s.label}\n${s.content}`).digest("hex"),
  }));
  const count = (f: SourceFlag) => sections.filter((s) => s.flag === f).length;
  const directServiceKeys = unique(sections.flatMap((s) => s.serviceKeys));
  const directTopics = unique(sections.flatMap((s) => s.topics));
  const directSections = new Map<string, string[]>();
  for (const s of sections) for (const k of s.serviceKeys) directSections.set(k, [...(directSections.get(k) ?? []), s.id]);
  const ctx = { entityType: a.entityType, jurisdictionCode: a.jurisdictionCode, directSections, shared, discrepancies };
  const serviceAvailability = SERVICE_KEYS.map((k) => resolveServiceAvailability(ctx, k));
  const withStatus = (st: string) => serviceAvailability.filter((x) => x.status === st).map((x) => x.serviceKey);
  const inheritedServiceKeys = withStatus("inherited");
  const inheritedTopics = unique(
    inheritedServiceKeys.flatMap((k) =>
      shared.filter((r) => r.serviceKey === k && r.scope === "national" && r.availability === "offered").flatMap((r) => r.topics),
    ),
  ).filter((t) => !directTopics.includes(t));
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    entityType: a.entityType,
    jurisdictionCode: a.jurisdictionCode,
    jurisdictionName: a.jurisdictionName,
    articleType: a.articleType,
    status: a.status,
    audience: a.audience,
    internalOnly: a.internalOnly,
    counselReviewed: a.counselReviewed,
    lastReviewedAt: a.lastReviewedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    provenance: { ...a.provenance, pages: [...a.provenance.pages] },
    aliases: [...a.aliases],
    serviceProfile: structuredClone(a.serviceProfile),
    sections,
    topics: directTopics,
    serviceKeys: directServiceKeys,
    directTopics: [...directTopics],
    directServiceKeys: [...directServiceKeys],
    inheritedServiceKeys,
    inheritedTopics,
    effectiveServiceKeys: [...withStatus("direct"), ...inheritedServiceKeys],
    effectiveTopics: [...directTopics, ...inheritedTopics],
    disputedServiceKeys: withStatus("disputed"),
    serviceAvailability,
    flagSummary: {
      stateRequirements: count("state_requirement"),
      clientDisclosures: count("client_disclosure"),
      knownServiceGaps: count("known_service_gap"),
      openResearchItems: count("open_research_item"),
      sourceDiscrepancies: count("source_discrepancy"),
    },
  };
}

/**
 * Validate and build a repository. Throws KnowledgeValidationError (listing
 * every problem) instead of serving content that does not match its rules.
 */
export interface BuildOptions extends ValidateOptions {
  /** Explicit shared service rules (default: none). */
  shared?: readonly KnowledgeSharedService[];
  /** Recorded source contradictions (default: none). */
  discrepancies?: readonly KnowledgeSourceDiscrepancy[];
}

export function buildKnowledgeRepository(
  articles: readonly KnowledgeArticleInput[],
  sources: readonly KnowledgeSource[],
  opts: BuildOptions = {},
): KnowledgeRepository {
  validateKnowledgeContent(articles, sources, opts);
  const shared = opts.shared ?? [];
  const discrepancies = opts.discrepancies ?? [];
  const sharedProblems = sharedContentProblems(shared, discrepancies, articles, sources);
  if (sharedProblems.length) throw new KnowledgeValidationError(sharedProblems);
  const all = deepFreeze(articles.map((a) => buildArticle(a, shared, discrepancies)));
  const frozenSources = deepFreeze(sources.map((s) => structuredClone(s)));
  const titleOf = (id: string) => all.find((a) => a.id === id)?.title ?? null;
  const labelOf = (id: string, key: string) => all.find((a) => a.id === id)?.sections.find((s) => s.key === key)?.label ?? null;
  const cite = (e: SharedEvidence): CitedEvidence => ({ ...structuredClone(e), citation: evidenceCitation(e, frozenSources, titleOf, labelOf) });
  const citedShared = deepFreeze(
    shared.map((r) => ({
      ...structuredClone(r),
      label: SERVICE_CATALOG[r.serviceKey].label,
      evidence: r.evidence.map(cite),
      caveats: r.caveats.map(cite),
      discrepancyIds: discrepancies.filter((d) => (d.serviceKeys as string[]).includes(r.serviceKey)).map((d) => d.id),
    })),
  );
  const citedDiscrepancies = deepFreeze(discrepancies.map((d) => ({ ...structuredClone(d), claims: d.claims.map(cite) })));
  const index = new Map<string, KnowledgeArticle>();
  for (const a of all) {
    index.set(a.id, a);
    index.set(a.slug, a);
  }
  return {
    sources: frozenSources,
    sharedServices: citedShared,
    discrepancies: citedDiscrepancies,
    all,
    byIdOrSlug: (key) => index.get(key.trim().toLowerCase()) ?? null,
    source: (id) => frozenSources.find((s) => s.id === id) ?? null,
  };
}

/** The Knowledge Base. Phase 8: the five LLC pilot articles. */
export const knowledgeBase: KnowledgeRepository = buildKnowledgeRepository(LLC_PILOT_ARTICLES, [LLC_SOURCE], {
  shared: LLC_SHARED_SERVICES,
  discrepancies: LLC_SOURCE_DISCREPANCIES,
});

/** The shared records and discrepancies bearing on one article (for its detail response). */
export function sharedContextFor(article: KnowledgeArticle, repo: KnowledgeRepository = knowledgeBase) {
  const sharedIds = new Set(article.serviceAvailability.flatMap((x) => x.sharedServiceIds));
  const discrepancyIds = new Set(article.serviceAvailability.flatMap((x) => x.discrepancyIds));
  return {
    sharedServices: repo.sharedServices.filter((r) => sharedIds.has(r.id)),
    sourceDiscrepancies: repo.discrepancies.filter((d) => discrepancyIds.has(d.id)),
  };
}

// ── Reading ──────────────────────────────────────────────────────────────────

/**
 * What an employee holding knowledge.view may read: published articles only.
 * Drafts and archived articles wait for a future knowledge.manage permission.
 */
export function readable(repo: KnowledgeRepository = knowledgeBase): KnowledgeArticle[] {
  return repo.all.filter((a) => a.status === "published");
}

export interface KnowledgeFilters {
  entityType?: KnowledgeEntityType;
  jurisdiction?: JurisdictionCode;
  status?: KnowledgeArticleStatus;
  topic?: KnowledgeTopic;
  service?: ServiceKey;
  /**
   * Which metadata `topic` / `service` (and `q`) match: "effective" (default:
   * direct + inherited) or "direct" (only what the entry prints).
   */
  metadata?: "effective" | "direct";
  flag?: SourceFlag;
  q?: string;
}

/** Lower-case words of a query ("Good-Standing CA" → ["good", "standing", "ca"]). */
export function queryTerms(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9$.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
}

/** What a section is searched by: article identity + section label, text, topics and services. */
export function sectionSearchText(a: KnowledgeArticle, s: KnowledgeSection): string {
  const services = s.serviceKeys.map((k) => SERVICE_CATALOG[k].label);
  return [a.title, a.jurisdictionName, a.jurisdictionCode, ...a.aliases, s.label, s.content, ...s.topics, ...services]
    .join(" ")
    .toLowerCase();
}

export interface KnowledgeMatch {
  article: KnowledgeArticle;
  /** Sections matching `q` (every section when there is no `q`). */
  sectionIds: string[];
  /** Inherited services matching `q` — never presented as article text. */
  inheritedServiceKeys: ServiceKey[];
}

/** What an inherited service is searched by: its catalog label, topics and the source terms naming it. */
function inheritedSearchText(a: KnowledgeArticle, key: ServiceKey, repo: KnowledgeRepository): string {
  const rules = repo.sharedServices.filter((r) => r.serviceKey === key && r.scope === "national" && r.availability === "offered");
  return [a.title, a.jurisdictionName, a.jurisdictionCode, ...a.aliases, SERVICE_CATALOG[key].label, ...rules.flatMap((r) => [...r.topics, ...r.evidence.map((e) => e.term)])]
    .join(" ")
    .toLowerCase();
}

/**
 * Deterministic filtering over the readable articles. `q` is a plain
 * all-words match within one section — a validation aid, not a search engine.
 */
export function findArticles(filters: KnowledgeFilters, repo: KnowledgeRepository = knowledgeBase): KnowledgeMatch[] {
  const terms = filters.q ? queryTerms(filters.q) : [];
  const directOnly = filters.metadata === "direct";
  const out: KnowledgeMatch[] = [];
  for (const a of readable(repo)) {
    if (filters.entityType && a.entityType !== filters.entityType) continue;
    if (filters.jurisdiction && a.jurisdictionCode !== filters.jurisdiction) continue;
    if (filters.status && a.status !== filters.status) continue;
    if (filters.topic && !(directOnly ? a.directTopics : a.effectiveTopics).includes(filters.topic)) continue;
    if (filters.service && !(directOnly ? a.directServiceKeys : a.effectiveServiceKeys).includes(filters.service)) continue;
    if (filters.flag && !a.sections.some((s) => s.flag === filters.flag)) continue;
    const matches = (text: string) => terms.every((t) => text.includes(t));
    const sectionIds = terms.length
      ? a.sections.filter((s) => matches(sectionSearchText(a, s))).map((s) => s.id)
      : a.sections.map((s) => s.id);
    const inheritedServiceKeys =
      terms.length && !directOnly ? a.inheritedServiceKeys.filter((k) => matches(inheritedSearchText(a, k, repo))) : [];
    if (terms.length && !sectionIds.length && !inheritedServiceKeys.length) continue;
    out.push({ article: a, sectionIds, inheritedServiceKeys });
  }
  return out.sort((x, y) => x.article.title.localeCompare(y.article.title));
}
