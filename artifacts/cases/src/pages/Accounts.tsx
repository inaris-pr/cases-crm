import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Building2, Search, Users, FolderKanban } from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type { AccountWithCounts } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { can } from "@cases/access";
import { useAuth } from "@/lib/auth";

export function Accounts() {
  // Case counts only for employees who can view cases (RBAC Phase 5).
  const showCases = can(useAuth().permissions, "cases.view");
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string>("");

  const accountsQuery = useQuery({
    queryKey: ["accounts", { search, ownerFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (ownerFilter) params.set("owner", ownerFilter);
      const qs = params.toString();
      return fetchJson<AccountWithCounts[]>(API(`/api/accounts${qs ? `?${qs}` : ""}`));
    },
  });

  const teamQuery = useQuery({
    queryKey: ["team"],
    queryFn: () => fetchJson<string[]>(API("/api/team")),
  });

  const rows = accountsQuery.data ?? [];
  const totals = useMemo(
    () => ({
      total: rows.length,
      open: rows.reduce((s, r) => s + (r.openCaseCount ?? 0), 0),
      contacts: rows.reduce((s, r) => s + r.contactCount, 0),
    }),
    [rows],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Accounts</div>
          <h1 className="text-xl font-bold tracking-tight">Companies & entities</h1>
        </div>
        <div className="flex items-center gap-2">
          <Stat label="Accounts" value={totals.total} />
          <Stat label="Contacts" value={totals.contacts} />
          {showCases && <Stat label="Open cases" value={totals.open} />}
        </div>
      </div>

      <div className="glass-panel p-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, state, or industry…"
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
      </div>

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
              <th className="px-4 py-2.5">Account</th>
              <th className="px-3 py-2.5">State</th>
              <th className="px-3 py-2.5">Entity</th>
              <th className="px-3 py-2.5">Industry</th>
              <th className="px-3 py-2.5">Owner</th>
              <th className="px-3 py-2.5 text-right">Contacts</th>
              {showCases && <th className="px-3 py-2.5 text-right">Cases</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !accountsQuery.isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-white/40">
                  No accounts match those filters.
                </td>
              </tr>
            ) : null}
            {rows.map((a) => (
              <tr
                key={a.id}
                onClick={() => navigate(`/accounts/${a.id}`)}
                className="border-b border-white/5 hover:bg-white/[0.025] cursor-pointer transition-colors"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-md bg-[var(--color-primary)]/10 grid place-items-center text-[var(--color-primary)] shrink-0">
                      <Building2 size={14} />
                    </div>
                    <div className="font-medium text-white">{a.name}</div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-xs font-mono text-white/55">{a.state ?? "—"}</td>
                <td className="px-3 py-2.5 text-xs text-white/65">{a.entityType ?? "—"}</td>
                <td className="px-3 py-2.5 text-xs text-white/55">{a.industry ?? "—"}</td>
                <td className="px-3 py-2.5 text-xs text-white/65">{a.ownerName}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className="inline-flex items-center gap-1 text-xs text-white/65">
                    <Users size={11} />
                    {a.contactCount}
                  </span>
                </td>
                {showCases && (<td className="px-3 py-2.5 text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs",
                      a.openCaseCount > 0 ? "text-[var(--color-primary)]" : "text-white/40",
                    )}
                  >
                    <FolderKanban size={11} />
                    {a.openCaseCount} / {a.caseCount}
                  </span>
                </td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-soft px-3 py-1.5 flex flex-col items-end">
      <div className="text-[9px] uppercase tracking-widest text-white/40">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
