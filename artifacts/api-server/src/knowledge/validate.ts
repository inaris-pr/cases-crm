/**
 * Deterministic validation of Knowledge Base content (Phase 8).
 *
 * Runs when the repository is built (server start, every test), so content
 * that drops, reorders or misclassifies a section — or tags a section with
 * something its text does not support — never loads.
 *
 * Pure; no I/O.
 */
import {
  CLIENT_DISCLOSURE_LEVELS,
  HIGHLIGHT_CATEGORIES,
  KNOWLEDGE_ARTICLE_STATUSES,
  KNOWLEDGE_ARTICLE_TYPES,
  KNOWLEDGE_AUDIENCES,
  KNOWLEDGE_ENTITY_TYPES,
  SECTION_KINDS,
  SOURCE_FLAGS,
  FORMATION_FULFILLMENT,
  REGISTERED_AGENT_PROVIDERS,
  RENEWAL_CADENCES,
  RENEWAL_FULFILLMENT,
  SECTION_TEMPLATES,
  SECTION_VERIFICATION,
  SERVICE_CATALOG,
  TOPIC_EVIDENCE,
  articleId,
  articleTitle,
  jurisdictionByCode,
  slugify,
  type KnowledgeArticleInput,
  type KnowledgeSectionInput,
  type KnowledgeSource,
  type SectionTemplateEntry,
  type KnowledgeEntityType,
  type KnowledgeSharedService,
  type KnowledgeSourceDiscrepancy,
  type SharedEvidence,
  DISCREPANCY_EFFECTS,
  SHARED_AVAILABILITY,
  SHARED_SCOPES,
} from "./model.js";

const set = (xs: readonly string[]) => new Set<string>(xs);
const ENTITY_TYPE_SET = set(KNOWLEDGE_ENTITY_TYPES);
const ARTICLE_TYPE_SET = set(KNOWLEDGE_ARTICLE_TYPES);
const ARTICLE_STATUS_SET = set(KNOWLEDGE_ARTICLE_STATUSES);
const AUDIENCE_SET = set(KNOWLEDGE_AUDIENCES);
const SECTION_KIND_SET = set(SECTION_KINDS);
const SOURCE_FLAG_SET = set(SOURCE_FLAGS);
const HIGHLIGHT_CATEGORY_SET = set(HIGHLIGHT_CATEGORIES);

