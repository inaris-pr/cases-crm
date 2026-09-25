import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Minus,
  Move,
  ExternalLink,
  Inbox,
  ClipboardCheck,
  Zap,
  PauseCircle,
  CheckCircle2,
  Briefcase,
  Mail,
  Search,
  Circle,
  Clock,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type {
  Case,
  CaseCategory,
  CaseStatus,
  CaseWithCustomer,
  CustomerWithCounts,
} from "@/lib/api";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { PriorityBadge } from "@/components/ui/Badge";
import { CategoryChip, EscalationMarker } from "@/components/cases/CaseLifecycle";
import { CASE_CATEGORY_OPTIONS } from "@/lib/caseMeta";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CaseDetailModal } from "@/components/CaseDetailModal";
import { can } from "@cases/access";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { initials, colorFromString } from "@/lib/format";
import { accountCardLinks } from "@/lib/caseLinks";

// ── Geometry ────────────────────────────────────────────────────────────────
const CLIENT_W = 340;
const CLIENT_H = 240;
const CASE_W = 280;
const CASE_H = 120;
const CASE_GAP = 32;
const COL_GAP = 200;
const ADD_BTN_SIZE = 56;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;
const DEFAULT_ZOOM = 0.62;

const STATUS_META: Record<
  CaseStatus,
  { label: string; icon: any; color: string }
> = {
  intake: { label: "Intake", icon: Inbox, color: "#3b82f6" },
  review: { label: "Review", icon: ClipboardCheck, color: "#a855f7" },
  in_progress: { label: "Working", icon: Zap, color: "#29f312" },
  waiting: { label: "Waiting", icon: PauseCircle, color: "#f59e0b" },
  completed: { label: "Closed", icon: CheckCircle2, color: "#ef4444" },
};

interface Pos {
  x: number;
  y: number;
}

