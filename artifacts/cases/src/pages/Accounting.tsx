import { Fragment, useMemo, useState } from "react";
import {
  Wallet,
  Scale,
  BookOpen,
  TrendingUp,
  Banknote,
  UsersRound,
  Plus,
  Printer,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type Tab = "ledger" | "trial" | "balance" | "pl" | "cashflow" | "payroll";

interface LedgerEntry {
  id: number;
  date: string;
  description: string;
  account: string;
  debit: number;
  credit: number;
  category: string;
  caseNumber?: string;
  notes?: string;
}

const SEED_LEDGER: LedgerEntry[] = [
  {
    id: 1,
    date: "2026-04-01",
    description: "Helix Labs retainer",
    account: "Cash",
    debit: 15000,
    credit: 0,
    category: "Retainer",
    caseNumber: "CASE-001",
    notes: "Wire received, applied against monthly retainer.",
  },
  {
    id: 2,
    date: "2026-04-01",
    description: "Helix Labs retainer",
    account: "Retainer Liability",
    debit: 0,
    credit: 15000,
    category: "Retainer",
    caseNumber: "CASE-001",
    notes: "Unearned revenue balance.",
  },
  {
    id: 3,
    date: "2026-04-04",
    description: "Office rent — April",
    account: "Rent Expense",
    debit: 4200,
    credit: 0,
    category: "Operating",
    notes: "ACH to landlord.",
  },
  {
    id: 4,
    date: "2026-04-04",
    description: "Office rent — April",
    account: "Cash",
    debit: 0,
    credit: 4200,
    category: "Operating",
  },
  {
    id: 5,
    date: "2026-04-12",
    description: "Northstar invoice #2026-014",
    account: "AR",
    debit: 8500,
    credit: 0,
    category: "Revenue",
    caseNumber: "CASE-002",
    notes: "30-day terms.",
  },
  {
    id: 6,
    date: "2026-04-12",
    description: "Northstar invoice #2026-014",
    account: "Revenue",
    debit: 0,
    credit: 8500,
    category: "Revenue",
    caseNumber: "CASE-002",
  },
  {
    id: 7,
    date: "2026-04-15",
    description: "Payroll — April 1-15",
    account: "Wages Expense",
    debit: 22500,
    credit: 0,
    category: "Payroll",
  },
  {
    id: 8,
    date: "2026-04-15",
    description: "Payroll — April 1-15",
    account: "Cash",
    debit: 0,
    credit: 22500,
    category: "Payroll",
  },
  {
    id: 9,
    date: "2026-04-20",
    description: "Software (Westlaw, Clio)",
    account: "Software Expense",
    debit: 1320,
    credit: 0,
    category: "Operating",
  },
  {
    id: 10,
    date: "2026-04-20",
    description: "Software (Westlaw, Clio)",
    account: "Cash",
    debit: 0,
    credit: 1320,
    category: "Operating",
  },
  {
    id: 11,
    date: "2026-04-28",
    description: "Brightline AI deal close",
    account: "Cash",
    debit: 24000,
    credit: 0,
    category: "Revenue",
    caseNumber: "CASE-005",
    notes: "Final invoice paid in full.",
  },
  {
    id: 12,
    date: "2026-04-28",
    description: "Brightline AI deal close",
    account: "Revenue",
    debit: 0,
    credit: 24000,
    category: "Revenue",
    caseNumber: "CASE-005",
  },
];

export function Accounting() {
  const [tab, setTab] = useState<Tab>("ledger");
  return (
    <div className="space-y-4">
      <div>
        <div className="label-eyebrow mb-1">Accounting</div>
        <h1 className="text-xl font-bold tracking-tight">Books & finance</h1>
        <p className="text-xs text-white/50 mt-0.5">
          Double-entry bookkeeping, financials, and payroll for the firm.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-white/5 overflow-x-auto">
        {(
          [
            { id: "ledger", label: "Ledger", icon: BookOpen },
            { id: "trial", label: "Trial balance", icon: Scale },
            { id: "balance", label: "Balance sheet", icon: Wallet },
            { id: "pl", label: "P&L", icon: TrendingUp },
            { id: "cashflow", label: "Cash flow", icon: Banknote },
            { id: "payroll", label: "Payroll", icon: UsersRound },
          ] as { id: Tab; label: string; icon: any }[]
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-2.5 text-xs border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap",
                tab === t.id
                  ? "border-[var(--color-primary)] text-white"
                  : "border-transparent text-white/50 hover:text-white",
              )}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "ledger" && <Ledger />}
      {tab === "trial" && <TrialBalance entries={SEED_LEDGER} />}
      {tab === "balance" && <BalanceSheet />}
      {tab === "pl" && <ProfitLoss />}
      {tab === "cashflow" && <CashFlow />}
      {tab === "payroll" && <Payroll />}
    </div>
  );
}