export class KnowledgeValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Knowledge Base content is invalid:\n  - ${problems.join("\n  - ")}`);
    this.name = "KnowledgeValidationError";
  }
}

export interface ValidateOptions {
  /** Section templates by entity type (defaults to SECTION_TEMPLATES). */
  templates?: Partial<Record<KnowledgeEntityType, readonly SectionTemplateEntry[]>>;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const SECTION_KEY = /^[a-z][a-z0-9_]*$/;

/**
 * Classification a highlighted heading implies. The heading is the source's
 * own words, so a flag that disagrees with it is a transcription error.
 */
function flagImpliedByHeading(heading: string): { flag?: string; disclosure?: string } {
  const h = heading.toUpperCase();
  const out: { flag?: string; disclosure?: string } = {};
  if (h.includes("OPEN RESEARCH ITEM")) out.flag = "open_research_item";
  else if (h.includes("KNOWN SERVICE GAP")) out.flag = "known_service_gap";
  else if (h.includes("DISCREPANCY")) out.flag = "source_discrepancy";
  else if (h.includes("CLIENT DISCLOSURE")) out.flag = "client_disclosure";
  if (h.includes("CLIENT DISCLOSURE REQUIRED")) out.disclosure = "required";
  else if (h.includes("CLIENT DISCLOSURE RECOMMENDED")) out.disclosure = "recommended";
  return out;
}

/** Every problem with one section; `where` prefixes each message. */
function sectionProblems(s: KnowledgeSectionInput, where: string, template: SectionTemplateEntry | undefined): string[] {
  const p: string[] = [];
  if (!SECTION_KEY.test(s.key)) p.push(`${where}: key "${s.key}" is not snake_case`);
  if (!s.label.trim()) p.push(`${where}: empty label`);
  if (!s.content.trim()) p.push(`${where}: empty content`);
  if (s.content !== s.content.trim() || /\s{2,}|\n/.test(s.content)) p.push(`${where}: content whitespace is not normalized`);
  if (!SECTION_KIND_SET.has(s.kind)) p.push(`${where}: unknown kind "${s.kind}"`);
  if (!SOURCE_FLAG_SET.has(s.flag)) p.push(`${where}: unknown flag "${s.flag}"`);
  if (!(SECTION_VERIFICATION as readonly string[]).includes(s.verification))
    p.push(`${where}: unknown verification "${s.verification}"`);
  if (s.clientDisclosure !== null && !(CLIENT_DISCLOSURE_LEVELS as readonly string[]).includes(s.clientDisclosure))
    p.push(`${where}: unknown clientDisclosure "${s.clientDisclosure}"`);
  if (!Array.isArray(s.sourcePages) || s.sourcePages.length === 0) p.push(`${where}: no source pages`);

  if (template) {
    // One of the nine sections every entry has.
    if (s.key !== template.key) p.push(`${where}: expected section "${template.key}", found "${s.key}"`);
    if (s.label !== template.label) p.push(`${where}: label must be "${template.label}"`);
    if (s.sourceHeading !== template.sourceHeading) p.push(`${where}: source heading must be "${template.sourceHeading}"`);
    if (s.kind !== template.kind) p.push(`${where}: kind must be "${template.kind}"`);
    if (s.highlightCategory !== null) p.push(`${where}: only highlighted sections carry a highlight category`);
    if (s.clientDisclosure !== null) p.push(`${where}: only highlighted sections carry a client-disclosure level`);
    if (s.verification !== "documented") p.push(`${where}: a standard section is documented content`);
    const saysNA = /^N\/A\b/.test(s.content);
    if (s.kind === "standard") {
      if (s.flag !== "none") p.push(`${where}: a standard section has no flag`);
      if (s.notApplicable) p.push(`${where}: only the state-specific section can be N/A`);
    } else {
      // The ninth section: "N/A" means nothing applies — kept distinct from "nobody checked".
      if (s.notApplicable !== saysNA) p.push(`${where}: notApplicable must match the "N/A" text`);
      const expected = saysNA ? "none" : "state_requirement";
      if (s.flag !== expected) p.push(`${where}: flag must be "${expected}"`);
    }
  } else {
    // A highlighted box after the nine sections.
    if (s.kind !== "highlighted") p.push(`${where}: sections after the standard nine must be highlighted`);
    if (s.notApplicable) p.push(`${where}: a highlighted section cannot be N/A`);
    if (s.flag === "none") p.push(`${where}: a highlighted section must carry a source flag`);
    if (s.highlightCategory === null || !HIGHLIGHT_CATEGORY_SET.has(s.highlightCategory))
      p.push(`${where}: highlighted section needs a known highlight category`);
    if (s.sourceHeading !== s.sourceHeading.toUpperCase()) p.push(`${where}: source heading must be as printed`);
    if (s.label.toUpperCase() !== s.sourceHeading) p.push(`${where}: label must read the same as the source heading`);
    const implied = flagImpliedByHeading(s.sourceHeading);
    if (implied.flag && s.flag !== implied.flag) p.push(`${where}: heading implies flag "${implied.flag}", found "${s.flag}"`);
    if ((implied.disclosure ?? null) !== s.clientDisclosure)
      p.push(`${where}: heading implies client disclosure "${implied.disclosure ?? null}", found "${s.clientDisclosure}"`);
    if (s.flag === "client_disclosure" && s.clientDisclosure === null) p.push(`${where}: client disclosure needs a level`);
    if (s.flag === "open_research_item" && s.highlightCategory !== "open_research_item")
      p.push(`${where}: an open research item must use the open_research_item category`);
    if (s.flag === "known_service_gap" && s.highlightCategory !== "known_service_gap")
      p.push(`${where}: a known service gap must use the known_service_gap category`);
  }
  // An Open Research Item is an unanswered question — never documented fact.
  if ((s.flag === "open_research_item") !== (s.verification === "unverified"))
    p.push(`${where}: exactly the open research items are "unverified"`);

  // Tags must be supported by the section's own label or text.
  const text = `${s.label} ${s.content}`;
  const seenTopics = new Set<string>();
  for (const t of s.topics) {
    const re = (TOPIC_EVIDENCE as Record<string, RegExp>)[t];
    if (!re) p.push(`${where}: unknown topic "${t}"`);
    else if (!re.test(text)) p.push(`${where}: topic "${t}" is not supported by the section text`);
    if (seenTopics.has(t)) p.push(`${where}: duplicate topic "${t}"`);
    seenTopics.add(t);
  }
  const seenServices = new Set<string>();
  for (const k of s.serviceKeys) {
    const svc = (SERVICE_CATALOG as Record<string, { evidence: RegExp }>)[k];
    if (!svc) p.push(`${where}: unknown service "${k}"`);
    else if (!svc.evidence.test(s.content)) p.push(`${where}: service "${k}" is not named in the section text`);
    if (seenServices.has(k)) p.push(`${where}: duplicate service "${k}"`);
    seenServices.add(k);
  }
  return p;
}

/** Every problem with one article (empty = valid). */
export function articleProblems(
  a: KnowledgeArticleInput,
  sources: readonly KnowledgeSource[],
  opts: ValidateOptions = {},
): string[] {
  const where = `article ${a.id || "(no id)"}`;
  const p: string[] = [];
  if (!ENTITY_TYPE_SET.has(a.entityType)) p.push(`${where}: unknown entity type "${a.entityType}"`);
  if (!ARTICLE_TYPE_SET.has(a.articleType)) p.push(`${where}: unknown article type "${a.articleType}"`);
  if (!ARTICLE_STATUS_SET.has(a.status)) p.push(`${where}: unknown status "${a.status}"`);
  if (!AUDIENCE_SET.has(a.audience)) p.push(`${where}: unknown audience "${a.audience}"`);

  const j = jurisdictionByCode(String(a.jurisdictionCode ?? ""));
  if (!j || j.code !== a.jurisdictionCode) p.push(`${where}: unknown jurisdiction "${a.jurisdictionCode}"`);
  else if (j.name !== a.jurisdictionName) p.push(`${where}: jurisdiction ${j.code} is "${j.name}", not "${a.jurisdictionName}"`);
  if (p.length) return p; // identity below depends on these

  const expectedTitle = articleTitle(a.jurisdictionName, a.entityType);
  if (a.title !== expectedTitle) p.push(`${where}: title must be "${expectedTitle}"`);
  const expectedId = articleId(a.entityType, a.jurisdictionCode, a.articleType);
  if (a.id !== expectedId) p.push(`${where}: id must be "${expectedId}"`);
  if (a.slug !== slugify(expectedTitle)) p.push(`${where}: slug must be "${slugify(expectedTitle)}"`);
  if (!ISO.test(a.createdAt) || !ISO.test(a.updatedAt)) p.push(`${where}: createdAt/updatedAt must be ISO timestamps`);
  if (a.updatedAt < a.createdAt) p.push(`${where}: updatedAt precedes createdAt`);
  if (a.lastReviewedAt !== null && !ISO.test(a.lastReviewedAt)) p.push(`${where}: lastReviewedAt must be null or ISO`);

  // Provenance: the article can never claim more than its source.
  const src = sources.find((s) => s.id === a.provenance?.sourceId);
  if (!src) p.push(`${where}: unknown source "${a.provenance?.sourceId}"`);
  else {
    if (src.entityType !== a.entityType) p.push(`${where}: source ${src.id} is for ${src.entityType} content`);
    if (src.internalOnly && !a.internalOnly) p.push(`${where}: source is internal-only, so the article must be too`);
    if (!src.counselReviewed && a.counselReviewed) p.push(`${where}: source was not reviewed by counsel; the article cannot claim it`);
    const pages = a.provenance.pages ?? [];
    if (!pages.length || pages.some((n) => !Number.isInteger(n) || n < 1 || n > src.contentPages))
      p.push(`${where}: provenance pages must be within the source's ${src.contentPages} content pages`);
    for (const s of a.sections ?? []) {
      if ((s.sourcePages ?? []).some((n) => !pages.includes(n))) p.push(`${where}: section ${s.key} cites a page outside the entry`);
    }
    const header = `${a.jurisdictionName} ${a.jurisdictionCode}`;
    if (a.provenance.sourceEntryHeader !== header) p.push(`${where}: source entry header must be "${header}"`);
  }
  if (a.audience !== "internal") p.push(`${where}: only internal articles exist`);

  // Sections: the template's sections first, in order, then highlighted boxes.
  const template = (opts.templates ?? SECTION_TEMPLATES)[a.entityType];
  if (!template) {
    p.push(`${where}: no section template is defined for ${a.entityType} articles yet`);
    return p;
  }
  const sections = a.sections ?? [];
  if (sections.length < template.length) p.push(`${where}: has ${sections.length} sections; every entry has ${template.length}`);
  const keys = new Set<string>();
  sections.forEach((s, i) => {
    const sWhere = `${where} section ${i + 1} (${s.key})`;
    if (s.order !== i + 1) p.push(`${sWhere}: order ${s.order} does not match its position ${i + 1}`);
    if (keys.has(s.key)) p.push(`${sWhere}: duplicate section key`);
    keys.add(s.key);
    p.push(...sectionProblems(s, sWhere, template[i]));
    if (i >= template.length && template.some((t) => t.key === s.key))
      p.push(`${sWhere}: a standard section key cannot be reused for a highlighted box`);
  });
  const highlighted = sections.some((s) => s.kind === "highlighted");
  if (a.provenance && highlighted !== a.provenance.contentsMarksHighlighted)
    p.push(`${where}: the source's Contents page ${a.provenance.contentsMarksHighlighted ? "marks" : "does not mark"} this entry as having a highlighted section`);

  p.push(...serviceProfileProblems(a, where));
  return p;
}