export function CasesBoard() {
  const qc = useQueryClient();
  const canCreateCase = can(useAuth().permissions, "cases.create");
  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => fetchJson<CustomerWithCounts[]>(API("/api/customers")),
  });
  const casesQuery = useQuery({
    queryKey: ["cases"],
    queryFn: () => fetchJson<CaseWithCustomer[]>(API("/api/cases")),
  });

  const customers = customersQuery.data ?? [];
  const cases = casesQuery.data ?? [];

  // Selected customer
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  useEffect(() => {
    if (selectedCustomerId == null && customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  const customer = customers.find((c) => c.id === selectedCustomerId) ?? null;
  const customerCases = useMemo(
    () => cases.filter((c) => c.customerId === selectedCustomerId),
    [cases, selectedCustomerId],
  );

  // Positions
  const [clientPos, setClientPos] = useState<Pos>({ x: 120, y: 200 });
  const [casePositions, setCasePositions] = useState<Record<number, Pos>>({});
  useEffect(() => {
    if (!selectedCustomerId) return;
    const next: Record<number, Pos> = {};
    const startX = clientPos.x + CLIENT_W + COL_GAP;
    const totalH =
      customerCases.length * CASE_H + Math.max(0, customerCases.length - 1) * CASE_GAP;
    const startY = clientPos.y + CLIENT_H / 2 - totalH / 2;
    customerCases.forEach((c, i) => {
      next[c.id] = { x: startX, y: startY + i * (CASE_H + CASE_GAP) };
    });
    setCasePositions(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerId, customerCases.length]);

  // Selection / pan / zoom / drag
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [drag, setDrag] = useState<
    null | { kind: "client" | "case"; id: number; offX: number; offY: number }
  >(null);
  const [panStart, setPanStart] = useState<
    null | { mouseX: number; mouseY: number; panX: number; panY: number }
  >(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Modals
  const [searchOpen, setSearchOpen] = useState(false);
  const [newCaseOpen, setNewCaseOpen] = useState(false);

  function screenToCanvas(sx: number, sy: number) {
    return { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom };
  }

  function onCanvasMouseDown(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.dataset.canvasBg === "1") {
      setSelectedCaseId(null);
      setPanStart({ mouseX: e.clientX, mouseY: e.clientY, panX: pan.x, panY: pan.y });
    }
  }
  function onMouseMove(e: React.MouseEvent) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (panStart) {
      setPan({
        x: panStart.panX + (e.clientX - panStart.mouseX),
        y: panStart.panY + (e.clientY - panStart.mouseY),
      });
      return;
    }
    if (drag) {
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const p = screenToCanvas(sx, sy);
      if (drag.kind === "client") {
        setClientPos({ x: p.x - drag.offX, y: p.y - drag.offY });
      } else {
        setCasePositions((prev) => ({
          ...prev,
          [drag.id]: { x: p.x - drag.offX, y: p.y - drag.offY },
        }));
      }
    }
  }

  function zoomAt(sx: number, sy: number, factor: number) {
    const newZoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (newZoom === zoom) return;
    const cx = (sx - pan.x) / zoom;
    const cy = (sy - pan.y) / zoom;
    setPan({ x: sx - cx * newZoom, y: sy - cy * newZoom });
    setZoom(newZoom);
  }
  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    zoomAt(sx, sy, e.deltaY < 0 ? 1.1 : 1 / 1.1);
  }
  function resetView() {
    setPan({ x: 0, y: 0 });
    setZoom(DEFAULT_ZOOM);
  }
  function zoomButton(f: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    const sx = rect ? rect.width / 2 : 400;
    const sy = rect ? rect.height / 2 : 300;
    zoomAt(sx, sy, f);
  }

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of customerCases) for (const t of c.tags) set.add(t);
    return Array.from(set);
  }, [customerCases]);

  // Sit the green + on the middle of the right border of the client card,
  // slightly overlapping the edge so it reads as attached to the card.
  const addBtnPos = {
    x: clientPos.x + CLIENT_W - ADD_BTN_SIZE / 2,
    y: clientPos.y + CLIENT_H / 2 - ADD_BTN_SIZE / 2,
  };

  return (
    // The board fills the viewport below the page chrome. It now sits under the
    // Records tab strip too (2.25rem) plus its 1rem gap, so the offset grows
    // from 12rem by exactly 3.25rem to keep the board fitting as it did before.
    <div className="flex flex-col h-[calc(100vh-15.25rem)] overflow-hidden">
      {/* Canvas */}
      <div
        ref={canvasRef}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={() => {
          setDrag(null);
          setPanStart(null);
        }}
        onMouseLeave={() => {
          setDrag(null);
          setPanStart(null);
        }}
        onWheel={onWheel}
        className={cn(
          "glass-panel dot-grid relative overflow-hidden select-none flex-1 min-h-0",
          panStart ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <div data-canvas-bg="1" className="absolute inset-0" aria-hidden />

        {/* Floating client search pill (top-left) */}
        <button
          onClick={() => setSearchOpen(true)}
          className="absolute top-3 left-3 z-20 inline-flex items-center gap-2 h-10 pl-3 pr-4 rounded-full glass-panel border border-white/10 text-sm text-white/80 hover:border-[var(--color-primary)]/40 hover:text-white transition-colors shadow-lg"
          title="Search clients"
        >
          <Search size={14} className="text-[var(--color-primary)]" />
          {customer ? (
            <>
              <span className="text-white/40 text-xs">Client</span>
              <span className="font-semibold">{customer.name}</span>
            </>
          ) : (
            <span>Search clients</span>
          )}
        </button>

        {/* Transformed content */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: panStart ? "none" : "transform 0.05s linear",
          }}
        >
          {/* Edges */}
          <svg
            className="absolute"
            style={{ left: 0, top: 0, width: 6000, height: 4000, overflow: "visible" }}
          >
            <defs>
              <marker
                id="arrow-green"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#29f312" />
              </marker>
            </defs>
            {customer &&
              customerCases.map((c) => {
                const pos = casePositions[c.id];
                if (!pos) return null;
                const x1 = clientPos.x + CLIENT_W;
                const y1 = clientPos.y + CLIENT_H / 2;
                const x2 = pos.x;
                const y2 = pos.y + CASE_H / 2;
                return (
                  <path
                    key={c.id}
                    d={bezier(x1, y1, x2, y2)}
                    fill="none"
                    stroke="#29f312"
                    strokeWidth={2}
                    strokeOpacity={0.6}
                    markerEnd="url(#arrow-green)"
                    style={{ filter: "drop-shadow(0 0 4px rgba(41,243,18,0.35))" }}
                  />
                );
              })}
          </svg>

          {/* Client card */}
          {customer && (
            <ClientCard
              customer={customer}
              pos={clientPos}
              caseCount={customerCases.length}
              tags={allTags}
              onMouseDown={(e) => {
                e.stopPropagation();
                const rect = canvasRef.current?.getBoundingClientRect();
                if (!rect) return;
                const sx = e.clientX - rect.left;
                const sy = e.clientY - rect.top;
                const p = screenToCanvas(sx, sy);
                setDrag({
                  kind: "client",
                  id: customer.id,
                  offX: p.x - clientPos.x,
                  offY: p.y - clientPos.y,
                });
              }}
            />
          )}

          {/* Floating + button next to the client (needs cases.create) */}
          {customer && canCreateCase && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setNewCaseOpen(true);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                left: addBtnPos.x,
                top: addBtnPos.y,
                width: ADD_BTN_SIZE,
                height: ADD_BTN_SIZE,
                pointerEvents: "auto",
                boxShadow:
                  "0 0 30px rgba(41,243,18,0.5), 0 6px 18px rgba(0,0,0,0.4)",
              }}
              className="rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)] grid place-items-center hover:brightness-110 active:scale-95 transition-all group"
              title={`New case for ${customer.name}`}
              data-testid="board-new-case"
            >
              <Plus size={26} strokeWidth={2.5} />
              <span
                className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-[var(--color-primary)] bg-black/60 backdrop-blur px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity"
              >
                New case
              </span>
            </button>
          )}

          {/* Case nodes */}
          {customer &&
            customerCases.map((c) => {
              const pos = casePositions[c.id];
              if (!pos) return null;
              const meta = STATUS_META[c.status];
              const Icon = meta.icon;
              const isSelected = selectedCaseId === c.id;
              return (
                <div
                  key={c.id}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const rect = canvasRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    const sx = e.clientX - rect.left;
                    const sy = e.clientY - rect.top;
                    const p = screenToCanvas(sx, sy);
                    setDrag({
                      kind: "case",
                      id: c.id,
                      offX: p.x - pos.x,
                      offY: p.y - pos.y,
                    });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCaseId(c.id);
                  }}
                  style={{
                    left: pos.x,
                    top: pos.y,
                    width: CASE_W,
                    height: CASE_H,
                    pointerEvents: "auto",
                    borderColor: isSelected ? meta.color : "rgba(255,255,255,0.08)",
                    boxShadow: isSelected
                      ? `0 0 24px ${meta.color}66, 0 12px 30px rgba(0,0,0,0.4)`
                      : "0 8px 24px rgba(0,0,0,0.35)",
                  }}
                  className="absolute rounded-2xl glass-panel border-2 select-none cursor-grab active:cursor-grabbing overflow-hidden"
                >
                  <div
                    className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full"
                    style={{ background: meta.color, boxShadow: `0 0 8px ${meta.color}` }}
                  />
                  <div className="pl-4 pr-3.5 py-3 flex items-start gap-3">
                    <div
                      className="size-10 rounded-xl grid place-items-center shrink-0"
                      style={{ background: `${meta.color}15`, color: meta.color }}
                    >
                      <Briefcase size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-bold text-white truncate">
                        {c.title}
                      </div>
                      <div className="text-xs text-white/40 truncate mt-0.5">
                        {c.caseNumber}
                        {c.description ? ` · ${c.description}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="absolute left-4 bottom-2.5 right-3 flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1 text-[11px] font-semibold"
                      style={{ color: meta.color }}
                    >
                      <Icon size={12} />
                      {meta.label}
                    </span>
                    <EscalationMarker escalation={c.activeEscalation} />
                    <CategoryChip category={c.category} className="min-w-0 max-w-[120px]" />
                    <PriorityBadge
                      priority={c.priority}
                      className="ml-auto !text-[10px] !px-1.5 !py-0.5"
                    />
                  </div>
                </div>
              );
            })}

        </div>

        {/* Empty states */}
        {customers.length === 0 && !customersQuery.isLoading && (
          <div className="absolute inset-0 grid place-items-center text-white/30 text-sm pointer-events-none">
            Add a customer first to start building cases.
          </div>
        )}

        {/* Zoom controls */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-black/40 backdrop-blur rounded-lg p-1 border border-white/5">
          <button
            onClick={() => zoomButton(1 / 1.2)}
            className="size-7 grid place-items-center rounded-md text-white/70 hover:bg-white/10"
            title="Zoom out"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={resetView}
            className="px-2 h-7 text-[10px] uppercase tracking-widest text-white/60 hover:text-white tabular-nums min-w-[3.5rem]"
            title="Reset view"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => zoomButton(1.2)}
            className="size-7 grid place-items-center rounded-md text-white/70 hover:bg-white/10"
            title="Zoom in"
          >
            <Plus size={13} />
          </button>
          <button
            onClick={resetView}
            className="size-7 grid place-items-center rounded-md text-white/70 hover:bg-white/10 ml-1 border-l border-white/10 pl-1.5"
            title="Reset pan"
          >
            <Move size={12} />
          </button>
        </div>

        {(pan.x !== 0 || pan.y !== 0 || zoom !== DEFAULT_ZOOM) && (
          <div className="absolute bottom-3 right-3 text-[10px] uppercase tracking-widest text-white/30 bg-black/40 px-2 py-1 rounded-md backdrop-blur">
            {Math.round(zoom * 100)}%
          </div>
        )}
      </div>

      {/* Client search modal */}
      <ClientSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        customers={customers}
        cases={cases}
        selectedId={selectedCustomerId}
        onSelect={(id) => {
          setSelectedCustomerId(id);
          setSearchOpen(false);
          setSelectedCaseId(null);
          resetView();
        }}
      />

      {/* New case modal */}
      {customer && (
        <NewCaseModalForClient
          open={newCaseOpen}
          onClose={() => setNewCaseOpen(false)}
          customer={customer}
        />
      )}

      {/* Case detail modal */}
      <CaseDetailModal
        caseId={selectedCaseId}
        onClose={() => setSelectedCaseId(null)}
      />
    </div>
  );
}

// ── Client search modal ─────────────────────────────────────────────────────
function ClientSearchModal({
  open,
  onClose,
  customers,
  cases,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  customers: CustomerWithCounts[];
  cases: CaseWithCustomer[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        (c.company ?? "").toLowerCase().includes(needle) ||
        (c.email ?? "").toLowerCase().includes(needle),
    );
  }, [q, customers]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Find a client"
      description="Pick a client to load their cases onto the canvas."
      widthClass="max-w-lg"
    >
      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, company, or email…"
            className="pl-9"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1 space-y-1">
          {filtered.length === 0 ? (
            <div className="text-sm text-white/40 text-center py-8">No clients match.</div>
          ) : (
            filtered.map((c) => {
              const accent = colorFromString(c.name);
              const open = cases.filter(
                (x) => x.customerId === c.id && x.status !== "completed",
              ).length;
              const isSelected = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                    isSelected
                      ? "bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30"
                      : "hover:bg-white/5 border border-transparent",
                  )}
                >
                  <div
                    className="size-10 rounded-xl grid place-items-center font-bold text-sm shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${accent}40, ${accent}10)`,
                      color: accent,
                      boxShadow: `0 0 12px ${accent}30`,
                    }}
                  >
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-white truncate">{c.name}</div>
                    <div className="text-xs text-white/40 truncate">
                      {c.company ?? c.email}
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-white/80 font-semibold tabular-nums">
                      {c.caseCount}
                    </div>
                    <div className="text-white/40">{open} open</div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}

