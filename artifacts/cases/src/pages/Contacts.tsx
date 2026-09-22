import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { UserCircle2, Search, Building2 } from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type { ContactWithSummary } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";

export function Contacts() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");

  const contactsQuery = useQuery({
    queryKey: ["contacts", { search, ownerFilter }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (ownerFilter) params.set("owner", ownerFilter);
      const qs = params.toString();
      return fetchJson<ContactWithSummary[]>(API(`/api/contacts${qs ? `?${qs}` : ""}`));
    },
  });

  const teamQuery = useQuery({
    queryKey: ["team"],
    queryFn: () => fetchJson<string[]>(API("/api/team")),
  });

  const rows = contactsQuery.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Contacts</div>
          <h1 className="text-xl font-bold tracking-tight">People</h1>
        </div>
        <div className="text-xs text-white/55">{rows.length} contacts</div>
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
      </div>

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-3 py-2.5">Title</th>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Linked accounts</th>
              <th className="px-3 py-2.5 text-right">Open cases</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !contactsQuery.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-white/40">
                  No contacts match those filters.
                </td>
              </tr>
            ) : null}
            {rows.map((c) => (
              <tr
                key={c.id}
                onClick={() => navigate(`/contacts/${c.id}`)}
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
    </div>
  );
}