function serviceProfileProblems(a: KnowledgeArticleInput, where: string): string[] {
  const p: string[] = [];
  const sp = a.serviceProfile;
  if (!sp) return [`${where}: missing service profile`];
  const content = new Map(a.sections.map((s) => [s.key, s.content]));
  const check = (field: string, e: { sectionKey: string; quote: string } | undefined) => {
    if (!e || !e.quote?.trim()) return p.push(`${where}: service profile ${field} has no evidence`);
    const text = content.get(e.sectionKey);
    if (text === undefined) p.push(`${where}: service profile ${field} cites unknown section "${e.sectionKey}"`);
    else if (!text.includes(e.quote)) p.push(`${where}: service profile ${field} quote is not in section "${e.sectionKey}"`);
  };
  const oneOf = (field: string, value: unknown, allowed: readonly unknown[]) => {
    if (!allowed.includes(value)) p.push(`${where}: service profile ${field} "${String(value)}" is not one of ${allowed.join(", ")}`);
  };
  oneOf("formationFulfillment", sp.formationFulfillment?.value, FORMATION_FULFILLMENT);
  oneOf("registeredAgent", sp.registeredAgent?.value, REGISTERED_AGENT_PROVIDERS);
  oneOf("renewalCadence", sp.renewalCadence?.value, RENEWAL_CADENCES);
  oneOf("renewalFulfillment", sp.renewalFulfillment?.value, RENEWAL_FULFILLMENT);
  for (const f of ["formationFulfillment", "registeredAgent", "renewalCadence", "renewalDueDate", "renewalFulfillment", "addOnServiceCount"] as const) {
    check(f, sp[f]?.evidence);
  }
  const due = sp.renewalDueDate?.value;
  if (due !== null && due !== undefined && !sp.renewalDueDate.evidence.quote.includes(due))
    p.push(`${where}: renewal due date must be quoted exactly`);
  const noFiling = sp.renewalCadence?.value === "no_filing";
  if (noFiling !== (due === null)) p.push(`${where}: only a no-filing jurisdiction has no renewal due date`);
  if (noFiling !== (sp.renewalFulfillment?.value === "not_offered"))
    p.push(`${where}: renewal filing is "not_offered" exactly when no filing is required`);
  const count = sp.addOnServiceCount?.value;
  if (!Number.isInteger(count) || !new RegExp(`\\b${count}\\b`).test(sp.addOnServiceCount.evidence.quote))
    p.push(`${where}: add-on service count must appear in its quote`);
  // No renewal filing is sold where none is required.
  if (noFiling && a.sections.some((s) => s.serviceKeys.includes("annual_report_filing")))
    p.push(`${where}: a no-filing jurisdiction cannot list the annual report filing service`);
  return p;
}

