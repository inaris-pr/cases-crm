import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Search, X, ArrowRight, DollarSign, Plus } from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type { Lead, LeadStatus, LeadSource } from "@/lib/api";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { createActions, leadControls } from "@cases/access";
import { useAccess } from "@/lib/useAccess";
import { ReassignControl } from "@/components/ReassignControl";

const STAGES: { id: LeadStatus; label: string; color: string }[] = [
  { id: "new", label: "New", color: "rgba(59,130,246,1)" },
  { id: "working", label: "Working", color: "rgba(168,85,247,1)" },
  { id: "qualified", label: "Qualified", color: "rgba(41,243,18,1)" },
  { id: "unqualified", label: "Unqualified", color: "rgba(100,116,139,1)" },
];

const SOURCE_LABEL: Record<LeadSource, string> = {
  referral: "Referral",
  website: "Website",
  event: "Event",
  cold_call: "Cold call",
  partner: "Partner",
  other: "Other",
};

export function Leads() {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [converting, setConverting] = useState<Lead | null>(null);
  const [creating, setCreating] = useState(false);
  const access = useAccess();
  const actions = createActions(access.permissions);

  const leadsQuery = useQuery({
    queryKey: ["leads", { search, ownerFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (ownerFilter) params.set("owner", ownerFilter);
      const qs = params.toString();
      return fetchJson<Lead[]>(API(`/api/leads${qs ? `?${qs}` : ""}`));
    },
  });

  const teamQuery = useQuery({
    queryKey: ["team"],
    queryFn: () => fetchJson<string[]>(API("/api/team")),
  });

  const leads = leadsQuery.data ?? [];

  const totals = useMemo(() => {
    const open = leads.filter((l) => l.status !== "converted" && l.status !== "unqualified");
    const value = open.reduce((s, l) => s + (l.estimatedValue ?? 0), 0);
    return { total: leads.length, open: open.length, value };
  }, [leads]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Leads</div>
          <h1 className="text-xl font-bold tracking-tight">Pipeline</h1>
        </div>
        <div className="flex items-center gap-2">
          <Stat label="Total" value={totals.total} />
          <Stat label="Open" value={totals.open} />
          <Stat label="Pipeline value" value={`$${totals.value.toLocaleString()}`} />
          {actions.newLead && (<Button onClick={() => setCreating(true)}>
            <Plus size={14} />
            New lead
          </Button>)}
        </div>
      </div>

      <div className="glass-panel p-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, company, or email…"
            className="pl-8"
          />
        </div>
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="bg-[var(--color-input)] border border-white/10 rounded-md px-2.5 h-9 text-sm focus-ring"
        >
          <option value="">All owners</option>
          {(teamQuery.data ?? []).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <div className="flex items-center bg-[var(--color-input)] border border-white/10 rounded-md p-0.5">
          {(["kanban", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-2.5 h-8 text-xs rounded transition-colors capitalize",
                view === v
                  ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                  : "text-white/55 hover:text-white",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "kanban" ? (
        <Kanban leads={leads} onConvert={setConverting} />
      ) : (
        <ListView leads={leads} onConvert={setConverting} />
      )}

      {converting && (
        <ConvertModal
          lead={converting}
          onClose={() => setConverting(null)}
        />
      )}
      {creating && <NewLeadModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function Kanban({ leads, onConvert }: { leads: Lead[]; onConvert: (l: Lead) => void }) {
  const qc = useQueryClient();
  const access = useAccess();
  const moveLead = useMutation({
    mutationFn: (vars: { id: number; status: LeadStatus }) =>
      fetchJson<Lead>(API(`/api/leads/${vars.id}`), {
        method: "PATCH",
        body: JSON.stringify({ status: vars.status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      {STAGES.map((stage) => {
        const items = leads.filter((l) => l.status === stage.id);
        return (
          <div
            key={stage.id}
            className="glass-panel p-3 min-h-[300px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = Number(e.dataTransfer.getData("text/plain"));
              const lead = leads.find((x) => x.id === id);
              // Moving a lead is an edit (leads.edit on that lead).
              if (lead && leadControls(access, lead).edit) moveLead.mutate({ id, status: stage.id });
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-white/70">
                  {stage.label}
                </h3>
              </div>
              <span className="text-[10px] text-white/40 tabular-nums">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.length === 0 && (
                <div className="text-[11px] text-white/30 text-center py-6">No leads</div>
              )}
              {items.map((l) => (
                <div
                  key={l.id}
                  data-testid="lead-card"
                  draggable={leadControls(access, l).edit}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(l.id));
                  }}
                  className={cn(
                    "bg-white/[0.03] border border-white/10 rounded-md p-2.5 hover:bg-white/[0.06] transition-colors",
                    leadControls(access, l).edit && "cursor-grab active:cursor-grabbing",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white truncate">
                        {l.firstName} {l.lastName}
                      </div>
                      {l.companyName && (
                        <div className="text-[11px] text-white/50 truncate">{l.companyName}</div>
                      )}
                    </div>
                    {l.estimatedValue != null && (
                      <span className="text-[10px] font-mono text-[var(--color-primary)] shrink-0">
                        ${l.estimatedValue.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap text-[10px] text-white/45">
                    {l.intendedState && (
                      <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                        {l.intendedState}
                      </span>
                    )}
                    {l.intendedEntityType && (
                      <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                        {l.intendedEntityType}
                      </span>
                    )}
                    <span className="ml-auto">{SOURCE_LABEL[l.source]}</span>
                  </div>
                  {l.notes && (
                    <p className="text-[11px] text-white/55 mt-2 line-clamp-2">{l.notes}</p>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                    <span className="text-[10px] text-white/40">
                      {l.ownerName.split(" ")[0]} · {formatRelative(l.updatedAt)}
                    </span>
                    {l.status === "qualified" && leadControls(access, l).convert && (
                      <button
                        onClick={() => onConvert(l)}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--color-primary)] hover:underline"
                      >
                        Convert <ArrowRight size={9} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({ leads, onConvert }: { leads: Lead[]; onConvert: (l: Lead) => void }) {
  const access = useAccess();
  return (
    <div className="glass-panel overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
            <th className="px-4 py-2.5">Lead</th>
            <th className="px-3 py-2.5">Company</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Source</th>
            <th className="px-3 py-2.5">Owner</th>
            <th className="px-3 py-2.5 text-right">Value</th>
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {leads.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-white/40">
                No leads yet.
              </td>
            </tr>
          ) : (
            leads.map((l) => (
              <tr key={l.id} className="border-b border-white/5 hover:bg-white/[0.025]">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">
                    {l.firstName} {l.lastName}
                  </div>
                  <div className="text-[11px] text-white/40">{l.email ?? "—"}</div>
                </td>
                <td className="px-3 py-3 text-xs text-white/65">{l.companyName ?? "—"}</td>
                <td className="px-3 py-3">
                  <StatusPill status={l.status} />
                </td>
                <td className="px-3 py-3 text-xs text-white/55">{SOURCE_LABEL[l.source]}</td>
                <td className="px-3 py-3 text-xs text-white/65">
                  <ReassignControl
                    type="leads"
                    recordId={l.id}
                    ownerName={l.ownerName}
                    ownerUserId={l.ownerUserId}
                    canReassign={leadControls(access, l).reassign}
                    invalidate={[["leads"]]}
                  />
                </td>
                <td className="px-3 py-3 text-right text-xs font-mono tabular-nums text-[var(--color-primary)]">
                  {l.estimatedValue != null ? `$${l.estimatedValue.toLocaleString()}` : "—"}
                </td>
                <td className="px-3 py-3 text-right">
                  {l.status === "qualified" && leadControls(access, l).convert && (
                    <button
                      onClick={() => onConvert(l)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
                    >
                      Convert <ArrowRight size={10} />
                    </button>
                  )}
                  {l.status === "converted" && (
                    <span className="text-[10px] text-white/40">Converted</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: LeadStatus }) {
  const meta: Record<LeadStatus, { label: string; cls: string }> = {
    new: { label: "New", cls: "bg-blue-500/15 text-blue-300" },
    working: { label: "Working", cls: "bg-purple-500/15 text-purple-300" },
    qualified: { label: "Qualified", cls: "bg-[var(--color-primary)]/15 text-[var(--color-primary)]" },
    unqualified: { label: "Unqualified", cls: "bg-white/5 text-white/40" },
    converted: { label: "Converted", cls: "bg-amber-500/15 text-amber-300" },
  };
  const m = meta[status];
  return (
    <span
      className={cn(
        m.cls,
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
      )}
    >
      {m.label}
    </span>
  );
}

function ConvertModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const qc = useQueryClient();
  // B4: the first Case is offered only to employees who may create cases.
  const withCase = leadControls(useAccess(), lead).convertWithCase;
  const [accountName, setAccountName] = useState(lead.companyName ?? "");
  const [accountState, setAccountState] = useState(lead.intendedState ?? "");
  const [accountEntityType, setAccountEntityType] = useState(lead.intendedEntityType ?? "");
  const [contactTitle, setContactTitle] = useState("Founder");
  const [linkRole, setLinkRole] = useState("Sole Member");
  const [ownershipPct, setOwnershipPct] = useState<string>("100");
  const [createInitialCase, setCreateInitialCase] = useState(withCase);
  const [initialCaseTitle, setInitialCaseTitle] = useState(
    lead.intendedState && lead.intendedEntityType
      ? `${lead.intendedState} ${lead.intendedEntityType} Formation — ${
          lead.companyName ?? `${lead.firstName} ${lead.lastName}`
        }`
      : "",
  );

  const convert = useMutation({
    mutationFn: () =>
      fetchJson(API(`/api/leads/${lead.id}/convert`), {
        method: "POST",
        body: JSON.stringify({
          accountName,
          accountState: accountState || undefined,
          accountEntityType: accountEntityType || undefined,
          contactTitle: contactTitle || undefined,
          linkRole,
          ownershipPct: ownershipPct ? Number(ownershipPct) : null,
          createInitialCase,
          initialCaseTitle: createInitialCase ? initialCaseTitle : undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose}>
      <div className="space-y-4 max-w-lg w-full">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="label-eyebrow mb-1">Convert lead</div>
            <h2 className="text-lg font-bold tracking-tight">
              {lead.firstName} {lead.lastName}
            </h2>
            <p className="text-xs text-white/55 mt-1">
              Creates an Account, a Contact, links them, and optionally opens the first case.
            </p>
          </div>
          <button
            onClick={onClose}
            className="size-7 grid place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/5"
          >
            <X size={14} />
          </button>
        </div>

        <section className="space-y-2">
          <div className="label-eyebrow">Account (company)</div>
          <div>
            <Label>Name</Label>
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>State</Label>
              <Input
                value={accountState}
                onChange={(e) => setAccountState(e.target.value)}
                placeholder="DE, CA, WY…"
              />
            </div>
            <div>
              <Label>Entity type</Label>
              <Input
                value={accountEntityType}
                onChange={(e) => setAccountEntityType(e.target.value)}
                placeholder="LLC, PLLC…"
              />
            </div>
          </div>
        </section>

        <section className="space-y-2">
          <div className="label-eyebrow">Contact (person) & link</div>
          <div className="text-xs text-white/55">
            Contact will be created as {lead.firstName} {lead.lastName}
            {lead.email ? ` (${lead.email})` : ""}.
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Title</Label>
              <Input value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} />
            </div>
            <div>
              <Label>Role on account</Label>
              <Input value={linkRole} onChange={(e) => setLinkRole(e.target.value)} />
            </div>
            <div>
              <Label>Ownership %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={ownershipPct}
                onChange={(e) => setOwnershipPct(e.target.value)}
              />
            </div>
          </div>
        </section>

        {withCase && <section className="space-y-2">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={createInitialCase}
              onChange={(e) => setCreateInitialCase(e.target.checked)}
              className="accent-[var(--color-primary)]"
            />
            <span>Open initial case</span>
          </label>
          {createInitialCase && (
            <div>
              <Label>Case title</Label>
              <Input
                value={initialCaseTitle}
                onChange={(e) => setInitialCaseTitle(e.target.value)}
                placeholder="DE LLC Formation — Acme Corp LLC"
              />
            </div>
          )}
        </section>}

        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
          <Button
            onClick={() => convert.mutate()}
            disabled={!accountName.trim() || !linkRole.trim() || convert.isPending}
          >
            {convert.isPending ? "Converting…" : "Convert lead"}
            <ArrowRight size={13} />
          </Button>
          <button
            onClick={onClose}
            className="px-3 h-9 rounded-md text-sm text-white/65 hover:text-white hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

function NewLeadModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [intendedState, setIntendedState] = useState("");
  const [intendedEntityType, setIntendedEntityType] = useState("LLC");
  const [source, setSource] = useState<LeadSource>("website");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: () =>
      fetchJson(API("/api/leads"), {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          email: email || undefined,
          phone: phone || undefined,
          companyName: companyName || undefined,
          intendedState: intendedState || undefined,
          intendedEntityType: intendedEntityType || undefined,
          source,
          estimatedValue: estimatedValue ? Number(estimatedValue) : undefined,
          notes: notes || undefined,
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose}>
      <div className="space-y-4 max-w-lg w-full">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="label-eyebrow mb-1">New lead</div>
            <h2 className="text-lg font-bold tracking-tight">Add prospect</h2>
          </div>
          <button
            onClick={onClose}
            className="size-7 grid place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/5"
          >
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>First name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label>Last name</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Company (tentative)</Label>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Intended state</Label>
            <Input
              value={intendedState}
              onChange={(e) => setIntendedState(e.target.value)}
              placeholder="DE, CA, WY…"
            />
          </div>
          <div>
            <Label>Intended entity</Label>
            <Input
              value={intendedEntityType}
              onChange={(e) => setIntendedEntityType(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Source</Label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as LeadSource)}
              className="w-full bg-[var(--color-input)] border border-white/10 rounded-md px-2.5 h-9 text-sm focus-ring"
            >
              {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Estimated value ($)</Label>
            <Input
              type="number"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full bg-[var(--color-input)] border border-white/10 rounded-md px-3 py-2 text-sm focus-ring"
          />
        </div>

        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
          <Button
            onClick={() => create.mutate()}
            disabled={!firstName.trim() || !lastName.trim() || create.isPending}
          >
            {create.isPending ? "Saving…" : "Save lead"}
          </Button>
          <button
            onClick={onClose}
            className="px-3 h-9 rounded-md text-sm text-white/65 hover:text-white hover:bg-white/5"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="glass-soft px-3 py-1.5 flex flex-col items-end">
      <div className="text-[9px] uppercase tracking-widest text-white/40">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
