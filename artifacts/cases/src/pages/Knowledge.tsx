/**
 * Knowledge Base — discovery and search (Phase 8B).
 *
 * Read-only. Lists the published articles the API returns (today: five LLC
 * pilot articles) with server-side filters. Search and topic filters use
 * EFFECTIVE metadata, and each result says how it matched: printed sections,
 * or a national shared service the state entry itself does not print.
 * Filters live in the URL (?q=&entityType=&jurisdiction=&topic=), so Back and
 * refresh keep them.
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, Lock, Search, X } from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import {
  KNOWLEDGE_ENTITY_TYPE_LABELS,
  explainMatch,
  filterOptions,
  highlightedOutline,
  knowledgeSearchParams,
  topicLabel,
  type KnowledgeArticleSummary,
  type KnowledgeListResponse,
  type KnowledgeQuery,
} from "@/lib/knowledge";
import { Input, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { Chip } from "@/components/knowledge/parts";

function readQuery(search: string): KnowledgeQuery {
  const p = new URLSearchParams(search);
  return {
    q: p.get("q") ?? "",
    entityType: p.get("entityType") ?? "",
    jurisdiction: p.get("jurisdiction") ?? "",
    topic: p.get("topic") ?? "",
  };
}

export function Knowledge() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const query = useMemo(() => readQuery(search), [search]);
  const [text, setText] = useState(query.q ?? "");

  // Keep the box in step with Back/Forward.
  useEffect(() => setText(query.q ?? ""), [query.q]);

  /** Typing replaces the history entry; choosing a filter adds one, so Back undoes it. */
  const setQuery = (patch: Partial<KnowledgeQuery>, opts: { replace?: boolean } = {}) => {
    const next = knowledgeSearchParams({ ...query, ...patch });
    navigate(next ? `/knowledge?${next}` : "/knowledge", { replace: opts.replace ?? false });
  };

  // Debounced free-text search.
  useEffect(() => {
    if ((text ?? "") === (query.q ?? "")) return;
    const t = setTimeout(() => setQuery({ q: text }, { replace: true }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const params = knowledgeSearchParams(query);
  const all = useQuery({
    queryKey: ["knowledge", "articles", ""],
    queryFn: () => fetchJson<KnowledgeListResponse>(API("/api/knowledge/articles")),
  });
  const results = useQuery({
    queryKey: ["knowledge", "articles", params],
    queryFn: () => fetchJson<KnowledgeListResponse>(API(`/api/knowledge/articles${params ? `?${params}` : ""}`)),
    placeholderData: (prev) => prev,
  });
  const options = useMemo(() => filterOptions(all.data?.articles ?? []), [all.data]);
  const filtered = !!params;
  const articles = results.data?.articles ?? [];

  return (
    <div className="space-y-5" data-testid="knowledge-page">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Knowledge</div>
          <h1 className="text-xl font-bold tracking-tight">Knowledge Base</h1>
          <p className="text-sm text-white/50 mt-1 max-w-2xl">
            Internal state reference articles — one per state and entity type, copied from the company's internal
            reference documents.
          </p>
        </div>
      </div>

      <div className="glass-panel p-3 flex flex-col md:flex-row md:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <Input
            data-testid="knowledge-search"
            aria-label="Search the Knowledge Base"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search — e.g. annual report, banking, franchise tax"
            className="pl-8 pr-8"
          />
          {text ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setText("");
                setQuery({ q: "" }, { replace: true });
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white p-1"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:flex md:w-auto">
          <Select
            data-testid="knowledge-filter-entity"
            aria-label="Entity type"
            value={query.entityType}
            onChange={(e) => setQuery({ entityType: e.target.value })}
            className="md:w-36"
          >
            <option value="">All entity types</option>
            {options.entityTypes.map((t) => (
              <option key={t} value={t}>
                {KNOWLEDGE_ENTITY_TYPE_LABELS[t] ?? t}
              </option>
            ))}
          </Select>
          <Select
            data-testid="knowledge-filter-state"
            aria-label="State"
            value={query.jurisdiction}
            onChange={(e) => setQuery({ jurisdiction: e.target.value })}
            className="md:w-40"
          >
            <option value="">All states</option>
            {options.jurisdictions.map((j) => (
              <option key={j.code} value={j.code}>
                {j.name}
              </option>
            ))}
          </Select>
          <Select
            data-testid="knowledge-filter-topic"
            aria-label="Topic"
            value={query.topic}
            onChange={(e) => setQuery({ topic: e.target.value })}
            className="md:w-44"
          >
            <option value="">All topics</option>
            {options.topics.map((t) => (
              <option key={t} value={t}>
                {topicLabel(t)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-x-4 gap-y-1 flex-wrap text-xs text-white/45 px-1">
        <span data-testid="knowledge-count">
          {results.isLoading
            ? "Loading…"
            : filtered && all.data
              ? `${articles.length} of ${all.data.count} articles`
              : `${articles.length} article${articles.length === 1 ? "" : "s"}`}
        </span>
        <span className="inline-flex items-center gap-1">
          <Lock size={11} /> Internal reference — not customer-facing
        </span>
      </div>

      {results.isError ? (
        <div className="glass-panel p-6 text-sm text-rose-200">The Knowledge Base could not be loaded.</div>
      ) : !results.isLoading && articles.length === 0 ? (
        <div className="glass-panel" data-testid="knowledge-empty">
          <EmptyState
            icon={BookOpen}
            title="No Knowledge Base articles match your search."
            description="This only means the Knowledge Base has no matching article — not that a service is unavailable."
          />
        </div>
      ) : (
        <ul className="glass-panel divide-y divide-white/5 overflow-hidden" data-testid="knowledge-results">
          {articles.map((a) => (
            <ResultRow key={a.id} article={a} query={query} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ResultRow({ article: a, query }: { article: KnowledgeArticleSummary; query: KnowledgeQuery }) {
  const match = explainMatch(a, query);
  const highlights = highlightedOutline(a);
  return (
    <li data-testid="knowledge-result" data-article-id={a.id} data-jurisdiction={a.jurisdictionCode}>
      <Link
        href={`/knowledge/${a.slug}`}
        className="group flex items-start gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition-colors focus-ring"
      >
        <div className="size-10 shrink-0 rounded-lg bg-white/5 border border-white/10 grid place-items-center text-xs font-bold tracking-wider text-white/80">
          {a.jurisdictionCode}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white group-hover:text-[var(--color-primary)] transition-colors">
              {a.title}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-white/45">
            <span>{a.jurisdictionName}</span>
            <span aria-hidden>·</span>
            <span>{KNOWLEDGE_ENTITY_TYPE_LABELS[a.entityType] ?? a.entityType}</span>
            <span aria-hidden>·</span>
            <span>{a.sections.length} sections</span>
            {a.internalOnly ? (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <Lock size={10} /> Internal
                </span>
              </>
            ) : null}
          </div>
          {highlights.length ? (
            <div className="flex flex-wrap gap-1.5">
              {highlights.map((h) => (
                <Chip key={h.key} tone={h.presentation.tone} title={h.presentation.badge ?? undefined}>
                  {h.label}
                </Chip>
              ))}
            </div>
          ) : null}
          {match ? <MatchLine match={match} topic={query.topic} directTopic={!!query.topic && a.directTopics.includes(query.topic)} /> : null}
        </div>
        <ChevronRight size={16} className="text-white/25 group-hover:text-white/60 mt-3 shrink-0" />
      </Link>
    </li>
  );
}

function MatchLine({
  match,
  topic,
  directTopic,
}: {
  match: NonNullable<ReturnType<typeof explainMatch>>;
  topic?: string;
  directTopic: boolean;
}) {
  const parts: React.ReactNode[] = [];
  if (match.sections.length) {
    parts.push(
      <span key="s" data-testid="knowledge-match-direct">
        Matched in: {match.sections.join(", ")}
      </span>,
    );
  } else if (topic && directTopic) {
    parts.push(
      <span key="t" data-testid="knowledge-match-direct">
        Topic in this state's entry: {topicLabel(topic)}
      </span>,
    );
  }
  if (match.inherited.length) {
    parts.push(
      <span key="i" data-testid="knowledge-match-inherited" className="text-white/60">
        Matched through national shared service — {match.inherited.join(", ")}
        <span className="text-white/35"> (not printed in this state's entry)</span>
      </span>,
    );
  }
  if (match.disputed.length) {
    parts.push(
      <span key="d" data-testid="knowledge-match-disputed" className="text-violet-200">
        Source discrepancy — {match.disputed.join(", ")} (not confirmed)
      </span>,
    );
  }
  if (!parts.length) return null;
  return <div className="flex flex-col gap-0.5 text-[11px] text-white/50">{parts}</div>;
}
