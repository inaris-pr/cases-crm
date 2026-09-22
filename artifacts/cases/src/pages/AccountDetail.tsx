import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Star,
  Mail,
  Phone,
  ExternalLink,
} from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type { AccountDetail as AccountDetailT, Address } from "@/lib/api";
import { StatusBadge, PriorityBadge } from "@/components/ui/Badge";
import { EditableField, EditableCheckbox } from "@/components/ui/EditableField";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";

type Tab = "details" | "contacts" | "cases";

const RENEWAL_STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "Good Standing", label: "Good Standing" },
  { value: "Administratively Dissolved", label: "Administratively Dissolved" },
  { value: "Dissolved", label: "Dissolved" },
  { value: "Pending Filing", label: "Pending Filing" },
];

const BANKING_STATUS_OPTIONS = [
  { value: "APPROVED", label: "APPROVED" },
  { value: "PENDING", label: "PENDING" },
  { value: "DENIED", label: "DENIED" },
  { value: "NOT_STARTED", label: "NOT_STARTED" },
];

const AUTOMATION_OPTIONS = [
  { value: "Succeeded", label: "Succeeded" },
  { value: "Failed", label: "Failed" },
  { value: "Pending", label: "Pending" },
  { value: "Not Started", label: "Not Started" },
];

const TIER_OPTIONS = [
  { value: "Basic", label: "Basic" },
  { value: "Standard", label: "Standard" },
  { value: "Professional", label: "Professional" },
  { value: "Premium", label: "Premium" },
];

const ENTITY_OPTIONS = [
  { value: "LLC", label: "LLC" },
  { value: "PLLC", label: "PLLC" },
  { value: "Series LLC", label: "Series LLC" },
  { value: "C Corp", label: "C Corp" },
  { value: "S Corp", label: "S Corp" },
  { value: "Nonprofit", label: "Nonprofit" },
];

