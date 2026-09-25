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
import {
  SERVICE_CATALOG,
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
  type KnowledgeSource,
  type KnowledgeTopic,
  type SectionKind,
  type SectionVerification,
  type ServiceKey,
  type ServiceProfile,
  type SourceFlag,
} from "./model.js";
import { validateKnowledgeContent, type ValidateOptions } from "./validate.js";

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
  /** Union of the sections' topics / services, in first-seen order. */
  topics: KnowledgeTopic[];
  serviceKeys: ServiceKey[];
  flagSummary: KnowledgeFlagSummary;
}

export interface KnowledgeRepository {
  sources: readonly KnowledgeSource[];
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

function buildArticle(a: KnowledgeArticleInput): KnowledgeArticle {
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
    topics: unique(sections.flatMap((s) => s.topics)),
    serviceKeys: unique(sections.flatMap((s) => s.serviceKeys)),
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
export function buildKnowledgeRepository(
  articles: readonly KnowledgeArticleInput[],
  sources: readonly KnowledgeSource[],
  opts: ValidateOptions = {},
): KnowledgeRepository {
  validateKnowledgeContent(articles, sources, opts);
  const all = deepFreeze(articles.map(buildArticle));
  const frozenSources = deepFreeze(sources.map((s) => structuredClone(s)));
  const index = new Map<string, KnowledgeArticle>();
  for (const a of all) {
    index.set(a.id, a);
    index.set(a.slug, a);
  }
  return {
    sources: frozenSources,
    all,
    byIdOrSlug: (key) => index.get(key.trim().toLowerCase()) ?? null,
    source: (id) => frozenSources.find((s) => s.id === id) ?? null,
  };
}

/** The Knowledge Base. Phase 8: the five LLC pilot articles. */
export const knowledgeBase: KnowledgeRepository = buildKnowledgeRepository(LLC_PILOT_ARTICLES, [LLC_SOURCE]);

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
}

/**
 * Deterministic filtering over the readable articles. `q` is a plain
 * all-words match within one section — a validation aid, not a search engine.
 */
export function findArticles(filters: KnowledgeFilters, repo: KnowledgeRepository = knowledgeBase): KnowledgeMatch[] {
  const terms = filters.q ? queryTerms(filters.q) : [];
  const out: KnowledgeMatch[] = [];
  for (const a of readable(repo)) {
    if (filters.entityType && a.entityType !== filters.entityType) continue;
    if (filters.jurisdiction && a.jurisdictionCode !== filters.jurisdiction) continue;
    if (filters.status && a.status !== filters.status) continue;
    if (filters.topic && !a.topics.includes(filters.topic)) continue;
    if (filters.flag && !a.sections.some((s) => s.flag === filters.flag)) continue;
    const sectionIds = terms.length
      ? a.sections.filter((s) => {
          const text = sectionSearchText(a, s);
          return terms.every((t) => text.includes(t));
        }).map((s) => s.id)
      : a.sections.map((s) => s.id);
    if (terms.length && !sectionIds.length) continue;
    out.push({ article: a, sectionIds });
  }
  return out.sort((x, y) => x.article.title.localeCompare(y.article.title));
}