// ── Client card ──────────────────────────────────────────────────────────────
function ClientCard({
  customer,
  pos,
  caseCount,
  tags,
  onMouseDown,
}: {
  customer: CustomerWithCounts;
  pos: Pos;
  caseCount: number;
  tags: string[];
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const accent = colorFromString(customer.name);
  // This card is an ACCOUNT (a /api/customers row): `customer.id` is the
  // Account id. The name shown is the account's primary Contact, linked by
  // that Contact's own id.
  const links = accountCardLinks(customer);
  // Links sit on a draggable card: keep a press on them from starting a drag.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: CLIENT_W,
        height: CLIENT_H,
        pointerEvents: "auto",
        boxShadow: `0 16px 48px rgba(0,0,0,0.45), 0 0 40px ${accent}20`,
      }}
      className="rounded-2xl glass-panel border border-white/10 overflow-hidden cursor-grab active:cursor-grabbing select-none"
    >
      <div
        className="h-1.5"
        style={{ background: `linear-gradient(90deg, #3b82f6, #a855f7, #29f312)` }}
      />
      <div className="p-4 flex items-start gap-3">
        <div
          className="size-12 rounded-2xl grid place-items-center font-bold text-base"
          style={{
            background: `linear-gradient(135deg, ${accent}40, ${accent}10)`,
            color: accent,
            boxShadow: `0 0 16px ${accent}30`,
          }}
        >
          {initials(customer.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="label-eyebrow mb-1">Client profile</div>
          <div className="text-xl font-bold text-white truncate leading-tight">
            {links.client ? (
              <Link href={links.client.href}>
                <a
                  onMouseDown={stop}
                  onClick={stop}
                  title="Open client"
                  className="hover:underline cursor-pointer"
                >
                  {links.client.label}
                </a>
              </Link>
            ) : (
              customer.name
            )}
          </div>
          <div className="text-xs text-white/40 truncate mt-0.5">
            <Link href={links.account.href}>
              <a
                onMouseDown={stop}
                onClick={stop}
                title="Open account"
                className="hover:text-white/80 hover:underline cursor-pointer"
              >
                {links.account.label}
              </a>
            </Link>
          </div>
        </div>
        <Link href={links.account.href}>
          <a
            onMouseDown={stop}
            onClick={stop}
            title="Open full portfolio"
            className="text-white/30 hover:text-white p-1 rounded-md hover:bg-white/5 shrink-0"
          >
            <ExternalLink size={14} />
          </a>
        </Link>
      </div>
      <div className="px-4 -mt-1 mb-3 flex items-baseline gap-2">
        <span className="text-lg font-bold tabular-nums" style={{ color: accent }}>
          {caseCount}
        </span>
        <span className="text-xs text-white/50">
          active case{caseCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="px-4 pb-4 flex flex-wrap gap-1.5">
        {tags.slice(0, 4).map((t) => (
          <span
            key={t}
            className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-white/70 border border-white/10 capitalize"
          >
            {t.replace(/-/g, " ")}
          </span>
        ))}
        {customer.email && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-white/60 border border-white/10 inline-flex items-center gap-1">
            <Mail size={9} />
            {customer.email.split("@")[0]}
          </span>
        )}
      </div>
    </div>
  );
}

