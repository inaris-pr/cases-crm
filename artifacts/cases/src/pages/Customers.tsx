import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Users, Mail, Phone, ArrowRight } from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type { Customer, CustomerWithCounts } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";

export function Customers() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const customers = useQuery({
    queryKey: ["customers"],
    queryFn: () => fetchJson<CustomerWithCounts[]>(API("/api/customers")),
  });

  const filtered = useMemo(() => {
    const data = customers.data ?? [];
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.company ?? "").toLowerCase().includes(q),
    );
  }, [customers.data, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Customers</div>
          <h1 className="text-xl font-bold tracking-tight">Customers</h1>
          <p className="text-xs text-white/50 mt-0.5">All the people and organizations you work with.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={14} />
          Add customer
        </Button>
      </div>

      <div className="glass-panel p-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers…"
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel">
          <EmptyState
            icon={Users}
            title="No customers yet"
            description="Add your first customer to start opening cases."
            cta={
              <Button onClick={() => setOpen(true)}>
                <Plus size={16} />
                Add customer
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="glass-panel p-4 group hover:-translate-y-0.5 transition-all hover:border-[var(--color-primary)]/30"
            >
              <div className="flex items-start gap-3">
                <Avatar name={c.name} size={48} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="text-xs text-white/40 truncate">{c.company ?? "—"}</div>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-xs text-white/60">
                <div className="flex items-center gap-2 truncate">
                  <Mail size={12} />
                  {c.email}
                </div>
                <div className="flex items-center gap-2 truncate">
                  <Phone size={12} />
                  {c.phone ?? "—"}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-widest text-white/40">
                  {c.caseCount} case{c.caseCount === 1 ? "" : "s"}
                </span>
                <Link href={`/clients/${c.id}`}>
                  <a className="text-xs text-[var(--color-primary)] inline-flex items-center gap-1 hover:underline">
                    View portfolio
                    <ArrowRight size={12} />
                  </a>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddCustomerModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function AddCustomerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "" });
  const create = useMutation({
    mutationFn: () =>
      fetchJson<Customer>(API("/api/customers"), {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      setForm({ name: "", email: "", phone: "", company: "" });
      onClose();
    },
  });
  const canSubmit = form.name.trim() && form.email.trim() && !create.isPending;
  return (
    <Modal open={open} onClose={onClose} title="Add customer">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) create.mutate();
        }}
        className="space-y-4"
      >
        <div>
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <Label>Email</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>Company</Label>
            <Input
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {create.isPending ? "Adding…" : "Add"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