/**
 * Validate a whole set of articles: each article, plus uniqueness across the
 * set — one article per (entity type, jurisdiction, article type), unique ids
 * and slugs. Throws KnowledgeValidationError listing every problem.
 */
export function validateKnowledgeContent(
  articles: readonly KnowledgeArticleInput[],
  sources: readonly KnowledgeSource[],
  opts: ValidateOptions = {},
): void {
  const problems: string[] = [];
  const sourceIds = new Set<string>();
  for (const s of sources) {
    if (sourceIds.has(s.id)) problems.push(`duplicate source id "${s.id}"`);
    sourceIds.add(s.id);
    if (!/^[0-9a-f]{64}$/.test(s.sha256)) problems.push(`source ${s.id}: sha256 must be 64 hex characters`);
  }
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const identities = new Set<string>();
  for (const a of articles) {
    problems.push(...articleProblems(a, sources, opts));
    if (ids.has(a.id)) problems.push(`duplicate article id "${a.id}"`);
    if (slugs.has(a.slug)) problems.push(`duplicate article slug "${a.slug}"`);
    const identity = `${a.entityType}/${a.jurisdictionCode}/${a.articleType}`;
    if (identities.has(identity))
      problems.push(`duplicate article for ${identity}: one article per jurisdiction per entity type`);
    ids.add(a.id);
    slugs.add(a.slug);
    identities.add(identity);
  }
  if (problems.length) throw new KnowledgeValidationError(problems);
}

