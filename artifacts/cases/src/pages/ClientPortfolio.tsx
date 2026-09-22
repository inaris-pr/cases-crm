import { Fragment } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, Mail, Phone, Building2 } from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type { Customer, Case, CaseWithCustomer } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";

interface CustomerWithCases extends Customer {
  cases: Case[];
}

export function ClientPortfolio() {
  const params = useParams();
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const customer = useQuery({
    queryKey: ["customer", id],
    queryFn: () => fetchJson<CustomerWithCases>(API(`/api/customers/${id}`)),
  });
  const allCases = useQuery({
    queryKey: ["cases"],
    queryFn: () => fetchJson<CaseWithCustomer[]>(API("/api/cases")),
  });

  if (customer.isLoading)
    return <div className="text-sm text-white/40 py-12 text-center">Loading…</div>;
  if (!customer.data)
    return <div className="text-sm text-white/40 py-12 text-center">Customer not found.</div>;

  const c = customer.data;
  const cases = (allCases.data ?? []).filter((x) => x.customerId === c.id);
  const open = cases.filter((c) => c.status !== "completed").length;
  const done = cases.filter((c) => c.status === "completed").length;

  // Average resolution time for completed cases
  const resolutions = cases
    .filter((c) => c.status === "completed")
    .map((c) => new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime());
  const avgDays = resolutions.length
    ? Math.round(resolutions.reduce((a, b) => a + b, 0) / resolutions.length / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="space-y-4">
      <Link href="/customers">
        <a className="text-[11px] text-white/40 hover:text-white">← All customers</a>
      </Link>

      <div className="glass-panel p-4 flex items-start gap-4 flex-wrap">
        <Avatar name={c.name} size={64} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold tracking-tight">{c.name}</h1>
          <div className="text-xs text-white/50 mt-0.5">{c.company ?? "—"}</div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-white/60">
            <span className="inline-flex items-center gap-1.5">
              <Mail size={12} />
              {c.email}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Phone size={12} />
              {c.phone ?? "—"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Building2 size={12} />
              {c.company ?? "—"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Total cases" value={cases.length} />
        <Stat label="Open" value={open} />
        <Stat label="Completed" value={done} />
        <Stat label="Avg resolution" value={`${avgDays}d`} />
      </div>

      <div className="glass-panel overflow-hidden">
        {cases.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No cases linked" description="This customer has no cases yet." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
                <th className="px-5 py-3 font-medium">Case #</th>
                <th className="px-3 py-3 font-medium">Title</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Priority</th>
                <th className="px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <Fragment key={c.id}>
                  <tr
                    onClick={() => navigate(`/cases/${c.id}`)}
                    className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-white/50">{c.caseNumber}</td>
                    <td className="px-3 py-3 font-medium">{c.title}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-3 py-3">
                      <PriorityBadge priority={c.priority} />
                    </td>
                    <td className="px-5 py-3 text-white/50 text-xs">{formatDate(c.createdAt)}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="glass-panel p-3">
      <div className="label-eyebrow">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}