// ── New Case modal (centered, board-specific) ───────────────────────────────
const NEW_CASE_STATUS_OPTIONS: {
  value: CaseStatus;
  label: string;
  icon: any;
  color: string;
}[] = [
  { value: "intake", label: "Open", icon: Circle, color: "#3b82f6" },
  { value: "in_progress", label: "Working", icon: Clock, color: "#29f312" },
  { value: "review", label: "Pending Customer", icon: Clock, color: "#a855f7" },
  { value: "waiting", label: "Waiting on 3rd Party", icon: AlertCircle, color: "#f59e0b" },
  { value: "completed", label: "Closed", icon: XCircle, color: "#ef4444" },
];

function NewCaseModalForClient({
  open,
  onClose,
  customer,
}: {
  open: boolean;
  onClose: () => void;
  customer: CustomerWithCounts;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<CaseStatus>("intake");
  // Phase 7: optional primary category ("" = uncategorized), from the one
  // shared list in lib/caseMeta.ts.
  const [category, setCategory] = useState<CaseCategory | "">("");

  // Reset every time the modal opens.
  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setStatus("intake");
      setCategory("");
    }
  }, [open]);

  const create = useMutation({
    mutationFn: () =>
      fetchJson<Case>(API("/api/cases"), {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          status,
          customerId: customer.id,
          priority: "medium",
          tags: [],
          ...(category ? { category } : {}),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      onClose();
    },
  });

  const canSave = title.trim().length > 0 && !create.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Case"
      description={`Attach a case to ${customer.name}'s profile`}
      widthClass="max-w-lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) create.mutate();
        }}
        className="space-y-5"
      >
        <div>
          <Label>Case title *</Label>
          <Input
            data-testid="board-new-case-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. EIN Submission, Credit Dispute, Document Review…"
            autoFocus
            required
          />
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of what needs to be done…"
          />
        </div>
        <div>
          <Label>Status</Label>
          <div className="flex flex-wrap gap-2">
            {NEW_CASE_STATUS_OPTIONS.map((s) => {
              const Icon = s.icon;
              const selected = status === s.value;
              return (
                <button
                  type="button"
                  key={s.value}
                  onClick={() => setStatus(s.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border text-sm transition focus-ring",
                    selected
                      ? "border-[color:var(--pill-color)] text-[color:var(--pill-color)]"
                      : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10",
                  )}
                  style={
                    selected
                      ? ({
                          ["--pill-color" as any]: s.color,
                          background: `${s.color}1f`,
                          boxShadow: `0 0 16px ${s.color}30`,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  <Icon size={13} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <Label>Category (optional)</Label>
          <Select
            data-testid="board-new-case-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as CaseCategory | "")}
          >
            <option value="">Uncategorized</option>
            {CASE_CATEGORY_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSave} data-testid="board-new-case-save">
            {create.isPending ? "Saving…" : "Save case"}
          </Button>
        </div>
        {create.error && (
          <p className="text-xs text-red-400">
            {String(create.error.message ?? create.error)}
          </p>
        )}
      </form>
    </Modal>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.5, 60);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