// ── Ledger ──────────────────────────────────────────────────────────────────
function Ledger() {
  const [entries, setEntries] = useState<LedgerEntry[]>(SEED_LEDGER);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: "",
    debitAccount: "Cash",
    creditAccount: "Revenue",
    amount: "",
    category: "Revenue",
    caseNumber: "",
    notes: "",
  });

  const totalDebit = entries.reduce((a, e) => a + e.debit, 0);
  const totalCredit = entries.reduce((a, e) => a + e.credit, 0);
  const net = totalDebit - totalCredit;

  function addEntry(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!amount || !form.description.trim()) return;
    const baseId = (entries.at(-1)?.id ?? 0) + 1;
    setEntries([
      ...entries,
      {
        id: baseId,
        date: form.date,
        description: form.description,
        account: form.debitAccount,
        debit: amount,
        credit: 0,
        category: form.category,
        caseNumber: form.caseNumber || undefined,
        notes: form.notes || undefined,
      },
      {
        id: baseId + 1,
        date: form.date,
        description: form.description,
        account: form.creditAccount,
        debit: 0,
        credit: amount,
        category: form.category,
        caseNumber: form.caseNumber || undefined,
        notes: form.notes || undefined,
      },
    ]);
    setForm({ ...form, description: "", amount: "", notes: "" });
  }

  let running = 0;
  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        <Chip color="#3b82f6" label="Total debits" value={formatCurrency(totalDebit)} />
        <Chip color="#a855f7" label="Total credits" value={formatCurrency(totalCredit)} />
        <Chip color={net === 0 ? "#10b981" : "#ef4444"} label="Net" value={formatCurrency(net)} />
      </div>

      {/* New entry form */}
      <form onSubmit={addEntry} className="glass-panel p-4 grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div>
          <Label>Date</Label>
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div className="col-span-2">
          <Label>Description</Label>
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <Label>Amount</Label>
          <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
        </div>
        <div>
          <Label>Debit account</Label>
          <Input value={form.debitAccount} onChange={(e) => setForm({ ...form, debitAccount: e.target.value })} />
        </div>
        <div>
          <Label>Credit account</Label>
          <Input value={form.creditAccount} onChange={(e) => setForm({ ...form, creditAccount: e.target.value })} />
        </div>
        <div className="col-span-2">
          <Label>Notes</Label>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div>
          <Label>Case</Label>
          <Input value={form.caseNumber} onChange={(e) => setForm({ ...form, caseNumber: e.target.value })} placeholder="CASE-…" />
        </div>
        <div>
          <Label>Category</Label>
          <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option>Revenue</option>
            <option>Retainer</option>
            <option>Operating</option>
            <option>Payroll</option>
            <option>Tax</option>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            <Plus size={14} /> Add entry
          </Button>
        </div>
      </form>

      {/* Ledger table */}
      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
              <th className="px-4 py-3" />
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Description</th>
              <th className="px-3 py-3">Account</th>
              <th className="px-3 py-3 text-right">Debit</th>
              <th className="px-3 py-3 text-right">Credit</th>
              <th className="px-3 py-3 text-right">Balance</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Case</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              running += e.debit - e.credit;
              const isOpen = expanded === e.id;
              return (
                <Fragment key={e.id}>
                  <tr
                    className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer"
                    onClick={() => setExpanded(isOpen ? null : e.id)}
                  >
                    <td className="px-4 py-2.5 text-white/40">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-white/60">{formatDate(e.date)}</td>
                    <td className="px-3 py-2.5">{e.description}</td>
                    <td className="px-3 py-2.5 text-white/70">{e.account}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300">
                      {e.debit ? formatCurrency(e.debit) : ""}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-rose-300">
                      {e.credit ? formatCurrency(e.credit) : ""}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-white/80">
                      {formatCurrency(running)}
                    </td>
                    <td className="px-3 py-2.5 text-white/60">{e.category}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-white/50">{e.caseNumber ?? ""}</td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-white/[0.02]">
                      <td colSpan={9} className="px-6 py-4">
                        <div className="text-xs text-white/40 mb-1">Notes</div>
                        <div className="text-sm text-white/80 mb-3">
                          {e.notes ?? "No notes for this entry."}
                        </div>
                        {e.caseNumber && (
                          <div className="text-xs text-[var(--color-primary)] font-mono">
                            Linked to {e.caseNumber}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Chip({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div
      className="px-4 py-2 rounded-lg border"
      style={{ background: `${color}14`, borderColor: `${color}40` }}
    >
      <div className="label-eyebrow" style={{ color: `${color}cc` }}>
        {label}
      </div>
      <div className="text-base font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

// ── Trial Balance ────────────────────────────────────────────────────────────
function TrialBalance({ entries }: { entries: LedgerEntry[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { debit: number; credit: number }>();
    for (const e of entries) {
      const cur = map.get(e.account) ?? { debit: 0, credit: 0 };
      cur.debit += e.debit;
      cur.credit += e.credit;
      map.set(e.account, cur);
    }
    return Array.from(map.entries()).map(([account, v]) => ({ account, ...v }));
  }, [entries]);

  const totalDebit = rows.reduce((a, r) => a + r.debit, 0);
  const totalCredit = rows.reduce((a, r) => a + r.credit, 0);
  const balanced = totalDebit === totalCredit;

  return (
    <div className="glass-panel overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
            <th className="px-4 py-2.5">Account</th>
            <th className="px-5 py-3 text-right">Debit</th>
            <th className="px-5 py-3 text-right">Credit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.account} className="border-b border-white/5">
              <td className="px-4 py-2.5">{r.account}</td>
              <td className="px-5 py-3 text-right tabular-nums">
                {r.debit ? formatCurrency(r.debit) : ""}
              </td>
              <td className="px-5 py-3 text-right tabular-nums">
                {r.credit ? formatCurrency(r.credit) : ""}
              </td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="px-5 py-3 flex items-center gap-2">
              Totals
              {balanced ? (
                <span className="badge-completed text-[10px] px-2 py-0.5 rounded-full">Balanced</span>
              ) : (
                <span className="badge-priority-critical text-[10px] px-2 py-0.5 rounded-full">
                  Unbalanced
                </span>
              )}
            </td>
            <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(totalDebit)}</td>
            <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(totalCredit)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Balance Sheet ────────────────────────────────────────────────────────────
function BalanceSheet() {
  const assets = [
    { name: "Cash & equivalents", amount: 124800 },
    { name: "Accounts receivable", amount: 38200 },
    { name: "Prepaid expenses", amount: 4500 },
    { name: "Furniture & equipment", amount: 22300 },
    { name: "Intangibles", amount: 8000 },
  ];
  const liabilities = [
    { name: "Accounts payable", amount: 12400 },
    { name: "Retainer liability", amount: 26000 },
    { name: "Accrued payroll", amount: 8800 },
    { name: "Loans payable", amount: 30000 },
  ];
  const equity = [
    { name: "Owner's equity", amount: 80000 },
    { name: "Retained earnings", amount: 40600 },
  ];
  const sum = (rows: { amount: number }[]) => rows.reduce((a, r) => a + r.amount, 0);
  const net = sum(assets) - sum(liabilities) - sum(equity);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Section title="Assets" rows={assets} total={sum(assets)} color="#29f312" />
      <Section
        title="Liabilities + Equity"
        rows={[...liabilities, ...equity]}
        total={sum(liabilities) + sum(equity)}
        color="#a855f7"
      />
      <div className="md:col-span-2 glass-panel p-4 flex items-center justify-between">
        <div>
          <div className="label-eyebrow">Net worth</div>
          <div className="text-3xl font-bold tabular-nums mt-1">{formatCurrency(net)}</div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  rows,
  total,
  color,
}: {
  title: string;
  rows: { name: string; amount: number }[];
  total: number;
  color: string;
}) {
  return (
    <div className="glass-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{title}</h3>
        <span className="size-2 rounded-full" style={{ background: color }} />
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-white/70">{r.name}</span>
            <span className="tabular-nums">{formatCurrency(r.amount)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 mt-2 pt-3 flex items-center justify-between text-sm font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}

// ── P&L ──────────────────────────────────────────────────────────────────────
function ProfitLoss() {
  const revenue = [
    { name: "Legal services", amount: 184000 },
    { name: "Retainer recognition", amount: 32000 },
    { name: "Reimbursements", amount: 4200 },
  ];
  const expenses = [
    { name: "Payroll", amount: 88000 },
    { name: "Rent", amount: 16800 },
    { name: "Software", amount: 5200 },
    { name: "Professional dev", amount: 2400 },
    { name: "Marketing", amount: 6100 },
    { name: "Insurance", amount: 3400 },
  ];
  const totalRev = revenue.reduce((a, r) => a + r.amount, 0);
  const totalExp = expenses.reduce((a, r) => a + r.amount, 0);
  const net = totalRev - totalExp;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Section title="Revenue" rows={revenue} total={totalRev} color="#29f312" />
      <Section title="Expenses" rows={expenses} total={totalExp} color="#ef4444" />
      <div className="md:col-span-2 glass-panel p-4 flex items-center justify-between">
        <div>
          <div className="label-eyebrow">Net income</div>
          <div
            className={cn(
              "text-3xl font-bold tabular-nums mt-1",
              net >= 0 ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {formatCurrency(net)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Cash Flow ────────────────────────────────────────────────────────────────
function CashFlow() {
  const operating = [
    { name: "Net income", amount: 98300 },
    { name: "Increase in AR", amount: -8200 },
    { name: "Increase in AP", amount: 4400 },
    { name: "Depreciation", amount: 2200 },
  ];
  const investing = [
    { name: "Furniture purchases", amount: -6800 },
    { name: "Software CapEx", amount: -3200 },
  ];
  const financing = [
    { name: "Owner draws", amount: -10000 },
    { name: "Loan principal payments", amount: -4000 },
  ];
  const sum = (rows: { amount: number }[]) => rows.reduce((a, r) => a + r.amount, 0);
  const net = sum(operating) + sum(investing) + sum(financing);
  const opening = 48000;
  return (
    <div className="space-y-4">
      <CashSection title="Operating activities" rows={operating} />
      <CashSection title="Investing activities" rows={investing} />
      <CashSection title="Financing activities" rows={financing} />
      <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-3">
        <Chip color="#3b82f6" label="Net change in cash" value={formatCurrency(net)} />
        <Chip color="#a855f7" label="Opening balance" value={formatCurrency(opening)} />
        <Chip color="#29f312" label="Closing balance" value={formatCurrency(opening + net)} />
      </div>
    </div>
  );
}

function CashSection({ title, rows }: { title: string; rows: { name: string; amount: number }[] }) {
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return (
    <div className="glass-panel p-4">
      <h3 className="font-semibold mb-3">{title}</h3>
      <div className="divide-y divide-white/5">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-white/70">{r.name}</span>
            <span
              className={cn(
                "tabular-nums",
                r.amount < 0 ? "text-rose-300" : "text-emerald-300",
              )}
            >
              {formatCurrency(r.amount)}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10 mt-2 pt-3 flex items-center justify-between text-sm font-semibold">
        <span>Subtotal</span>
        <span
          className={cn("tabular-nums", total < 0 ? "text-rose-400" : "text-emerald-400")}
        >
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}

// ── Payroll ──────────────────────────────────────────────────────────────────
interface Employee {
  id: number;
  name: string;
  role: string;
  department: string;
  gross: number;
  ytd: number;
}

const EMPLOYEES: Employee[] = [
  { id: 1, name: "Iris Burgos", role: "Managing Partner", department: "Leadership", gross: 18000, ytd: 72000 },
  { id: 2, name: "Devon Park", role: "Senior Associate", department: "Litigation", gross: 11500, ytd: 46000 },
  { id: 3, name: "Sara Mitchell", role: "Associate", department: "Transactions", gross: 8400, ytd: 33600 },
];

function Payroll() {
  const [run, setRun] = useState<Employee | null>(null);
  return (
    <div className="space-y-4">
      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
              <th className="px-4 py-2.5">Name</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Department</th>
              <th className="px-3 py-3 text-right">Gross salary</th>
              <th className="px-3 py-3 text-right">YTD</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {EMPLOYEES.map((e) => (
              <tr key={e.id} className="border-b border-white/5">
                <td className="px-5 py-3 font-medium">{e.name}</td>
                <td className="px-3 py-3 text-white/70">{e.role}</td>
                <td className="px-3 py-3 text-white/70">{e.department}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatCurrency(e.gross)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-white/60">
                  {formatCurrency(e.ytd)}
                </td>
                <td className="px-5 py-3 text-right">
                  <Button size="sm" onClick={() => setRun(e)}>
                    Run payroll
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PaystubModal employee={run} onClose={() => setRun(null)} />
    </div>
  );
}

function PaystubModal({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  if (!employee) return <Modal open={false} onClose={onClose} children={<></>} />;
  const gross = employee.gross;
  const federal = gross * 0.22;
  const state = gross * 0.05;
  const ss = gross * 0.062;
  const medicare = gross * 0.0145;
  const k401 = gross * 0.05;
  const net = gross - federal - state - ss - medicare - k401;
  return (
    <Modal open={!!employee} onClose={onClose} title={`Paystub — ${employee.name}`} widthClass="max-w-md">
      <div className="space-y-3 text-sm">
        <Row label="Gross pay" value={formatCurrency(gross)} bold />
        <hr className="border-white/5" />
        <Row label="Federal income tax (22%)" value={`-${formatCurrency(federal)}`} negative />
        <Row label="State tax (5%)" value={`-${formatCurrency(state)}`} negative />
        <Row label="Social Security (6.2%)" value={`-${formatCurrency(ss)}`} negative />
        <Row label="Medicare (1.45%)" value={`-${formatCurrency(medicare)}`} negative />
        <Row label="401(k) (5%)" value={`-${formatCurrency(k401)}`} negative />
        <hr className="border-white/5" />
        <Row label="Net pay" value={formatCurrency(net)} bold positive />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={() => window.print()}>
            <Printer size={14} />
            Print
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Row({
  label,
  value,
  bold,
  positive,
  negative,
}: {
  label: string;
  value: string;
  bold?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-white/70", bold && "text-white font-semibold")}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          bold && "font-bold text-base",
          positive && "text-emerald-400",
          negative && "text-rose-300",
        )}
      >
        {value}
      </span>
    </div>
  );
}
