import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Building2,
  Mail,
  Phone,
  Users as UsersIcon,
  Rows3,
  LayoutGrid,
  ArrowRight,
  X,
} from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type { ContactWithSummary, Contact } from "@/lib/api";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

type View = "list" | "cards";
const VIEW_STORAGE_KEY = "cases.clients.view";

export function Clients() {
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [view, setView] = useState<View>(() => {
    if (typeof window === "undefined") return "list";
    return (window.localStorage.getItem(VIEW_STORAGE_KEY) as View) || "list";
  });
  const [addOpen, setAddOpen] = useState(false);

  function setViewPersist(v: View) {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      /* noop */
    }
  }

  const clientsQuery = useQuery({
    queryKey: ["clients", { search, ownerFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (ownerFilter) params.set("owner", ownerFilter);
      const qs = params.toString();
      return fetchJson<ContactWithSummary[]>(
        API(`/api/contacts${qs ? `?${qs}` : ""}`),
      );
    },
  });

  const teamQuery = useQuery({
    queryKey: ["team"],
    queryFn: () => fetchJson<string[]>(API("/api/team")),
  });

  const rows = clientsQuery.data ?? [];

  const totals = useMemo(
    () => ({
      total: rows.length,
      withCompanies: rows.filter((r) => r.accountCount > 0).length,
      openCases: rows.reduce((s, r) => s + r.openCaseCount, 0),
    }),
    [rows],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Clients</div>
          <h1 className="text-xl font-bold tracking-tight">People you work with</h1>
          <p className="text-xs text-white/50 mt-0.5">
            Founders, managers, and stakeholders behind every account.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Stat label="Clients" value={totals.total} />
          <Stat label="With companies" value={totals.withCompanies} />
          <Stat label="Open cases" value={totals.openCases} />
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={14} />
            Add client
          </Button>
        </div>
      </div>

      <div className="glass-panel p-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or title…"
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
          <ViewBtn active={view === "list"} onClick={() => setViewPersist("list")}>
            <Rows3 size={13} />
            List
          </ViewBtn>
          <ViewBtn active={view === "cards"} onClick={() => setViewPersist("cards")}>
            <LayoutGrid size={13} />
            Cards
          </ViewBtn>
        </div>
      </div>

      {rows.length === 0 && !clientsQuery.isLoading ? (
        <div className="glass-panel">
          <EmptyState
            icon={UsersIcon}
            title="No clients yet"
            description="Add your first client to start opening cases."
            cta={
              <Button onClick={() => setAddOpen(true)}>
                <Plus size={16} />
                Add client
              </Button>
            }
          />
        </div>
      ) : view === "list" ? (
        <ListView rows={rows} />
      ) : (
        <CardsView rows={rows} />
      )}

      {addOpen && <AddClientModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function ListView({ rows }: { rows: ContactWithSummary[] }) {
  const [, navigate] = useLocation();
  return (
    <div className="glass-panel overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
            <th className="px-4 py-2.5">Name</th>
            <th className="px-3 py-2.5">Title</th>
            <th className="px-3 py-2.5">Email</th>
            <th className="px-3 py-2.5">Linked companies</th>
            <th className="px-3 py-2.5">Owner</th>
            <th className="px-3 py-2.5 text-right">Open cases</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr
              key={c.id}
              onClick={() => navigate(`/clients/${c.id}`)}
              className="border-b border-white/5 hover:bg-white/[0.025] cursor-pointer transition-colors"
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar name={c.fullName} size={32} />
                  <div>
                    <div className="font-medium text-white">{c.fullName}</div>
                    <div className="text-[10px] text-white/40">{c.ownerName}</div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 text-xs text-white/65">{c.title ?? "—"}</td>
              <td className="px-3 py-2.5 text-xs text-white/55">{c.email ?? "—"}</td>
              <td className="px-3 py-2.5">
                {c.accountCount === 0 ? (
                  <span className="text-xs text-white/30">None</span>
                ) : (
                  <div className="flex items-center gap-1 flex-wrap">
                    <Building2 size={11} className="text-white/40 shrink-0" />
                    {c.accountNames.slice(0, 2).map((name) => (
                      <span
                        key={name}
                        className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-white/70"
                      >
                        {name}
                      </span>
                    ))}
                    {c.accountNames.length > 2 && (
                      <span className="text-[10px] text-white/40">
                        +{c.accountNames.length - 2}
                      </span>
                    )}
                  </div>
                )}
              </td>
              <td className="px-3 py-2.5 text-xs text-white/65">{c.ownerName}</td>
              <td className="px-3 py-2.5 text-right">
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    c.openCaseCount > 0 ? "text-[var(--color-primary)]" : "text-white/40",
                  )}
                >
                  {c.openCaseCount}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardsView({ rows }: { rows: ContactWithSummary[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {rows.map((c) => (
        <Link key={c.id} href={`/clients/${c.id}`}>
          <a className="glass-panel p-4 block group hover:-translate-y-0.5 hover:border-[var(--color-primary)]/30 transition-all">
            <div className="flex items-start gap-3">
              <Avatar name={c.fullName} size={44} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-white truncate">{c.fullName}</div>
                <div className="text-xs text-white/45 truncate">{c.title ?? "—"}</div>
              </div>
              <span
                className={cn(
                  "shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums",
                  c.openCaseCount > 0
                    ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                    : "bg-white/5 text-white/40",
                )}
              >
                {c.openCaseCount} open
              </span>
            </div>

            <div className="mt-3 space-y-1.5 text-xs text-white/55">
              {c.email && (
                <div className="flex items-center gap-2 truncate">
                  <Mail size={11} className="shrink-0" />
                  <span className="truncate">{c.email}</span>
                </div>
              )}
              {c.phone && (
                <div className="flex items-center gap-2 truncate">
                  <Phone size={11} className="shrink-0" />
                  <span>{c.phone}</span>
                </div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-white/5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/40 mb-1.5">
                <Building2 size={10} />
                Companies ({c.accountCount})
              </div>
              {c.accountCount === 0 ? (
                <div className="text-[11px] text-white/30 italic">No linked companies</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {c.accountNames.slice(0, 3).map((name) => (
                    <span
                      key={name}
                      className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-white/75 truncate max-w-[18ch]"
                    >
                      {name}
                    </span>
                  ))}
                  {c.accountNames.length > 3 && (
                    <span className="px-1.5 py-0.5 text-[10px] text-white/40">
                      +{c.accountNames.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px]">
              <span className="text-white/40">Owner: {c.ownerName}</span>
              <span className="text-[var(--color-primary)] inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                Open
                <ArrowRight size={11} />
              </span>
            </div>
          </a>
        </Link>
      ))}
    </div>
  );
}

function AddClientModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");

  const create = useMutation({
    mutationFn: () =>
      fetchJson<Contact & { id: number }>(API("/api/contacts"), {
        method: "POST",
        body: JSON.stringify({
          firstName,
          lastName,
          email: email || undefined,
          phone: phone || undefined,
          title: title || undefined,
        }),
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      onClose();
      if (created?.id) navigate(`/clients/${created.id}`);
    },
  });

  const canSubmit = firstName.trim() && lastName.trim() && !create.isPending;

  return (
    <Modal open onClose={onClose}>
      <div className="space-y-4 max-w-md w-full">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="label-eyebrow mb-1">New client</div>
            <h2 className="text-lg font-bold tracking-tight">Add a client</h2>
            <p className="text-xs text-white/55 mt-1">
              Create the person record first. You can link them to a company (Account) after.
            </p>
          </div>
          <button
            onClick={onClose}
            className="size-7 grid place-items-center rounded-md text-white/40 hover:text-white hover:bg-white/5"
          >
            <X size={14} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) create.mutate();
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>First name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div>
              <Label>Last name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div>
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Founder, CFO, Outside Counsel…"
            />
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
          <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {create.isPending ? "Saving…" : "Save client"}
            </Button>
          </div>
        </form>
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

function ViewBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 h-8 text-xs rounded inline-flex items-center gap-1.5 transition-colors",
        active
          ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
          : "text-white/55 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
