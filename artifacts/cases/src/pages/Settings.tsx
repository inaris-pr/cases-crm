import { Fragment, useRef, useState } from "react";
import {
  ShieldCheck,
  Mail,
  X,
  Plus,
  Trash2,
  GripVertical,
  PencilLine,
  Check,
  Image as ImageIcon,
  Moon,
  Sun,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { can, SETTINGS_SECTIONS, visibleSections } from "@cases/access";
import { useAuth } from "@/lib/auth";

type AdminTab = "invite" | "divisions" | "pipelines" | "company";

/**
 * Admin tabs and the lib/access Settings section each one belongs to.
 * "Invite users" is part of the People section, which is planned: it stays
 * hidden from everyone until the People phase makes it real.
 */
const ADMIN_TABS: { id: AdminTab; label: string; section: string }[] = [
  { id: "invite", label: "Invite users", section: "people" },
  { id: "divisions", label: "Divisions & teams", section: "teams" },
  { id: "pipelines", label: "Pipeline stages", section: "pipelines" },
  { id: "company", label: "Company config", section: "company" },
];

const SWATCHES = ["#29F312", "#3b82f6", "#a855f7", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#06b6d4"];

/**
 * Operational and system settings (front-end prototypes, local state only).
 * Only the sections this employee's permissions allow are rendered (RBAC
 * Phase 5); personal settings are in the account menu (/account).
 */
export function Settings() {
  const { permissions } = useAuth();
  const allowed = new Set(visibleSections(SETTINGS_SECTIONS, permissions).map((s) => s.id));
  const tabs = ADMIN_TABS.filter((t) => allowed.has(t.section));
  const [picked, setAdminTab] = useState<AdminTab | null>(null);
  const adminTab = picked && tabs.some((t) => t.id === picked) ? picked : tabs[0]?.id ?? null;
  const canManageTeams = can(permissions, "settings.teams.manage");
  return (
    <div className="space-y-6">
      <div>
        <div className="label-eyebrow mb-1">Account</div>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
      </div>

      {/* Admin */}
      {tabs.length > 0 && (
      <section>
        <div className="flex items-center gap-3 mb-3">
          <div className="label-eyebrow flex items-center gap-2">
            <ShieldCheck size={14} className="text-[var(--color-primary)]" />
            Admin panel
          </div>
          <span className="text-[10px] tracking-widest uppercase bg-[var(--color-primary)]/15 text-[var(--color-primary)] px-2 py-0.5 rounded-full">
            Manager access
          </span>
        </div>

        <div className="flex items-center gap-1 border-b border-white/5 mb-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              data-testid={`settings-tab-${t.id}`}
              onClick={() => setAdminTab(t.id)}
              className={cn(
                "px-3 py-2.5 text-xs border-b-2 -mb-px",
                adminTab === t.id
                  ? "border-[var(--color-primary)] text-white"
                  : "border-transparent text-white/50 hover:text-white",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {adminTab === "invite" && <InviteUsers />}
        {adminTab === "divisions" && <Divisions readOnly={!canManageTeams} />}
        {adminTab === "pipelines" && <Pipelines />}
        {adminTab === "company" && <CompanyConfig />}
      </section>
      )}

      {/* Danger zone */}
      {allowed.has("data") && (
      <section data-testid="settings-danger-zone" className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5">
        <div className="label-eyebrow mb-1 text-rose-300">Danger zone</div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-white">Delete account</h3>
            <p className="text-sm text-rose-200/70 mt-0.5">
              Permanently delete this workspace and all of its data. This cannot be undone.
            </p>
          </div>
          <button className="px-4 h-10 rounded-lg border border-rose-500/50 text-rose-300 text-sm font-semibold hover:bg-rose-500/20">
            Delete account
          </button>
        </div>
      </section>
      )}
    </div>
  );
}

// ── Invite users ────────────────────────────────────────────────────────────
interface Invitation {
  id: number;
  email: string;
  role: string;
  sentAt: string;
  status: "pending" | "accepted";
}

function InviteUsers() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Case Manager");
  const [invites, setInvites] = useState<Invitation[]>([
    {
      id: 1,
      email: "iris@example.com",
      role: "Admin",
      sentAt: "2026-03-15",
      status: "accepted",
    },
    {
      id: 2,
      email: "devon@example.com",
      role: "Manager",
      sentAt: "2026-05-08",
      status: "accepted",
    },
    {
      id: 3,
      email: "sara@example.com",
      role: "Analyst",
      sentAt: "2026-05-11",
      status: "accepted",
    },
  ]);

  function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setInvites([
      ...invites,
      {
        id: Date.now(),
        email: email.trim(),
        role,
        sentAt: new Date().toISOString().slice(0, 10),
        status: "pending",
      },
    ]);
    setEmail("");
  }

  return (
    <div className="space-y-4">
      <form onSubmit={sendInvite} className="glass-panel p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <Label>Email address</Label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            type="email"
          />
        </div>
        <div>
          <Label>Role</Label>
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option>Admin</option>
            <option>Manager</option>
            <option>Case Manager</option>
            <option>Analyst</option>
            <option>Viewer</option>
          </Select>
        </div>
        <Button type="submit">
          <Mail size={14} />
          Invite
        </Button>
      </form>

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
              <th className="px-4 py-2.5">User</th>
              <th className="px-3 py-3">Role</th>
              <th className="px-3 py-3">Sent</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {invites.map((i) => (
              <Fragment key={i.id}>
                <tr className="border-b border-white/5">
                  <td className="px-5 py-3 flex items-center gap-3">
                    <Avatar name={i.email} size={32} />
                    <span>{i.email}</span>
                  </td>
                  <td className="px-3 py-3 text-white/70">{i.role}</td>
                  <td className="px-3 py-3 text-white/50 text-xs">{formatDate(i.sentAt)}</td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-semibold",
                        i.status === "accepted"
                          ? "badge-completed"
                          : "bg-amber-500/15 text-amber-300",
                      )}
                    >
                      {i.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => setInvites(invites.filter((x) => x.id !== i.id))}
                      className="p-1.5 rounded-md text-white/40 hover:text-rose-400 hover:bg-rose-500/10"
                      aria-label="Revoke"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Divisions ───────────────────────────────────────────────────────────────
interface Member {
  name: string;
  email: string;
}
interface Division {
  id: number;
  name: string;
  description: string;
  lead: string;
  color: string;
  members: Member[];
}

/** Divisions & teams (prototype). Read-only without settings.teams.manage. */
function Divisions({ readOnly = false }: { readOnly?: boolean }) {
  const [divisions, setDivisions] = useState<Division[]>([
    {
      id: 1,
      name: "Litigation",
      description: "Dispute resolution and trial work.",
      lead: "Devon Park",
      color: "#a855f7",
      members: [
        { name: "Devon Park", email: "devon@example.com" },
        { name: "Sara Mitchell", email: "sara@example.com" },
      ],
    },
    {
      id: 2,
      name: "Formations",
      description: "LLC formations, foreign qualifications, and entity governance.",
      lead: "Iris Burgos",
      color: "#29F312",
      members: [
        { name: "Iris Burgos", email: "iris@example.com" },
        { name: "Devon Park", email: "devon@example.com" },
        { name: "Sara Mitchell", email: "sara@example.com" },
      ],
    },
  ]);

  const [expanded, setExpanded] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    lead: "",
    description: "",
    color: SWATCHES[0],
  });
  const [memberInput, setMemberInput] = useState<{ divId: number | null; name: string; email: string }>({
    divId: null,
    name: "",
    email: "",
  });

  function createDivision(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setDivisions([
      ...divisions,
      { id: Date.now(), ...form, members: [] },
    ]);
    setForm({ name: "", lead: "", description: "", color: SWATCHES[0] });
    setShowForm(false);
  }

  function addMember(d: Division) {
    if (!memberInput.name.trim() || !memberInput.email.trim()) return;
    setDivisions(
      divisions.map((x) =>
        x.id === d.id
          ? { ...x, members: [...x.members, { name: memberInput.name, email: memberInput.email }] }
          : x,
      ),
    );
    setMemberInput({ divId: d.id, name: "", email: "" });
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus size={14} />
          New division
        </Button>
      </div>
      )}
      {!readOnly && showForm && (
        <form onSubmit={createDivision} className="glass-panel p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Division name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <Label>Team lead</Label>
            <Input value={form.lead} onChange={(e) => setForm({ ...form, lead: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Textarea
              value={form.description}
              rows={2}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {SWATCHES.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  style={{ background: c }}
                  className={cn(
                    "size-7 rounded-full border-2",
                    form.color === c ? "border-white" : "border-white/10",
                  )}
                />
              ))}
            </div>
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {divisions.map((d) => {
          const isOpen = expanded === d.id;
          return (
            <div key={d.id} className="glass-panel overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : d.id)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/[0.03]"
              >
                <div className="w-1 self-stretch rounded-full" style={{ background: d.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{d.name}</div>
                    <span className="text-[11px] text-white/40">· lead: {d.lead || "—"}</span>
                  </div>
                  <div className="text-xs text-white/50 mt-0.5">{d.description}</div>
                </div>
                <span className="text-xs bg-white/5 px-2 py-1 rounded-full text-white/60">
                  {d.members.length} member{d.members.length === 1 ? "" : "s"}
                </span>
                {!readOnly && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDivisions(divisions.filter((x) => x.id !== d.id));
                  }}
                  className="p-1.5 rounded-md text-white/40 hover:text-rose-400"
                >
                  <Trash2 size={14} />
                </button>
                )}
              </button>
              {isOpen && (
                <div className="border-t border-white/5 p-4 space-y-2">
                  {d.members.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-2 py-1.5 rounded-md bg-white/[0.03]"
                    >
                      <Avatar name={m.name} size={28} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{m.name}</div>
                        <div className="text-xs text-white/40 truncate">{m.email}</div>
                      </div>
                      {!readOnly && <button
                        onClick={() =>
                          setDivisions(
                            divisions.map((x) =>
                              x.id === d.id
                                ? { ...x, members: x.members.filter((mm) => mm.email !== m.email) }
                                : x,
                            ),
                          )
                        }
                        className="text-white/40 hover:text-rose-400 p-1"
                      >
                        <X size={14} />
                      </button>}
                    </div>
                  ))}
                  {!readOnly && <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-white/5">
                    <div className="flex-1 min-w-[160px]">
                      <Label>Name</Label>
                      <Input
                        value={memberInput.divId === d.id ? memberInput.name : ""}
                        onChange={(e) =>
                          setMemberInput({ divId: d.id, name: e.target.value, email: memberInput.email })
                        }
                      />
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <Label>Email</Label>
                      <Input
                        value={memberInput.divId === d.id ? memberInput.email : ""}
                        onChange={(e) =>
                          setMemberInput({ divId: d.id, name: memberInput.name, email: e.target.value })
                        }
                      />
                    </div>
                    <Button onClick={() => addMember(d)}>
                      <Plus size={14} />
                      Add member
                    </Button>
                  </div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Pipelines ───────────────────────────────────────────────────────────────
interface Stage {
  id: number;
  name: string;
  color: string;
  probability: number;
}
interface Pipeline {
  id: number;
  name: string;
  stages: Stage[];
}

function Pipelines() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([
    {
      id: 1,
      name: "Litigation",
      stages: [
        { id: 1, name: "Intake", color: "#3b82f6", probability: 100 },
        { id: 2, name: "Investigation", color: "#a855f7", probability: 80 },
        { id: 3, name: "Pleadings", color: "#f59e0b", probability: 60 },
        { id: 4, name: "Discovery", color: "#29F312", probability: 40 },
        { id: 5, name: "Resolution", color: "#10b981", probability: 100 },
      ],
    },
    {
      id: 2,
      name: "Transactions",
      stages: [
        { id: 1, name: "Term sheet", color: "#3b82f6", probability: 90 },
        { id: 2, name: "Due diligence", color: "#a855f7", probability: 70 },
        { id: 3, name: "Drafting", color: "#f59e0b", probability: 60 },
        { id: 4, name: "Closing", color: "#10b981", probability: 95 },
      ],
    },
  ]);
  const [activeId, setActiveId] = useState(1);
  const [newPipe, setNewPipe] = useState("");
  const [editingStage, setEditingStage] = useState<number | null>(null);
  const [newStage, setNewStage] = useState({ name: "", color: SWATCHES[0], probability: 50 });
  const [showStageForm, setShowStageForm] = useState(false);

  const active = pipelines.find((p) => p.id === activeId)!;

  function createPipeline(e: React.FormEvent) {
    e.preventDefault();
    if (!newPipe.trim()) return;
    const id = Date.now();
    setPipelines([
      ...pipelines,
      { id, name: newPipe.trim(), stages: [] },
    ]);
    setActiveId(id);
    setNewPipe("");
  }

  function updateStage(s: Stage) {
    setPipelines(
      pipelines.map((p) =>
        p.id === activeId
          ? { ...p, stages: p.stages.map((st) => (st.id === s.id ? s : st)) }
          : p,
      ),
    );
  }

  function deleteStage(id: number) {
    setPipelines(
      pipelines.map((p) =>
        p.id === activeId ? { ...p, stages: p.stages.filter((s) => s.id !== id) } : p,
      ),
    );
  }

  function addStage() {
    if (!newStage.name.trim()) return;
    setPipelines(
      pipelines.map((p) =>
        p.id === activeId
          ? {
              ...p,
              stages: [
                ...p.stages,
                {
                  id: Date.now(),
                  name: newStage.name,
                  color: newStage.color,
                  probability: newStage.probability,
                },
              ],
            }
          : p,
      ),
    );
    setNewStage({ name: "", color: SWATCHES[0], probability: 50 });
    setShowStageForm(false);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[208px_1fr] gap-4">
      <aside className="glass-panel p-3 space-y-1.5 h-fit">
        {pipelines.map((p) => (
          <button
            key={p.id}
            onClick={() => setActiveId(p.id)}
            className={cn(
              "w-full text-left px-3 py-2 rounded-md text-sm",
              p.id === activeId ? "bg-white/5 text-white" : "text-white/60 hover:bg-white/5",
            )}
          >
            {p.name}
            <span className="block text-[11px] text-white/40">{p.stages.length} stages</span>
          </button>
        ))}
        <form onSubmit={createPipeline} className="pt-2 border-t border-white/5 space-y-1.5">
          <Input
            value={newPipe}
            onChange={(e) => setNewPipe(e.target.value)}
            placeholder="New pipeline…"
          />
          <Button type="submit" className="w-full" size="sm">
            <Plus size={12} />
            Add pipeline
          </Button>
        </form>
      </aside>

      <div className="glass-panel p-4 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{active.name}</h3>
          <Button onClick={() => setShowStageForm(!showStageForm)} size="sm">
            <Plus size={12} />
            Add stage
          </Button>
        </div>

        {/* Visual pipeline */}
        <div className="overflow-x-auto">
          <div className="flex items-center gap-4 py-3 min-w-max">
            {active.stages.map((s, i) => (
              <Fragment key={s.id}>
                <div className="flex flex-col items-center">
                  <div
                    className="size-14 rounded-full grid place-items-center font-bold border-2 text-sm"
                    style={{
                      background: `${s.color}1a`,
                      borderColor: s.color,
                      color: s.color,
                      boxShadow: `0 0 16px ${s.color}40`,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="text-xs font-semibold mt-2 text-center">{s.name}</div>
                  <div className="text-[11px] text-white/40">{s.probability}%</div>
                </div>
                {i < active.stages.length - 1 && (
                  <div
                    className="h-1 w-12 rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${s.color}, ${active.stages[i + 1].color})`,
                    }}
                  />
                )}
              </Fragment>
            ))}
            {active.stages.length === 0 && (
              <div className="text-sm text-white/40">No stages — add one to get started.</div>
            )}
          </div>
        </div>

        {showStageForm && (
          <div className="glass-soft p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Stage name</Label>
              <Input
                value={newStage.name}
                onChange={(e) => setNewStage({ ...newStage, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Color</Label>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {SWATCHES.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setNewStage({ ...newStage, color: c })}
                    style={{ background: c }}
                    className={cn(
                      "size-6 rounded-full border-2",
                      newStage.color === c ? "border-white" : "border-white/10",
                    )}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>Probability %</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={newStage.probability}
                onChange={(e) =>
                  setNewStage({ ...newStage, probability: Number(e.target.value) })
                }
              />
            </div>
            <div className="sm:col-span-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowStageForm(false)}>
                Cancel
              </Button>
              <Button onClick={addStage}>
                <Plus size={12} />
                Add
              </Button>
            </div>
          </div>
        )}

        {/* Stage list (editable) */}
        <div className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden">
          {active.stages.map((s) => {
            const editing = editingStage === s.id;
            return (
              <div key={s.id} className="flex items-center gap-3 p-3">
                <GripVertical size={14} className="text-white/30" />
                {editing ? (
                  <EditStageRow
                    stage={s}
                    onSave={(next) => {
                      updateStage(next);
                      setEditingStage(null);
                    }}
                  />
                ) : (
                  <>
                    <span className="size-3 rounded-full" style={{ background: s.color }} />
                    <span className="text-sm flex-1">{s.name}</span>
                    <div className="w-32 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${s.probability}%`, background: s.color }}
                      />
                    </div>
                    <span className="text-xs text-white/50 w-10 text-right tabular-nums">
                      {s.probability}%
                    </span>
                    <button
                      onClick={() => setEditingStage(s.id)}
                      className="p-1.5 text-white/40 hover:text-white"
                    >
                      <PencilLine size={13} />
                    </button>
                    <button
                      onClick={() => deleteStage(s.id)}
                      className="p-1.5 text-white/40 hover:text-rose-400"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EditStageRow({ stage, onSave }: { stage: Stage; onSave: (s: Stage) => void }) {
  const [s, setS] = useState(stage);
  return (
    <>
      <Input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} className="flex-1" />
      <div className="flex gap-1">
        {SWATCHES.map((c) => (
          <button
            key={c}
            onClick={() => setS({ ...s, color: c })}
            style={{ background: c }}
            className={cn(
              "size-5 rounded-full border-2",
              s.color === c ? "border-white" : "border-white/20",
            )}
          />
        ))}
      </div>
      <Input
        type="number"
        value={s.probability}
        onChange={(e) => setS({ ...s, probability: Number(e.target.value) })}
        className="w-20"
      />
      <Button size="sm" onClick={() => onSave(s)}>
        <Check size={12} />
        Done
      </Button>
    </>
  );
}

// ── Company config ──────────────────────────────────────────────────────────
function CompanyConfig() {
  const [logo, setLogo] = useState<string | null>(null);
  const [header, setHeader] = useState<string | null>(null);
  const [name, setName] = useState("Cases & Co.");
  const [tagline, setTagline] = useState("Modern legal operations.");
  const [mode, setMode] = useState<"dark" | "light">("dark");
  const [accent, setAccent] = useState(SWATCHES[0]);
  const [saved, setSaved] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLInputElement>(null);

  function handleUpload(_ref: unknown, set: (s: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => set(reader.result as string);
      reader.readAsDataURL(file);
    };
  }

  function save() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="space-y-4">
      {/* Branding */}
      <div className="glass-panel p-4 space-y-4">
        <h3 className="font-semibold">Branding</h3>
        <div className="flex flex-wrap gap-5">
          <button
            onClick={() => logoRef.current?.click()}
            className="size-24 rounded-2xl border-2 border-dashed border-white/15 grid place-items-center text-white/40 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] overflow-hidden"
          >
            {logo ? (
              <img src={logo} alt="Logo" className="object-cover w-full h-full" />
            ) : (
              <div className="flex flex-col items-center gap-1">
                <ImageIcon size={20} />
                <span className="text-[10px] uppercase tracking-widest">Logo</span>
              </div>
            )}
          </button>
          <input ref={logoRef} hidden type="file" accept="image/*" onChange={handleUpload(logoRef, setLogo)} />
          <div className="flex-1 min-w-[200px] grid grid-cols-1 gap-3">
            <div>
              <Label>Company name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Tagline</Label>
              <Input value={tagline} onChange={(e) => setTagline(e.target.value)} />
            </div>
          </div>
        </div>
        <div>
          <Label>Header image</Label>
          <button
            onClick={() => headerRef.current?.click()}
            className="w-full h-32 rounded-xl border-2 border-dashed border-white/15 grid place-items-center text-white/40 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] relative overflow-hidden group"
          >
            {header ? (
              <>
                <img src={header} alt="Header" className="object-cover w-full h-full" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 grid place-items-center text-white text-xs">
                  Change image
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload size={20} />
                <span className="text-[10px] uppercase tracking-widest">Upload header</span>
              </div>
            )}
          </button>
          <input ref={headerRef} hidden type="file" accept="image/*" onChange={handleUpload(headerRef, setHeader)} />
        </div>
      </div>

      {/* Appearance */}
      <div className="glass-panel p-4 space-y-4">
        <h3 className="font-semibold">Appearance</h3>
        <div>
          <Label>Color mode</Label>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <button
              onClick={() => setMode("dark")}
              className={cn(
                "p-4 rounded-xl border-2 flex items-center gap-3",
                mode === "dark" ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10" : "border-white/10",
              )}
            >
              <Moon size={20} className="text-[var(--color-primary)]" />
              <span>Dark mode</span>
            </button>
            <button
              onClick={() => setMode("light")}
              className={cn(
                "p-4 rounded-xl border-2 flex items-center gap-3",
                mode === "light" ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10" : "border-white/10",
              )}
            >
              <Sun size={20} className="text-amber-300" />
              <span>Light mode</span>
            </button>
          </div>
        </div>
        <div>
          <Label>Primary accent</Label>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => setAccent(c)}
                style={{ background: c }}
                className={cn(
                  "size-8 rounded-full border-2",
                  accent === c ? "border-white scale-110" : "border-white/10",
                )}
              />
            ))}
            <label className="text-xs text-white/60 inline-flex items-center gap-2 ml-2">
              <span>Custom</span>
              <input
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
                className="size-8 rounded-md bg-transparent border border-white/10"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
            <Check size={14} />
            Saved
          </span>
        )}
        <Button onClick={save}>Save configuration</Button>
      </div>
    </div>
  );
}