export function AccountDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("details");

  const accountQuery = useQuery({
    queryKey: ["account", id],
    queryFn: () => fetchJson<AccountDetailT>(API(`/api/accounts/${id}`)),
    enabled: Number.isFinite(id),
  });

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson(API(`/api/accounts/${id}`), {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account", id] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });

  const save = (field: string) => (next: string | null) => patch.mutate({ [field]: next });
  const saveNumber = (field: string) => (next: string | null) =>
    patch.mutate({ [field]: next == null || next === "" ? null : Number(next) });
  const saveBool = (field: string) => (next: boolean) => patch.mutate({ [field]: next });
  const saveAddress = (field: "principalAddress" | "mailingAddress") =>
    (next: Address | null) => patch.mutate({ [field]: next });

  const a = accountQuery.data;

  if (accountQuery.isLoading) {
    return <div className="text-white/40 text-sm">Loading…</div>;
  }
  if (!a) {
    return <div className="text-white/40 text-sm">Account not found.</div>;
  }

  const primary = a.contacts.find((c) => c.link.isPrimary) ?? a.contacts[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-white/50">
        <Link href="/accounts">
          <a className="inline-flex items-center gap-1 hover:text-white">
            <ChevronLeft size={12} />
            Accounts
          </a>
        </Link>
        <span>·</span>
        <span className="text-white/30">Account</span>
      </div>

      {/* Header */}
      <div className="glass-panel neon-border p-4">
        <div className="flex items-start gap-4">
          <div className="size-11 rounded-lg bg-[var(--color-primary)]/15 grid place-items-center text-[var(--color-primary)] shrink-0">
            <Building2 size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight">{a.name}</h1>
            <div className="mt-1 flex items-center gap-2 flex-wrap text-xs text-white/60">
              {a.state && <Pill>{a.state}</Pill>}
              {a.entityType && <Pill>{a.entityType}</Pill>}
              {a.brand && <Pill>{a.brand}</Pill>}
              {a.renewalStatus && (
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                    a.renewalStatus === "Active" || a.renewalStatus === "Good Standing"
                      ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                      : a.renewalStatus.includes("Dissolved")
                        ? "bg-rose-500/15 text-rose-300"
                        : "bg-amber-500/15 text-amber-300",
                  )}
                >
                  {a.renewalStatus}
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 max-w-md">
              <Metric label="Contacts" value={a.contactCount} />
              <Metric label="Open cases" value={a.openCaseCount} />
              <Metric label="Total cases" value={a.caseCount} />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-white/5">
        <TabBtn active={tab === "details"} onClick={() => setTab("details")}>
          Details
        </TabBtn>
        <TabBtn active={tab === "contacts"} onClick={() => setTab("contacts")}>
          Contacts ({a.contacts.length})
        </TabBtn>
        <TabBtn active={tab === "cases"} onClick={() => setTab("cases")}>
          Cases ({a.cases.length})
        </TabBtn>
      </div>

      {tab === "details" && (
        <div className="space-y-3">
          <Section title="Account Information">
            <Grid>
              <Row label="Portal ID">
                <EditableField value={a.portalId?.toString() ?? null} type="number" onSave={saveNumber("portalId")} />
              </Row>
              <Row label="Account Owner">
                <EditableField value={a.ownerName} onSave={save("ownerName")} />
              </Row>
              <Row label="Account Name">
                <EditableField value={a.name} onSave={save("name")} allowEmpty={false} />
              </Row>
              <Row label="Archived">
                <EditableCheckbox value={a.archived} onSave={saveBool("archived")} />
              </Row>
              <Row label="Old Company Name">
                <EditableField value={a.oldCompanyName} onSave={save("oldCompanyName")} />
              </Row>
              <Row label="Primary Contact">
                {primary ? (
                  <Link href={`/contacts/${primary.id}`}>
                    <a className="text-sm text-[var(--color-primary)] hover:underline">
                      {primary.fullName}
                    </a>
                  </Link>
                ) : (
                  <span className="text-white/30 italic text-sm">—</span>
                )}
              </Row>
              <Row label="Formation State">
                <EditableField value={a.state} onSave={save("state")} />
              </Row>
              <Row label="Parent Account">
                <span className="text-white/30 italic text-sm">—</span>
              </Row>
              <Row label="Company Type">
                <EditableField
                  value={a.entityType}
                  onSave={save("entityType")}
                  options={ENTITY_OPTIONS}
                />
              </Row>
              <Row label="Company Phone">
                <EditableField value={a.companyPhone} onSave={save("companyPhone")} type="tel" />
              </Row>
              <Row label="Portal Link">
                <EditableField
                  value={a.portalLink}
                  onSave={save("portalLink")}
                  displayValue={
                    a.portalLink ? (
                      <a
                        href={`https://${a.portalLink.replace(/^https?:\/\//, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {a.portalLink}
                        <ExternalLink size={10} />
                      </a>
                    ) : null
                  }
                />
              </Row>
              <Row label="Filing ID">
                <EditableField value={a.filingId} onSave={save("filingId")} />
              </Row>
              <Row label="Brand">
                <EditableField value={a.brand} onSave={save("brand")} />
              </Row>
              <Row label="EIN">
                <EditableField value={a.ein} onSave={save("ein")} placeholder="XX-XXXXXXX" />
              </Row>
              <Row label="Subscription Bundle">
                <EditableField
                  value={a.subscriptionBundle}
                  onSave={save("subscriptionBundle")}
                  options={[
                    { value: "Basic", label: "Basic" },
                    { value: "Standard", label: "Standard" },
                    { value: "Premium", label: "Premium" },
                  ]}
                />
              </Row>
              <Row label="Formation Date">
                <EditableField
                  value={a.formationDate ? a.formationDate.slice(0, 10) : null}
                  onSave={save("formationDate")}
                  type="date"
                  displayValue={a.formationDate ? formatDate(a.formationDate) : null}
                />
              </Row>
              <Row label="FinCen Id">
                <EditableField value={a.fincenId} onSave={save("fincenId")} />
              </Row>
              <Row label="First Transaction Date">
                <EditableField
                  value={a.firstTransactionDate ? a.firstTransactionDate.slice(0, 10) : null}
                  onSave={save("firstTransactionDate")}
                  type="date"
                  displayValue={
                    a.firstTransactionDate ? formatDate(a.firstTransactionDate) : null
                  }
                />
              </Row>
              <Row label="FinCen Filing Date">
                <EditableField
                  value={a.fincenFilingDate ? a.fincenFilingDate.slice(0, 10) : null}
                  onSave={save("fincenFilingDate")}
                  type="date"
                  displayValue={a.fincenFilingDate ? formatDate(a.fincenFilingDate) : null}
                />
              </Row>
              <Row label="Abandoned Cart URL">
                <EditableField
                  value={a.abandonedCartUrl}
                  onSave={save("abandonedCartUrl")}
                  displayValue={
                    a.abandonedCartUrl ? (
                      <a
                        href={`https://${a.abandonedCartUrl.replace(/^https?:\/\//, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-primary)] hover:underline truncate inline-block max-w-[26ch]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {a.abandonedCartUrl}
                      </a>
                    ) : null
                  }
                />
              </Row>
              <Row label="Formation Tier">
                <EditableField
                  value={a.formationTier}
                  onSave={save("formationTier")}
                  options={TIER_OPTIONS}
                />
              </Row>
              <Row label="Phone Forwarding Phone">
                <EditableField
                  value={a.phoneForwardingPhone}
                  onSave={save("phoneForwardingPhone")}
                  type="tel"
                />
              </Row>
              <Row label="Automation Status">
                <EditableField
                  value={a.automationStatus}
                  onSave={save("automationStatus")}
                  options={AUTOMATION_OPTIONS}
                />
              </Row>
              <Row label="VO Phone">
                <EditableField value={a.voPhone} onSave={save("voPhone")} type="tel" />
              </Row>
              <Row label="Stripe ID">
                <EditableField value={a.stripeId} onSave={save("stripeId")} />
              </Row>
              <Row label="Is Formation Automated">
                <EditableCheckbox
                  value={a.isFormationAutomated}
                  onSave={saveBool("isFormationAutomated")}
                />
              </Row>
              <Row label="Old Stripe IDs">
                <EditableField value={a.oldStripeIds} onSave={save("oldStripeIds")} />
              </Row>
              <Row label="Share Type">
                <EditableField value={a.shareType} onSave={save("shareType")} />
              </Row>
              <Row label="Created Date">
                <span className="text-sm text-white/70">{formatDate(a.createdAt)}</span>
              </Row>
              <Row label="Common Share Quantity">
                <EditableField
                  value={a.commonShareQuantity?.toString() ?? null}
                  onSave={saveNumber("commonShareQuantity")}
                  type="number"
                />
              </Row>
              <Row label="Formation Status">
                <EditableField value={a.formationStatus} onSave={save("formationStatus")} />
              </Row>
              <Row label="Common Share Value">
                <EditableField
                  value={a.commonShareValue?.toString() ?? null}
                  onSave={saveNumber("commonShareValue")}
                  type="number"
                />
              </Row>
              <Row label="Industry">
                <EditableField value={a.industry} onSave={save("industry")} />
              </Row>
              <Row label="Preferred Share Quantity">
                <EditableField
                  value={a.preferredShareQuantity?.toString() ?? null}
                  onSave={saveNumber("preferredShareQuantity")}
                  type="number"
                />
              </Row>
              <Row label="Website">
                <EditableField
                  value={a.website}
                  onSave={save("website")}
                  displayValue={
                    a.website ? (
                      <a
                        href={`https://${a.website.replace(/^https?:\/\//, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-primary)] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {a.website}
                      </a>
                    ) : null
                  }
                />
              </Row>
              <Row label="Preferred Share Value">
                <EditableField
                  value={a.preferredShareValue?.toString() ?? null}
                  onSave={saveNumber("preferredShareValue")}
                  type="number"
                />
              </Row>
            </Grid>
          </Section>

          <Section title="Renewal Information">
            <Grid>
              <Row label="Renewal Status">
                <EditableField
                  value={a.renewalStatus}
                  onSave={save("renewalStatus")}
                  options={RENEWAL_STATUS_OPTIONS}
                />
              </Row>
              <Row label="Renewal Date">
                <EditableField
                  value={a.renewalDate ? a.renewalDate.slice(0, 10) : null}
                  onSave={save("renewalDate")}
                  type="date"
                  displayValue={a.renewalDate ? formatDate(a.renewalDate) : null}
                />
              </Row>
            </Grid>
          </Section>

          <Section title="Address Information">
            <Grid>
              <Row label="Principal Place of Business" labelWidth={210}>
                <AddressBlock
                  value={a.principalAddress}
                  onSave={saveAddress("principalAddress")}
                />
              </Row>
              <Row label="Mailing Address" labelWidth={210}>
                <AddressBlock value={a.mailingAddress} onSave={saveAddress("mailingAddress")} />
              </Row>
            </Grid>
          </Section>

          <Section title="Banking Information">
            <Grid>
              <Row label="Banking App Id">
                <EditableField value={a.bankingAppId} onSave={save("bankingAppId")} />
              </Row>
              <Row label="Banking App Message">
                <EditableField
                  value={a.bankingAppMessage}
                  onSave={save("bankingAppMessage")}
                  type="textarea"
                />
              </Row>
              <Row label="Banking App Status">
                <EditableField
                  value={a.bankingAppStatus}
                  onSave={save("bankingAppStatus")}
                  options={BANKING_STATUS_OPTIONS}
                  displayValue={
                    a.bankingAppStatus ? (
                      <span
                        className={cn(
                          "inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide",
                          a.bankingAppStatus === "APPROVED" &&
                            "bg-[var(--color-primary)]/15 text-[var(--color-primary)]",
                          a.bankingAppStatus === "DENIED" && "bg-rose-500/15 text-rose-300",
                          a.bankingAppStatus === "PENDING" && "bg-amber-500/15 text-amber-300",
                          a.bankingAppStatus === "NOT_STARTED" && "bg-white/5 text-white/50",
                        )}
                      >
                        {a.bankingAppStatus}
                      </span>
                    ) : null
                  }
                />
              </Row>
              <div />
            </Grid>
          </Section>

          <Section title="System Information">
            <Grid>
              <Row label="Created By">
                <div className="text-sm text-white/70">
                  {a.createdByName ?? "—"}
                  <span className="text-white/40 text-xs ml-2">
                    {formatDate(a.createdAt)}
                  </span>
                </div>
              </Row>
              <Row label="Last Modified By">
                <div className="text-sm text-white/70">
                  {a.lastModifiedByName ?? "—"}
                  {a.lastModifiedAt && (
                    <span className="text-white/40 text-xs ml-2">
                      {formatDate(a.lastModifiedAt)}
                    </span>
                  )}
                </div>
              </Row>
            </Grid>
          </Section>
        </div>
      )}

      {tab === "contacts" && <ContactsTab account={a} />}
      {tab === "cases" && <CasesTab account={a} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-panel overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] hover:bg-white/[0.05] transition-colors text-left"
      >
        {open ? (
          <ChevronDown size={14} className="text-white/50" />
        ) : (
          <ChevronRight size={14} className="text-white/50" />
        )}
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  // Two-column grid; rows are interleaved left-then-right as in the screenshot.
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-1.5">{children}</div>
  );
}

function Row({
  label,
  children,
  labelWidth,
}: {
  label: string;
  children: React.ReactNode;
  labelWidth?: number;
}) {
  return (
    <div className="grid grid-cols-[max-content_1fr] items-start gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
      <div
        className="text-xs text-white/45 pt-1.5"
        style={{ minWidth: labelWidth ?? 160 }}
      >
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-medium tracking-wide">
      {children}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-white/[0.03] border border-white/5 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-white/40">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}

function TabBtn({
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
        "px-4 py-2.5 text-sm -mb-px border-b-2 transition-colors",
        active
          ? "border-[var(--color-primary)] text-white font-semibold"
          : "border-transparent text-white/55 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

// ── Address sub-editor ─────────────────────────────────────────────────────

function AddressBlock({
  value,
  onSave,
}: {
  value: Address | null;
  onSave: (next: Address | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Address>(
    value ?? { line1: "", line2: "", city: "", state: "", zip: "", country: "US" },
  );

  function commit() {
    const cleaned: Address = {
      line1: draft.line1.trim(),
      line2: draft.line2?.trim() || null,
      city: draft.city.trim(),
      state: draft.state.trim(),
      zip: draft.zip.trim(),
      country: draft.country.trim() || "US",
    };
    if (
      !cleaned.line1 &&
      !cleaned.city &&
      !cleaned.state &&
      !cleaned.zip
    ) {
      onSave(null);
    } else {
      onSave(cleaned);
    }
    setEditing(false);
  }

  if (!editing) {
    return (
      <div
        onClick={() => {
          setDraft(
            value ?? { line1: "", line2: "", city: "", state: "", zip: "", country: "US" },
          );
          setEditing(true);
        }}
        className="group cursor-text -mx-1 px-1 py-1 rounded hover:bg-white/[0.04]"
      >
        {value ? (
          <address className="not-italic text-sm leading-snug">
            <div className="text-[var(--color-primary)] hover:underline">{value.line1}</div>
            {value.line2 && <div className="text-[var(--color-primary)]">{value.line2}</div>}
            <div className="text-[var(--color-primary)]">
              {value.city}, {value.state} {value.zip}
            </div>
            <div className="text-[var(--color-primary)]">{value.country}</div>
          </address>
        ) : (
          <span className="italic text-white/30 text-sm">—</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 -mx-1 px-1 py-1 rounded bg-white/[0.04]">
      <input
        autoFocus
        value={draft.line1}
        onChange={(e) => setDraft({ ...draft, line1: e.target.value })}
        placeholder="Street address"
        className="w-full bg-[var(--color-input)] border border-white/10 rounded px-2 h-7 text-sm focus-ring"
      />
      <input
        value={draft.line2 ?? ""}
        onChange={(e) => setDraft({ ...draft, line2: e.target.value })}
        placeholder="Suite / Apt (optional)"
        className="w-full bg-[var(--color-input)] border border-white/10 rounded px-2 h-7 text-sm focus-ring"
      />
      <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
        <input
          value={draft.city}
          onChange={(e) => setDraft({ ...draft, city: e.target.value })}
          placeholder="City"
          className="bg-[var(--color-input)] border border-white/10 rounded px-2 h-7 text-sm focus-ring"
        />
        <input
          value={draft.state}
          onChange={(e) => setDraft({ ...draft, state: e.target.value })}
          placeholder="ST"
          className="bg-[var(--color-input)] border border-white/10 rounded px-2 h-7 text-sm focus-ring w-14"
        />
        <input
          value={draft.zip}
          onChange={(e) => setDraft({ ...draft, zip: e.target.value })}
          placeholder="ZIP"
          className="bg-[var(--color-input)] border border-white/10 rounded px-2 h-7 text-sm focus-ring w-20"
        />
      </div>
      <input
        value={draft.country}
        onChange={(e) => setDraft({ ...draft, country: e.target.value })}
        placeholder="Country"
        className="w-full bg-[var(--color-input)] border border-white/10 rounded px-2 h-7 text-sm focus-ring"
      />
      <div className="flex items-center gap-1.5 pt-1">
        <button
          onClick={commit}
          className="px-2 h-7 rounded bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-xs font-semibold"
        >
          Save
        </button>
        <button
          onClick={() => setEditing(false)}
          className="px-2 h-7 rounded text-white/55 hover:bg-white/5 text-xs"
        >
          Cancel
        </button>
        {value && (
          <button
            onClick={() => {
              onSave(null);
              setEditing(false);
            }}
            className="ml-auto px-2 h-7 rounded text-rose-300 hover:bg-rose-500/10 text-xs"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// ── Contacts / Cases tabs ──────────────────────────────────────────────────

function ContactsTab({ account }: { account: AccountDetailT }) {
  return (
    <div className="glass-panel overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
            <th className="px-4 py-2.5">Name</th>
            <th className="px-3 py-2.5">Role</th>
            <th className="px-3 py-2.5 text-right">Ownership</th>
            <th className="px-3 py-2.5">Email</th>
            <th className="px-3 py-2.5">Phone</th>
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {account.contacts.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-white/40">
                No contacts linked to this account yet.
              </td>
            </tr>
          ) : (
            account.contacts.map((c) => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.025]">
                <td className="px-4 py-3">
                  <Link href={`/contacts/${c.id}`}>
                    <a className="font-medium text-white hover:text-[var(--color-primary)] inline-flex items-center gap-1.5">
                      {c.link.isPrimary && (
                        <Star size={11} className="text-[var(--color-primary)] fill-current" />
                      )}
                      {c.fullName}
                    </a>
                  </Link>
                  {c.title && <div className="text-[11px] text-white/40 mt-0.5">{c.title}</div>}
                </td>
                <td className="px-3 py-3 text-xs text-white/65">{c.link.role}</td>
                <td className="px-3 py-3 text-right text-xs font-mono tabular-nums text-white/65">
                  {c.link.ownershipPct != null ? `${c.link.ownershipPct}%` : "—"}
                </td>
                <td className="px-3 py-3 text-xs text-white/55">
                  {c.email ? (
                    <a
                      href={`mailto:${c.email}`}
                      className="inline-flex items-center gap-1 hover:text-[var(--color-primary)]"
                    >
                      <Mail size={10} />
                      {c.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-white/55">
                  {c.phone ? (
                    <a
                      href={`tel:${c.phone}`}
                      className="inline-flex items-center gap-1 hover:text-[var(--color-primary)]"
                    >
                      <Phone size={10} />
                      {c.phone}
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-white/40">
                  {c.link.isSignatory && <span className="text-amber-300">Signatory</span>}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function CasesTab({ account }: { account: AccountDetailT }) {
  return (
    <div className="glass-panel overflow-hidden">
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
          {account.cases.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-white/40">
                No cases yet.
              </td>
            </tr>
          ) : (
            account.cases.map((c) => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.025]">
                <td className="px-4 py-3">
                  <Link href={`/cases/${c.id}`}>
                    <a className="block">
                      <span className="font-mono text-[10px] text-white/40">{c.caseNumber}</span>
                      <div className="text-sm text-white hover:text-[var(--color-primary)] truncate">
                        {c.title}
                      </div>
                    </a>
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-3 py-3">
                  <PriorityBadge priority={c.priority} />
                </td>
                <td className="px-3 py-3 text-xs text-white/65">{c.ownerName}</td>
                <td className="px-3 py-3 text-xs text-white/50">{formatDate(c.updatedAt)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
