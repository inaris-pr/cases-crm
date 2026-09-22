import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  UserCircle2,
  Mail,
  Phone,
  Building2,
  FolderKanban,
  ChevronLeft,
  Star,
} from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type { ContactDetail as ContactDetailT } from "@/lib/api";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { formatDate } from "@/lib/format";

export function ContactDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const contactQuery = useQuery({
    queryKey: ["contact", id],
    queryFn: () => fetchJson<ContactDetailT>(API(`/api/contacts/${id}`)),
    enabled: Number.isFinite(id),
  });

  const c = contactQuery.data;

  if (contactQuery.isLoading) {
    return <div className="text-white/40 text-sm">Loading…</div>;
  }
  if (!c) {
    return <div className="text-white/40 text-sm">Contact not found.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-white/50">
        <Link href="/clients">
          <a className="inline-flex items-center gap-1 hover:text-white">
            <ChevronLeft size={12} />
            Clients
          </a>
        </Link>
        <span>·</span>
        <span className="text-white/30">Client</span>
      </div>

      <div className="glass-panel neon-border p-5">
        <div className="flex items-start gap-4">
          <Avatar name={c.fullName} size={48} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{c.fullName}</h1>
            {c.title && <div className="text-sm text-white/65 mt-0.5">{c.title}</div>}
            <div className="flex items-center gap-4 mt-3 flex-wrap text-xs text-white/65">
              {c.email && (
                <a
                  href={`mailto:${c.email}`}
                  className="inline-flex items-center gap-1.5 hover:text-[var(--color-primary)]"
                >
                  <Mail size={12} />
                  {c.email}
                </a>
              )}
              {c.phone && (
                <a
                  href={`tel:${c.phone}`}
                  className="inline-flex items-center gap-1.5 hover:text-[var(--color-primary)]"
                >
                  <Phone size={12} />
                  {c.phone}
                </a>
              )}
              <span>·</span>
              <span>Owned by {c.ownerName}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Linked accounts */}
        <div className="lg:col-span-2 glass-panel p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="label-eyebrow inline-flex items-center gap-1.5">
              <Building2 size={11} className="text-[var(--color-primary)]" />
              Linked accounts ({c.accounts.length})
            </div>
          </div>
          <div className="space-y-2">
            {c.accounts.length === 0 ? (
              <div className="text-xs text-white/40 py-4 text-center">
                Not linked to any account yet.
              </div>
            ) : (
              c.accounts.map((a) => (
                <Link key={a.id} href={`/accounts/${a.id}`}>
                  <a className="block p-3 rounded-md hover:bg-white/5 transition-colors border border-white/5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="size-8 rounded-md bg-[var(--color-primary)]/10 grid place-items-center text-[var(--color-primary)] shrink-0">
                          <Building2 size={14} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                            {a.link.isPrimary && (
                              <Star
                                size={11}
                                className="text-[var(--color-primary)] fill-current"
                              />
                            )}
                            {a.name}
                          </div>
                          <div className="text-[11px] text-white/50 mt-0.5">{a.link.role}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        {a.state && (
                          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-white/70">
                            {a.state}
                          </span>
                        )}
                        {a.entityType && (
                          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] text-white/70">
                            {a.entityType}
                          </span>
                        )}
                        {a.link.ownershipPct != null && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 text-[10px] text-[var(--color-primary)] font-mono">
                            {a.link.ownershipPct}%
                          </span>
                        )}
                      </div>
                    </div>
                  </a>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Activity summary */}
        <div className="glass-panel p-4">
          <div className="label-eyebrow mb-3">Details</div>
          <dl className="space-y-2.5 text-xs">
            <Field k="First name" v={c.firstName} />
            <Field k="Last name" v={c.lastName} />
            <Field k="Title" v={c.title ?? "—"} />
            <Field k="Email" v={c.email ?? "—"} />
            <Field k="Phone" v={c.phone ?? "—"} />
            <Field k="Owner" v={c.ownerName} />
            <Field k="Created" v={formatDate(c.createdAt)} />
          </dl>
        </div>
      </div>

      {/* All cases across linked accounts */}
      <div className="glass-panel p-0">
        <div className="px-4 py-3 border-b border-white/5">
          <div className="label-eyebrow inline-flex items-center gap-1.5">
            <FolderKanban size={11} className="text-[var(--color-primary)]" />
            Cases involving {c.firstName} ({c.cases.length})
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
              <th className="px-4 py-2.5">Case</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Priority</th>
              <th className="px-3 py-2.5">Owner</th>
              <th className="px-3 py-2.5">Updated</th>
            </tr>
          </thead>
          <tbody>
            {c.cases.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-white/40">
                  No cases yet.
                </td>
              </tr>
            ) : (
              c.cases.map((cs) => (
                <tr key={cs.id} className="border-b border-white/5 hover:bg-white/[0.025]">
                  <td className="px-4 py-3">
                    <Link href={`/cases/${cs.id}`}>
                      <a className="block">
                        <span className="font-mono text-[10px] text-white/40">
                          {cs.caseNumber}
                        </span>
                        <div className="text-sm text-white hover:text-[var(--color-primary)] truncate">
                          {cs.title}
                        </div>
                      </a>
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={cs.status} />
                  </td>
                  <td className="px-3 py-3">
                    <PriorityBadge priority={cs.priority} />
                  </td>
                  <td className="px-3 py-3 text-xs text-white/65">{cs.ownerName}</td>
                  <td className="px-3 py-3 text-xs text-white/50">{formatDate(cs.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-white/40 shrink-0">{k}</dt>
      <dd className="text-white text-right truncate">{v}</dd>
    </div>
  );
}
