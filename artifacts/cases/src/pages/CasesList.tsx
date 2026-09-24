import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Folder,
  FolderKanban,
  Plus,
  Search,
  Rows3,
  LayoutGrid,
  SlidersHorizontal,
  MoreVertical,
  X as XIcon,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
} from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type {
  CaseStatus,
  CasePriority,
  CaseWithCustomer,
  Case,
} from "@/lib/api";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { CasesBoard } from "./CasesBoard";
import { NewCaseDrawer } from "@/components/cases/NewCaseDrawer";
import { can } from "@cases/access";
import { useAuth } from "@/lib/auth";
import {
  CASE_SORT_LABELS,
  DEFAULT_CASE_SORT,
  caseSortDirection,
  describeCaseSort,
  nextCaseSort,
  sortCases,
  type CaseSort,
  type CaseSortColumn,
} from "@/lib/caseSort";

type View = "table" | "cards" | "board";

export function CasesList() {
  const [, navigate] = useLocation();
  const canCreateCase = can(useAuth().permissions, "cases.create");
  const [view, setView] = useState<View>("table");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CaseStatus | "">("");
  const [priority, setPriority] = useState<CasePriority | "">("");
  const [assignee, setAssignee] = useState<string>(""); // "" = all, otherwise teammate name
  const [open, setOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<CaseStatus | undefined>(undefined);
  // Table-only column sort. null = default (Last Modified, newest first).
  const [sort, setSort] = useState<CaseSort>(DEFAULT_CASE_SORT);
  const onSort = (column: CaseSortColumn) => setSort((s) => nextCaseSort(s, column));

  const team = useQuery({
    queryKey: ["team"],
    queryFn: () => fetchJson<string[]>(API("/api/team")),
    staleTime: 5 * 60_000,
  });

  const cases = useQuery({
    queryKey: ["cases", { status, priority, search, assignee }],
    queryFn: () =>
      fetchJson<CaseWithCustomer[]>(
        API(
          `/api/cases?${new URLSearchParams({
            ...(status ? { status } : {}),
            ...(priority ? { priority } : {}),
            ...(search ? { search } : {}),
            ...(assignee ? { assignee } : {}),
          }).toString()}`,
        ),
      ),
    // Table and cards share this query; the board fetches its own data.
    enabled: view !== "board",
  });

  function openNewCase(s?: CaseStatus) {
    setDraftStatus(s);
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Cases</div>
          <h1 className="text-xl font-bold tracking-tight">Cases</h1>
          <p className="text-xs text-white/50 mt-0.5">
            Track and manage every matter in flight.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-0.5 bg-white/5 rounded-lg p-1 text-xs border border-white/10">
            <ViewBtn active={view === "table"} onClick={() => setView("table")} icon={Rows3} label="Table" />
            <ViewBtn active={view === "cards"} onClick={() => setView("cards")} icon={LayoutGrid} label="Cards" />
            <ViewBtn active={view === "board"} onClick={() => setView("board")} icon={FolderKanban} label="Board" />
          </div>
          {view !== "board" && canCreateCase && (
            <Button onClick={() => openNewCase()}>
              <Plus size={14} />
              New case
            </Button>
          )}
        </div>
      </div>

      {view === "board" ? (
        <CasesBoard />
      ) : (
        <>
          {/* Slim filter bar */}
          <FilterBar
            search={search}
            setSearch={setSearch}
            status={status}
            setStatus={setStatus}
            priority={priority}
            setPriority={setPriority}
            assignee={assignee}
            setAssignee={setAssignee}
            team={team.data ?? []}
          />

          {view === "table" ? (
            <div className="glass-panel overflow-hidden text-[13px]">
              {cases.data && cases.data.length === 0 ? (
                <EmptyState
                  icon={FolderKanban}
                  title="No cases found"
                  description="Try clearing your filters, or create a new case to get started."
                  cta={
                    canCreateCase ? (
                      <Button onClick={() => openNewCase()}>
                        <Plus size={14} />
                        New case
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
                      <SortableTh column="caseNumber" sort={sort} onSort={onSort} className="px-4" />
                      <th className="px-3 py-2.5 font-medium">Title</th>
                      <th className="px-3 py-2.5 font-medium">Customer</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 font-medium">Priority</th>
                      <SortableTh column="createdAt" sort={sort} onSort={onSort} className="px-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortCases(cases.data ?? [], sort).map((c) => (
                      <Fragment key={c.id}>
                        <tr
                          onClick={() => navigate(`/cases/${c.id}`)}
                          className="border-b border-white/5 hover:bg-white/[0.03] transition-colors cursor-pointer group"
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-white/50">{c.caseNumber}</td>
                          <td className="px-3 py-2.5 font-medium">{c.title}</td>
                          <td className="px-3 py-2.5 text-white/70">{c.customer?.name ?? "—"}</td>
                          <td className="px-3 py-2.5">
                            <StatusBadge status={c.status} />
                          </td>
                          <td className="px-3 py-2.5">
                            <PriorityBadge priority={c.priority} />
                          </td>
                          <td className="px-4 py-2.5 text-white/50 text-xs">{formatDate(c.createdAt)}</td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            // Cards view
            <CardsView
              cases={cases.data ?? []}
              onNew={() => openNewCase()}
            />
          )}
        </>
      )}

      <NewCaseDrawer
        open={open}
        onClose={() => {
          setOpen(false);
          setDraftStatus(undefined);
        }}
        initialStatus={draftStatus}
      />
    </div>
  );
}

/**
 * A clickable, sortable table header. Cycles ascending → descending → default
 * (Last Modified) via lib/caseSort. Shows an up/down arrow in the primary
 * colour only while this column is the active sort.
 */
function SortableTh({
  column,
  sort,
  onSort,
  className,
}: {
  column: CaseSortColumn;
  sort: CaseSort;
  onSort: (column: CaseSortColumn) => void;
  className?: string;
}) {
  const direction = caseSortDirection(sort, column);
  const label = CASE_SORT_LABELS[column];
  const next = nextCaseSort(sort, column);
  const title = `Sorted by: ${describeCaseSort(sort)}. Click to sort by ${describeCaseSort(next)}.`;
  return (
    <th
      className={cn("py-2.5 font-medium", className)}
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        title={title}
        data-testid={`sort-${column}`}
        className={cn(
          "group/sort inline-flex items-center gap-1 uppercase tracking-widest font-medium cursor-pointer select-none rounded transition-colors",
          "hover:text-white/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-primary)]/60",
          direction && "text-[var(--color-primary)] hover:text-[var(--color-primary)]",
        )}
      >
        {label}
        {direction === "asc" ? (
          <ArrowUp size={11} strokeWidth={2.5} aria-hidden />
        ) : direction === "desc" ? (
          <ArrowDown size={11} strokeWidth={2.5} aria-hidden />
        ) : (
          // Affordance only (hover/focus), not a sort indicator.
          <ChevronsUpDown
            size={11}
            aria-hidden
            className="opacity-0 group-hover/sort:opacity-60 group-focus-visible/sort:opacity-60 transition-opacity"
          />
        )}
      </button>
    </th>
  );
}

function ViewBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-md transition inline-flex items-center gap-1.5",
        active
          ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] font-semibold"
          : "text-white/60 hover:text-white",
      )}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}

// ── Slim filter bar ─────────────────────────────────────────────────────────
function FilterBar({
  search,
  setSearch,
  status,
  setStatus,
  priority,
  setPriority,
  assignee,
  setAssignee,
  team,
}: {
  search: string;
  setSearch: (v: string) => void;
  status: CaseStatus | "";
  setStatus: (v: CaseStatus | "") => void;
  priority: CasePriority | "";
  setPriority: (v: CasePriority | "") => void;
  assignee: string;
  setAssignee: (v: string) => void;
  team: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const activeCount = (status ? 1 : 0) + (priority ? 1 : 0);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Queue dropdown — top-level filter by assignee */}
      <Select
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
        className="!h-8 !text-xs !w-auto !pr-9"
      >
        <option value="">All queues</option>
        {team.map((name) => (
          <option key={name} value={name}>
            {name}'s queue
          </option>
        ))}
      </Select>

      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cases…"
          className="!h-8 !text-xs pl-8"
        />
      </div>

      {/* Filters button + popover */}
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs transition",
            activeCount > 0
              ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
              : "border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10",
          )}
        >
          <SlidersHorizontal size={12} />
          Filters
          {activeCount > 0 && (
            <span className="ml-0.5 text-[10px] tabular-nums bg-[var(--color-primary)]/20 px-1.5 rounded-full">
              {activeCount}
            </span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1.5 w-64 glass-panel border border-white/10 rounded-lg p-3 z-20 shadow-xl space-y-2.5">
            <div>
              <Label>Status</Label>
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="!h-8 !text-xs"
              >
                <option value="">All statuses</option>
                <option value="intake">Open</option>
                <option value="in_progress">Working</option>
                <option value="review">Pending Customer</option>
                <option value="waiting">Waiting on 3rd Party</option>
                <option value="completed">Closed</option>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="!h-8 !text-xs"
              >
                <option value="">All priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </Select>
            </div>
            {activeCount > 0 && (
              <button
                onClick={() => {
                  setStatus("");
                  setPriority("");
                }}
                className="w-full text-[11px] text-white/50 hover:text-white inline-flex items-center justify-center gap-1 py-1 border border-white/10 rounded-md"
              >
                <XIcon size={10} />
                Clear all
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Cards view ──────────────────────────────────────────────────────────────
function CardsView({
  cases,
  onNew,
}: {
  cases: CaseWithCustomer[];
  onNew: () => void;
}) {
  const canCreateCase = can(useAuth().permissions, "cases.create");
  if (cases.length === 0) {
    return (
      <div className="glass-panel">
        <EmptyState
          icon={FolderKanban}
          title="No cases found"
          description="Try clearing your filters, or create a new case to get started."
          cta={
            canCreateCase ? (
              <Button onClick={onNew}>
                <Plus size={14} />
                New case
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {cases.map((c) => (
        <CaseCard key={c.id} caseItem={c} />
      ))}
    </div>
  );
}

function CaseCard({ caseItem }: { caseItem: CaseWithCustomer }) {
  return (
    <Link href={`/cases/${caseItem.id}`}>
      <a className="glass-panel p-3.5 flex flex-col gap-3 hover:border-[var(--color-primary)]/30 hover:-translate-y-0.5 transition-all">
        <div className="flex items-start justify-between gap-2">
          <div className="size-9 rounded-lg bg-white/5 border border-white/10 grid place-items-center text-white/40">
            <Folder size={16} />
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge
              status={caseItem.status}
              className="!text-[10px] !px-2 !py-0.5 uppercase tracking-wider"
            />
            <PriorityBadge
              priority={caseItem.priority}
              className="!text-[10px] !px-2 !py-0.5 uppercase tracking-wider"
            />
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-wider text-white/40 uppercase">
            {caseItem.caseNumber}
          </div>
          <div className="text-base font-bold text-white mt-1 leading-tight">
            {caseItem.title}
          </div>
          <div className="text-xs text-white/50 mt-1">
            {caseItem.customer?.name ?? "—"}
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] text-white/40 pt-2 border-t border-white/5">
          <span>Updated {formatDate(caseItem.updatedAt, { month: "short", day: "numeric", year: "numeric" })}</span>
          <span
            onClick={(e) => e.preventDefault()}
            className="p-1 rounded-md hover:text-white hover:bg-white/5 inline-flex"
            title="More"
          >
            <MoreVertical size={13} />
          </span>
        </div>
      </a>
    </Link>
  );
}