// ── Shared services and discrepancies ────────────────────────────────────────


/** The stored text an evidence location points at, or null when it does not resolve. */
function evidenceText(
  e: SharedEvidence,
  articles: readonly KnowledgeArticleInput[],
  sources: readonly KnowledgeSource[],
): string | null {
  const src = sources.find((s) => s.id === e.sourceId);
  if (!src) return null;
  if (e.location.kind === "source_notice") {
    const key = e.location.noticeKey;
    return src.notices.find((n) => n.key === key)?.text ?? null;
  }
  const { articleId: aid, sectionKey } = e.location;
  const a = articles.find((x) => x.id === aid && x.provenance.sourceId === src.id);
  return a?.sections.find((s) => s.key === sectionKey)?.content ?? null;
}

function evidenceProblems(
  e: SharedEvidence,
  where: string,
  articles: readonly KnowledgeArticleInput[],
  sources: readonly KnowledgeSource[],
): string[] {
  const text = evidenceText(e, articles, sources);
  if (text === null) return [`${where}: evidence location does not resolve (${JSON.stringify(e.location)})`];
  const p: string[] = [];
  if (!e.quote.trim() || !text.includes(e.quote)) p.push(`${where}: quote is not in the cited source text`);
  if (!e.term.trim() || !e.quote.includes(e.term)) p.push(`${where}: term "${e.term}" is not in its quote`);
  return p;
}

/** Does any active discrepancy with this effect cover (service, jurisdiction)? */
export function discrepancyCovers(
  discrepancies: readonly KnowledgeSourceDiscrepancy[],
  serviceKey: string,
  jurisdiction: string,
  effect: KnowledgeSourceDiscrepancy["effect"],
): boolean {
  return discrepancies.some(
    (d) =>
      d.resolution === null &&
      d.effect === effect &&
      (d.serviceKeys as string[]).includes(serviceKey) &&
      !(d.affects.allExcept as string[]).includes(jurisdiction),
  );
}

/**
 * Validate shared-service records and discrepancies against the loaded
 * articles and sources. Besides provenance, it refuses UNRECORDED
 * contradictions: a service cannot be both nationally offered and
 * state-varying, restricted and listed elsewhere, or "not a product" and
 * listed, unless a discrepancy records the conflict.
 */
