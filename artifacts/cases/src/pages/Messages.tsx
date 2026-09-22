import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Search,
  UserPlus,
  Users,
  Hash,
  FolderOpen,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "wouter";
import { API, fetchJson } from "@/lib/api";
import type { Case, Conversation, Message } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";
import { MY_NAME } from "@/components/layout/MessagesWidget";

export function Messages() {
  const { user } = useAuth();
  const myName = user?.name ?? MY_NAME;
  const [activeId, setActiveId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [showCasePicker, setShowCasePicker] = useState(false);
  const [selectedCaseTags, setSelectedCaseTags] = useState<number[]>([]);
  const [composer, setComposer] = useState<null | "dm" | "group">(null);
  const [composerName, setComposerName] = useState("");
  const [composerMembers, setComposerMembers] = useState("");

  const qc = useQueryClient();
  const convosQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchJson<Conversation[]>(API("/api/conversations")),
  });
  const messagesQuery = useQuery({
    queryKey: ["messages", activeId],
    queryFn: () =>
      activeId
        ? fetchJson<Message[]>(API(`/api/conversations/${activeId}/messages`))
        : Promise.resolve([] as Message[]),
    enabled: !!activeId,
  });
  const casesQuery = useQuery({
    queryKey: ["cases", "for-tagging"],
    queryFn: () => fetchJson<Case[]>(API("/api/cases")),
    enabled: showCasePicker,
  });

  const send = useMutation({
    mutationFn: () =>
      fetchJson<Message>(API(`/api/conversations/${activeId}/messages`), {
        method: "POST",
        body: JSON.stringify({ senderName: myName, content: input.trim(), caseTags: selectedCaseTags }),
      }),
    onSuccess: () => {
      setInput("");
      setSelectedCaseTags([]);
      qc.invalidateQueries({ queryKey: ["messages", activeId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const deleteMsg = useMutation({
    mutationFn: (id: number) =>
      fetchJson<void>(API(`/api/messages/${id}`), {
        method: "DELETE",
        body: JSON.stringify({ senderName: myName }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages", activeId] }),
  });

  const createConversation = useMutation({
    mutationFn: (vars: { type: "dm" | "group"; name?: string; members: string[] }) =>
      fetchJson<Conversation>(API("/api/conversations"), {
        method: "POST",
        body: JSON.stringify(vars),
      }),
    onSuccess: (c) => {
      setComposer(null);
      setComposerName("");
      setComposerMembers("");
      qc.invalidateQueries({ queryKey: ["conversations"] });
      setActiveId(c.id);
    },
  });

  const filtered = useMemo(() => {
    const all = convosQuery.data ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((c) => {
      const t = displayName(c, myName);
      return t.toLowerCase().includes(q) || (c.lastMessage ?? "").toLowerCase().includes(q);
    });
  }, [convosQuery.data, search]);

  const active = convosQuery.data?.find((c) => c.id === activeId) ?? null;
  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messagesQuery.data?.length, activeId]);

  return (
    <div className="space-y-3">
      <div>
        <div className="label-eyebrow mb-1">Messages</div>
        <h1 className="text-xl font-bold tracking-tight">Conversations</h1>
        <p className="text-xs text-white/50 mt-0.5">Full-page view of your message history.</p>
      </div>

      <div className="glass-panel flex h-[640px] overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 border-r border-white/5 flex flex-col">
          <div className="p-3 border-b border-white/5 flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <button
              onClick={() => setComposer("dm")}
              className="size-8 grid place-items-center rounded-md bg-white/5 hover:bg-white/10 text-white/70"
              title="New DM"
            >
              <UserPlus size={14} />
            </button>
            <button
              onClick={() => setComposer("group")}
              className="size-8 grid place-items-center rounded-md bg-white/5 hover:bg-white/10 text-white/70"
              title="New group"
            >
              <Users size={14} />
            </button>
          </div>

          {composer && (
            <div className="p-3 border-b border-white/5 space-y-2 bg-white/[0.02]">
              <div className="label-eyebrow">{composer === "dm" ? "New DM" : "New group"}</div>
              {composer === "group" && (
                <Input
                  placeholder="Group name"
                  value={composerName}
                  onChange={(e) => setComposerName(e.target.value)}
                />
              )}
              <Input
                placeholder="Members, comma separated"
                value={composerMembers}
                onChange={(e) => setComposerMembers(e.target.value)}
              />
              <div className="flex gap-1.5">
                <Button
                  className="flex-1"
                  onClick={() => {
                    const members = [
                      myName,
                      ...composerMembers.split(",").map((m) => m.trim()).filter(Boolean),
                    ];
                    if (composer === "dm" && composerMembers.trim()) {
                      createConversation.mutate({ type: "dm", members });
                    } else if (composer === "group" && composerName.trim() && composerMembers.trim()) {
                      createConversation.mutate({ type: "group", name: composerName.trim(), members });
                    }
                  }}
                  size="sm"
                >
                  Create
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setComposer(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={cn(
                  "w-full text-left rounded-md px-2.5 py-2 flex items-center gap-2",
                  activeId === c.id
                    ? "bg-white/5 border-r-2 border-[var(--color-primary)]"
                    : "hover:bg-white/5",
                )}
              >
                {c.type === "group" ? (
                  <div className="size-9 rounded-full bg-purple-500/20 text-purple-300 grid place-items-center shrink-0">
                    <Hash size={14} />
                  </div>
                ) : (
                  <Avatar name={displayName(c, myName)} size={36} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{displayName(c, myName)}</div>
                  <div className="text-xs text-white/40 truncate">{c.lastMessage ?? "—"}</div>
                </div>
                {c.lastMessageAt && (
                  <span className="text-[10px] text-white/30">{formatRelative(c.lastMessageAt)}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Thread */}
        <div className="flex-1 flex flex-col">
          {!activeId ? (
            <div className="flex-1 grid place-items-center text-white/40 text-sm">
              Select a conversation to begin.
            </div>
          ) : (
            <>
              <div className="border-b border-white/5 px-5 h-14 flex items-center gap-3">
                {active?.type === "group" ? (
                  <div className="size-9 rounded-full bg-purple-500/20 text-purple-300 grid place-items-center">
                    <Hash size={14} />
                  </div>
                ) : (
                  <Avatar name={active ? displayName(active, myName) : "?"} size={36} />
                )}
                <div className="min-w-0">
                  <div className="font-semibold">{active ? displayName(active, myName) : ""}</div>
                  <div className="text-xs text-white/50 truncate">
                    {active?.members.join(", ")}
                  </div>
                </div>
              </div>
              <div ref={threadRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                <MessageList messages={messagesQuery.data ?? []} onDelete={(id) => deleteMsg.mutate(id)} me={myName} />
              </div>
              <div className="border-t border-white/5 p-3 space-y-2">
                {selectedCaseTags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedCaseTags.map((id) => {
                      const c = casesQuery.data?.find((x) => x.id === id);
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] text-[10px] font-mono"
                        >
                          {c?.caseNumber ?? `#${id}`}
                          <button
                            onClick={() => setSelectedCaseTags(selectedCaseTags.filter((x) => x !== id))}
                          >
                            <X size={10} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <div className="relative">
                    <button
                      onClick={() => setShowCasePicker(!showCasePicker)}
                      className="size-10 grid place-items-center rounded-md bg-white/5 hover:bg-white/10 text-white/60"
                    >
                      <FolderOpen size={15} />
                    </button>
                    {showCasePicker && (
                      <div className="absolute bottom-12 left-0 w-64 glass-panel max-h-72 overflow-y-auto p-1 z-10">
                        {(casesQuery.data ?? []).map((c) => {
                          const checked = selectedCaseTags.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              onClick={() => {
                                if (checked)
                                  setSelectedCaseTags(selectedCaseTags.filter((x) => x !== c.id));
                                else setSelectedCaseTags([...selectedCaseTags, c.id]);
                              }}
                              className={cn(
                                "w-full text-left text-xs px-2 py-1.5 rounded-md flex items-center gap-2",
                                checked ? "bg-[var(--color-primary)]/10" : "hover:bg-white/5",
                              )}
                            >
                              <span className="font-mono text-white/60 w-16 shrink-0">{c.caseNumber}</span>
                              <span className="truncate">{c.title}</span>
                              {checked && <span className="ml-auto size-2 rounded-full bg-[var(--color-primary)]" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (input.trim()) send.mutate();
                      }
                    }}
                    rows={1}
                    placeholder="Type a message…"
                    className="flex-1 resize-none bg-[var(--color-input)] border border-white/10 rounded-md px-3 py-2 text-sm placeholder:text-white/30 focus-ring max-h-32"
                  />
                  <Button onClick={() => input.trim() && send.mutate()} disabled={!input.trim() || send.isPending}>
                    <Send size={14} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function displayName(c: Conversation, me: string) {
  if (c.name) return c.name;
  const other = c.members.find((m) => m !== me);
  return other ?? "Direct message";
}

function MessageList({ messages, onDelete, me }: { messages: Message[]; onDelete: (id: number) => void; me: string }) {
  if (!messages.length)
    return <div className="text-sm text-white/40 text-center py-8">No messages yet.</div>;
  const groups: { sender: string; items: Message[] }[] = [];
  for (const m of messages) {
    const last = groups[groups.length - 1];
    if (last && last.sender === m.senderName) last.items.push(m);
    else groups.push({ sender: m.senderName, items: [m] });
  }
  return (
    <>
      {groups.map((g, gi) => {
        const isMe = g.sender === me;
        return (
          <div key={gi} className={cn("flex flex-col gap-1", isMe ? "items-end" : "items-start")}>
            <div className="text-[10px] uppercase tracking-widest text-white/40">{g.sender}</div>
            {g.items.map((m) => {
              const isDeleted = !!m.deletedAt;
              return (
                <div key={m.id} className="group max-w-[70%] flex items-center gap-2">
                  {isMe && !isDeleted && (
                    <button
                      onClick={() => onDelete(m.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-white/40 hover:text-rose-400 hover:bg-rose-500/10"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2 text-sm",
                      isMe
                        ? "bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 text-white"
                        : "bg-white/5 border border-white/10 text-white/90",
                    )}
                  >
                    {isDeleted ? (
                      <span className="italic text-white/40">message deleted</span>
                    ) : (
                      <>
                        <div className="whitespace-pre-wrap">{m.content}</div>
                        {m.caseTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {m.caseTags.map((t) => (
                              <Link key={t.id} href={`/cases/${t.id}`}>
                                <a className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 text-[var(--color-primary)] text-[10px] font-mono">
                                  {t.caseNumber}
                                </a>
                              </Link>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <span className="text-[10px] text-white/30">{formatRelative(m.createdAt)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}