export function sharedContentProblems(
  shared: readonly KnowledgeSharedService[],
  discrepancies: readonly KnowledgeSourceDiscrepancy[],
  articles: readonly KnowledgeArticleInput[],
  sources: readonly KnowledgeSource[],
): string[] {
  const p: string[] = [];
  const ids = new Set<string>();
  for (const r of shared) {
    const where = `shared service ${r.id}`;
    if (ids.has(r.id)) p.push(`${where}: duplicate id`);
    ids.add(r.id);
    if (!ENTITY_TYPE_SET.has(r.entityType)) p.push(`${where}: unknown entity type`);
    const svc = (SERVICE_CATALOG as Record<string, { label: string }>)[r.serviceKey];
    if (!svc) p.push(`${where}: unknown service "${r.serviceKey}"`);
    if (!(SHARED_SCOPES as readonly string[]).includes(r.scope)) p.push(`${where}: unknown scope "${r.scope}"`);
    if (!(SHARED_AVAILABILITY as readonly string[]).includes(r.availability)) p.push(`${where}: unknown availability "${r.availability}"`);
    if (r.scope === "national" && r.jurisdictions !== null) p.push(`${where}: a national record lists no jurisdictions`);
    if (r.scope === "jurisdictions") {
      if (!r.jurisdictions?.length) p.push(`${where}: lists no jurisdictions`);
      for (const j of r.jurisdictions ?? []) if (!jurisdictionByCode(j)) p.push(`${where}: unknown jurisdiction "${j}"`);
    }
    if (r.availability === "exclusive" && r.scope !== "jurisdictions") p.push(`${where}: "exclusive" needs listed jurisdictions`);
    if (r.availability === "varies_by_state" && r.scope !== "national") p.push(`${where}: "varies_by_state" is a national statement`);
    // No shared record without a verbatim passage behind it.
    if (!r.evidence.length) p.push(`${where}: has no source evidence`);
    r.evidence.forEach((e, i) => p.push(...evidenceProblems(e, `${where} evidence ${i + 1}`, articles, sources)));
    r.caveats.forEach((e, i) => p.push(...evidenceProblems(e, `${where} caveat ${i + 1}`, articles, sources)));
    if (r.evidence.some((e) => sources.find((s) => s.id === e.sourceId)?.entityType !== r.entityType))
      p.push(`${where}: evidence comes from a source for another entity type`);
    // Topics must be supported by the quotes or by the service's own catalog name.
    const text = [...r.evidence.map((e) => e.quote), svc?.label ?? ""].join(" ");
    for (const t of r.topics) {
      const re = (TOPIC_EVIDENCE as Record<string, RegExp>)[t];
      if (!re) p.push(`${where}: unknown topic "${t}"`);
      else if (!re.test(text)) p.push(`${where}: topic "${t}" is not supported by its evidence`);
    }
  }

  const dIds = new Set<string>();
  for (const d of discrepancies) {
    const where = `discrepancy ${d.id}`;
    if (dIds.has(d.id)) p.push(`${where}: duplicate id`);
    dIds.add(d.id);
    if (!(DISCREPANCY_EFFECTS as readonly string[]).includes(d.effect)) p.push(`${where}: unknown effect "${d.effect}"`);
    if (d.resolution !== null) p.push(`${where}: discrepancies are never resolved in code`);
    if (d.claims.length < 2) p.push(`${where}: needs at least two conflicting claims`);
    d.claims.forEach((e, i) => p.push(...evidenceProblems(e, `${where} claim ${i + 1}`, articles, sources)));
    for (const k of d.serviceKeys) if (!(k in SERVICE_CATALOG)) p.push(`${where}: unknown service "${k}"`);
    if (!d.question.trim()) p.push(`${where}: states no question`);
  }

  // Unrecorded contradictions are content errors.
  const byKey = new Map<string, KnowledgeSharedService[]>();
  for (const r of shared) byKey.set(r.serviceKey, [...(byKey.get(r.serviceKey) ?? []), r]);
  for (const [key, rules] of byKey) {
    const has = (a: string, scope?: string) => rules.some((r) => r.availability === a && (!scope || r.scope === scope));
    const coveredEverywhere = (effect: KnowledgeSourceDiscrepancy["effect"]) =>
      discrepancies.some((d) => d.effect === effect && (d.serviceKeys as string[]).includes(key));
    // A jurisdiction-scoped exception is a legitimate override of a national
    // default (more specific wins); a conflicting NATIONAL claim is not.
    if (
      has("offered", "national") &&
      (has("varies_by_state") || has("exclusive") || has("not_offered", "national")) &&
      !coveredEverywhere("blocks_inheritance") &&
      !coveredEverywhere("disputes_availability")
    )
      p.push(`service ${key}: offered nationally by one record and limited by another, with no discrepancy recorded`);
    for (const a of articles) {
      if (!a.sections.some((s) => (s.serviceKeys as string[]).includes(key))) continue;
      const j = a.jurisdictionCode;
      const conflict = rules.some(
        (r) =>
          r.entityType === a.entityType &&
          ((r.availability === "not_offered" && (r.scope === "national" || (r.jurisdictions as string[]).includes(j))) ||
            (r.availability === "exclusive" && !(r.jurisdictions as string[]).includes(j))),
      );
      if (conflict && !discrepancyCovers(discrepancies, key, j, "disputes_availability"))
        p.push(`service ${key}: ${a.id} lists it, but a source rule says it is not offered there — record the discrepancy`);
    }
  }
  return p;
}
