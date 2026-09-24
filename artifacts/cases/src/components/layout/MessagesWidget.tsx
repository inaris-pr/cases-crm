import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  MessageSquare,
  Send,
  X,
  Minus,
  UserPlus,
  Users,
  Hash,
  Search,
  ChevronLeft,
  FolderOpen,
  Trash2,
  AtSign,
  ExternalLink,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { API, fetchJson } from "@/lib/api";
import type { Case, Conversation, Mention, Message } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { can } from "@cases/access";

/** @deprecated — use `useAuth().user.name` instead. Kept as a fallback when
 *  no user is signed in (e.g. on the login page) so older code paths don't
 *  crash. */
export const MY_NAME = "You";

type Inbox = "dms" | "tags";

export function MessagesWidget() {
  const { user } = useAuth();
  const myName = user?.name ?? MY_NAME;
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [inbox, setInbox] = useState<Inbox>("dms");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [selectedCaseTags, setSelectedCaseTags] = useState<number[]>([]);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on route change so the widget doesn't linger as you navigate around.
  useEffect(() => {
    setOpen(false);
    setActiveId(null);
  }, [location]);

  // Close on click outside (ignoring the toggle button so its own click handler
  // still flips state correctly).
  useEffect(() => {
    if (!open || minimized) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (toggleRef.current?.contains(t)) return;
      setOpen(false);
      setActiveId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, minimized]);
  const [showCasePicker, setShowCasePicker] = useState(false);
  const [composer, setComposer] = useState<null | "dm" | "group">(null);
  const [composerName, setComposerName] = useState("");
  const [composerSelected, setComposerSelected] = useState<string[]>([]);

  const qc = useQueryClient();
  const canTagCases = can(useAuth().permissions, "cases.view");

  const convosQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => fetchJson<Conversation[]>(API("/api/conversations")),
    enabled: open,
  });

  const mentionsQuery = useQuery({
    queryKey: ["mentions", myName],
    queryFn: () =>
      fetchJson<Mention[]>(API(`/api/mentions?for=${encodeURIComponent(myName)}`)),
    // Always poll mentions (even when widget is closed) so the unread badge
    // on the toggle button stays accurate.
    refetchInterval: 30_000,
  });

  // Team roster — drives the composer's member picker so users can only pick
  // teammates that actually exist on the platform.
  const teamQuery = useQuery({
    queryKey: ["team"],
    queryFn: () => fetchJson<string[]>(API("/api/team")),
    enabled: open,
  });

  const unreadTags = useMemo(
    () => (mentionsQuery.data ?? []).filter((m) => !m.readAt).length,
    [mentionsQuery.data],
  );

  const markMentionRead = useMutation({
    mutationFn: (id: number) =>
      fetchJson<Mention>(API(`/api/mentions/${id}/read`), { method: "PATCH" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mentions"] }),
  });

  const messagesQuery = useQuery({
    queryKey: ["messages", activeId],
    queryFn: () =>
      activeId
        ? fetchJson<Message[]>(API(`/api/conversations/${activeId}/messages`))
        : Promise.resolve([] as Message[]),
    enabled: !!activeId && open,
  });

  const casesQuery = useQuery({
    queryKey: ["cases", "for-tagging"],
    queryFn: () => fetchJson<Case[]>(API("/api/cases")),
    enabled: showCasePicker && canTagCases,
  });

  const sendMessage = useMutation({
    mutationFn: (vars: { conversationId: number; content: string; caseTags: number[] }) =>
      fetchJson<Message>(API(`/api/conversations/${vars.conversationId}/messages`), {
        method: "POST",
        body: JSON.stringify({
          senderName: myName,
          content: vars.content,
          caseTags: vars.caseTags,
        }),
      }),
    onSuccess: () => {
      setInput("");
      setSelectedCaseTags([]);
      qc.invalidateQueries({ queryKey: ["messages", activeId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const deleteMessage = useMutation({
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
    onSuccess: (convo) => {
      setComposer(null);
      setComposerName("");
      setComposerSelected([]);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      setActiveId(convo.id);
    },
  });

  // Auto-scroll to bottom on new messages
  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messagesQuery.data?.length, activeId]);

  // Filtered conversation list
  const filteredConvos = useMemo(() => {
    const all = convosQuery.data ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((c) => {
      const title = displayName(c, myName);
      return (
        title.toLowerCase().includes(q) ||
        (c.lastMessage ?? "").toLowerCase().includes(q)
      );
    });
  }, [convosQuery.data, search]);

  const activeConvo = convosQuery.data?.find((c) => c.id === activeId) ?? null;

  function handleSend() {
    if (!input.trim() || !activeId) return;
    sendMessage.mutate({
      conversationId: activeId,
      content: input.trim(),
      caseTags: selectedCaseTags,
    });
  }

  function handleNewDm() {
    if (composerSelected.length !== 1) return;
    const members = [myName, ...composerSelected];
    createConversation.mutate({ type: "dm", members });
  }

  function handleNewGroup() {
    if (!composerName.trim() || composerSelected.length < 1) return;
    const members = [myName, ...composerSelected];
    createConversation.mutate({ type: "group", name: composerName.trim(), members });
  }

  // Toggle a teammate in the composer selection. For DMs, picking a person
  // replaces the selection (DM is 1:1). For groups, it adds/removes.
  function toggleComposerMember(name: string) {
    if (composer === "dm") {
      setComposerSelected((cur) => (cur[0] === name ? [] : [name]));
    } else {
      setComposerSelected((cur) =>
        cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name],
      );
    }
  }

  const hasUnread = unreadTags > 0;

  return (
    <>
      {/* Toggle button */}
      <motion.button
        ref={toggleRef}
        onClick={() => {
          setOpen((o) => !o);
          setMinimized(false);
        }}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-6 right-6 z-40 size-12 rounded-full grid place-items-center bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-[0_0_30px_rgba(41,243,18,0.4)] hover:brightness-110"
        aria-label="Messages"
      >
        <MessageSquare size={20} />
        {hasUnread && (
          <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-emerald-400 border-2 border-[var(--color-background)] animate-pulse" />
        )}
      </motion.button>

      <AnimatePresence>
        {open && !minimized ? (
          <motion.div
            key="panel"
            ref={panelRef}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed bottom-24 right-6 z-40 glass-panel neon-border flex flex-col overflow-hidden"
            style={{ width: 680, height: 480 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-12 border-b border-white/5">
              <div className="flex items-center gap-2">
                {inbox === "dms" && activeId ? (
                  <button
                    onClick={() => setActiveId(null)}
                    className="size-7 grid place-items-center rounded-md text-white/60 hover:text-white hover:bg-white/5"
                    aria-label="Back"
                  >
                    <ChevronLeft size={16} />
                  </button>
                ) : null}
                <h3 className="text-sm font-semibold tracking-tight">
                  {inbox === "dms" && activeConvo
                    ? displayName(activeConvo, myName)
                    : "Messages"}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                {inbox === "dms" && (
                  <>
                    <IconBtn
                      title="New DM"
                      onClick={() => {
                        setActiveId(null);
                        setComposer("dm");
                        setComposerSelected([]);
                        setComposerName("");
                      }}
                    >
                      <UserPlus size={15} />
                    </IconBtn>
                    <IconBtn
                      title="New Group"
                      onClick={() => {
                        setActiveId(null);
                        setComposer("group");
                        setComposerSelected([]);
                        setComposerName("");
                      }}
                    >
                      <Users size={15} />
                    </IconBtn>
                  </>
                )}
                <IconBtn title="Minimize" onClick={() => setMinimized(true)}>
                  <Minus size={15} />
                </IconBtn>
                <IconBtn title="Close" onClick={() => setOpen(false)}>
                  <X size={15} />
                </IconBtn>
              </div>
            </div>

            {/* Inbox tabs */}
            <div className="flex items-center gap-0 px-2 border-b border-white/5">
              <InboxTab
                active={inbox === "dms"}
                onClick={() => {
                  setInbox("dms");
                  setActiveId(null);
                }}
                icon={MessageSquare}
                label="DMs"
              />
              <InboxTab
                active={inbox === "tags"}
                onClick={() => {
                  setInbox("tags");
                  setActiveId(null);
                }}
                icon={AtSign}
                label="Tags"
                badge={unreadTags}
              />
            </div>

            {inbox === "tags" ? (
              <TagsInbox
                mentions={mentionsQuery.data ?? []}
                onMarkRead={(id) => markMentionRead.mutate(id)}
              />
            ) : (
            <div className="flex-1 flex overflow-hidden">
              {/* Conversation list */}
              <motion.div
                animate={{ width: activeId ? 0 : 224 }}
                transition={{ duration: 0.2 }}
                className="border-r border-white/5 flex flex-col overflow-hidden shrink-0"
              >
                <div className="p-3 space-y-2">
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40"
                    />
                    <input
                      placeholder="Search…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full bg-[var(--color-input)] rounded-md pl-8 pr-2.5 h-8 text-xs text-white placeholder:text-white/30 focus-ring border border-white/5"
                    />
                  </div>

                  {composer && (
                    <div className="p-2 rounded-md border border-white/10 bg-white/5 space-y-2">
                      <div className="text-[10px] tracking-widest uppercase text-white/40">
                        {composer === "dm" ? "New DM" : "New group"}
                      </div>
                      {composer === "group" && (
                        <input
                          value={composerName}
                          onChange={(e) => setComposerName(e.target.value)}
                          placeholder="Group name"
                          className="w-full bg-black/30 rounded px-2 py-1 text-xs border border-white/10 focus-ring"
                        />
                      )}
                      <div className="space-y-1">
                        <div className="text-[9px] tracking-widest uppercase text-white/35">
                          {composer === "dm"
                            ? "Pick a teammate"
                            : "Pick teammates"}
                        </div>
                        <div className="max-h-32 overflow-y-auto rounded border border-white/5 bg-black/20 divide-y divide-white/5">
                          {(teamQuery.data ?? [])
                            .filter((n) => n !== myName)
                            .map((n) => {
                              const checked = composerSelected.includes(n);
                              return (
                                <label
                                  key={n}
                                  className={cn(
                                    "flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer transition-colors",
                                    checked
                                      ? "bg-[var(--color-primary)]/10 text-white"
                                      : "text-white/75 hover:bg-white/5",
                                  )}
                                >
                                  <input
                                    type={composer === "dm" ? "radio" : "checkbox"}
                                    name="composer-member"
                                    checked={checked}
                                    onChange={() => toggleComposerMember(n)}
                                    className="accent-[var(--color-primary)]"
                                  />
                                  <Avatar name={n} size={20} />
                                  <span className="truncate">{n}</span>
                                </label>
                              );
                            })}
                          {(teamQuery.data ?? []).filter((n) => n !== myName)
                            .length === 0 && (
                            <div className="text-[11px] text-white/30 text-center py-3">
                              No teammates available
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={composer === "dm" ? handleNewDm : handleNewGroup}
                          disabled={
                            composer === "dm"
                              ? composerSelected.length !== 1
                              : composerSelected.length < 1 ||
                                !composerName.trim()
                          }
                          className="flex-1 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-xs font-semibold rounded px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Create
                        </button>
                        <button
                          onClick={() => {
                            setComposer(null);
                            setComposerSelected([]);
                            setComposerName("");
                          }}
                          className="bg-white/5 text-white/70 text-xs rounded px-2 py-1"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
                  {filteredConvos.length === 0 && !convosQuery.isLoading ? (
                    <div className="text-xs text-white/30 text-center px-4 py-8">
                      No conversations yet
                    </div>
                  ) : null}
                  {filteredConvos.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveId(c.id)}
                      className={cn(
                        "w-full text-left rounded-md px-2 py-2 flex items-center gap-2 transition-colors",
                        activeId === c.id
                          ? "bg-white/5 border-r-2 border-[var(--color-primary)]"
                          : "hover:bg-white/5",
                      )}
                    >
                      {c.type === "group" ? (
                        <div className="size-8 rounded-full bg-purple-500/20 text-purple-300 grid place-items-center shrink-0">
                          <Hash size={14} />
                        </div>
                      ) : (
                        <Avatar name={displayName(c, myName)} size={32} />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-white truncate flex items-center gap-1">
                          {displayName(c, myName)}
                        </div>
                        <div className="text-[11px] text-white/40 truncate">
                          {c.lastMessage ?? "No messages yet"}
                        </div>
                      </div>
                      {c.lastMessageAt && (
                        <div className="text-[10px] text-white/30 shrink-0">
                          {formatRelative(c.lastMessageAt)}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>

              {/* Thread */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {!activeId ? (
                  <div className="flex-1 grid place-items-center text-white/40 text-xs px-6 text-center">
                    Select a conversation to start messaging.
                  </div>
                ) : (
                  <>
                    {/* Per-DM Tags button — only for DMs, scoped to the other participant */}
                    {activeConvo && activeConvo.type === "dm" && (
                      <DmTagsBar
                        otherName={
                          activeConvo.members.find((m) => m !== myName) ?? ""
                        }
                        mentions={(mentionsQuery.data ?? []).filter(
                          (m) =>
                            m.toName === myName &&
                            m.fromName ===
                              activeConvo.members.find((mm) => mm !== myName),
                        )}
                      />
                    )}
                    <div
                      ref={threadRef}
                      className="flex-1 overflow-y-auto p-4 space-y-3"
                    >
                      <MessageList
                        messages={messagesQuery.data ?? []}
                        onDelete={(id) => deleteMessage.mutate(id)}
                        me={myName}
                      />
                    </div>
                    <Composer
                      input={input}
                      setInput={setInput}
                      onSend={handleSend}
                      selectedCaseTags={selectedCaseTags}
                      setSelectedCaseTags={setSelectedCaseTags}
                      showCasePicker={showCasePicker}
                      setShowCasePicker={setShowCasePicker}
                      cases={casesQuery.data ?? []}
                      sending={sendMessage.isPending}
                      canTagCases={canTagCases}
                    />
                  </>
                )}
              </div>
            </div>
            )}
          </motion.div>
        ) : null}

        {/* Minimized pill */}
        {open && minimized ? (
          <motion.button
            key="pill"
            onClick={() => setMinimized(false)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-24 right-6 z-40 glass-panel px-4 h-10 flex items-center gap-2 text-xs font-semibold neon-border"
          >
            <MessageSquare size={14} className="text-[var(--color-primary)]" />
            Messages
            {activeConvo && (
              <span className="text-white/60">· {displayName(activeConvo, myName)}</span>
            )}
          </motion.button>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="size-7 grid place-items-center rounded-md text-white/60 hover:text-white hover:bg-white/5"
    >
      {children}
    </button>
  );
}

/**
 * Slim header bar inside a DM thread. Renders a small "Tags" pill showing
 * the count of mentions where `fromName === otherName` and the recipient is
 * the signed-in user. Click toggles a popover listing those mentions, each
 * linking to its case.
 */
function DmTagsBar({
  otherName,
  mentions,
}: {
  otherName: string;
  mentions: Mention[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const unread = mentions.filter((m) => !m.readAt).length;
  const hasAny = mentions.length > 0;

  return (
    <div
      ref={ref}
      className="relative flex items-center justify-end border-b border-white/5 px-3 py-1.5"
    >
      <button
        onClick={() => hasAny && setOpen((v) => !v)}
        disabled={!hasAny}
        className={cn(
          "inline-flex items-center gap-1 h-6 px-2 rounded-md border text-[10px] font-semibold tracking-wide uppercase transition",
          hasAny
            ? "border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20"
            : "border-white/5 bg-white/[0.03] text-white/30 cursor-default",
        )}
        title={
          hasAny
            ? `${mentions.length} tag${mentions.length === 1 ? "" : "s"} from ${otherName}`
            : `No tags from ${otherName}`
        }
      >
        <AtSign size={10} />
        Tags
        {mentions.length > 0 && (
          <span className="ml-0.5 text-[9px] tabular-nums px-1 rounded-full bg-[var(--color-primary)]/25">
            {mentions.length}
          </span>
        )}
        {unread > 0 && (
          <span className="ml-0.5 size-1.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_6px_rgba(41,243,18,0.7)]" />
        )}
      </button>
      {open && hasAny && (
        <div className="absolute right-3 top-full mt-1 w-72 glass-panel border border-white/10 rounded-lg shadow-xl z-30 max-h-80 overflow-y-auto">
          <div className="px-3 py-2 border-b border-white/5">
            <div className="text-[10px] uppercase tracking-widest text-white/40">
              Tags from
            </div>
            <div className="text-xs font-semibold text-white">{otherName}</div>
          </div>
          <div className="p-1.5 space-y-1">
            {mentions.map((m) => (
              <Link key={m.id} href={m.caseId ? `/cases/${m.caseId}` : "#"}>
                <a
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block p-2 rounded-md transition-colors",
                    !m.readAt
                      ? "bg-[var(--color-primary)]/8 border border-[var(--color-primary)]/25 hover:bg-[var(--color-primary)]/14"
                      : "hover:bg-white/5 border border-white/5",
                  )}
                >
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="font-mono text-[var(--color-primary)] uppercase tracking-wider">
                      {m.caseNumber ?? "—"}
                    </span>
                    <span className="ml-auto text-white/35">
                      {formatRelative(m.createdAt)}
                    </span>
                  </div>
                  <div className="text-[12px] text-white/85 mt-0.5 line-clamp-2">
                    {m.body}
                  </div>
                  {m.caseTitle && (
                    <div className="text-[10px] text-white/35 mt-0.5 truncate">
                      in "{m.caseTitle}"
                    </div>
                  )}
                </a>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InboxTab({
  active,
  onClick,
  icon: Icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  label: string;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-xs -mb-px border-b-2 flex items-center gap-1.5 transition-colors",
        active
          ? "border-[var(--color-primary)] text-white font-semibold"
          : "border-transparent text-white/50 hover:text-white",
      )}
    >
      <Icon size={12} />
      {label}
      {badge ? (
        <span className="ml-0.5 text-[10px] tabular-nums px-1.5 rounded-full bg-[var(--color-primary)]/20 text-[var(--color-primary)]">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function TagsInbox({
  mentions,
  onMarkRead,
}: {
  mentions: Mention[];
  onMarkRead: (id: number) => void;
}) {
  if (mentions.length === 0) {
    return (
      <div className="flex-1 grid place-items-center text-center px-6 py-10">
        <div>
          <AtSign size={20} className="mx-auto text-white/30 mb-2" />
          <div className="text-xs text-white/60 font-semibold">
            No tags yet
          </div>
          <div className="text-[11px] text-white/35 mt-0.5">
            You'll see notifications here when a teammate @-tags you in a case
            thread.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
      {mentions.map((m) => (
        <Link
          key={m.id}
          href={m.caseId ? `/cases/${m.caseId}` : "#"}
        >
          <a
            onClick={() => !m.readAt && onMarkRead(m.id)}
            className={cn(
              "flex items-start gap-2.5 p-2.5 rounded-md transition-colors",
              !m.readAt
                ? "bg-[var(--color-primary)]/8 border border-[var(--color-primary)]/25 hover:bg-[var(--color-primary)]/12"
                : "hover:bg-white/5 border border-white/5",
            )}
          >
            <Avatar name={m.fromName} size={32} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="font-semibold text-white truncate">
                  {m.fromName}
                </span>
                <span className="text-white/30">·</span>
                <span className="font-mono text-[10px] text-[var(--color-primary)] uppercase tracking-wider">
                  {m.caseNumber ?? "—"}
                </span>
                <span className="ml-auto text-white/35 shrink-0">
                  {formatRelative(m.createdAt)}
                </span>
              </div>
              <div className="text-[12px] text-white/85 mt-0.5 line-clamp-2">
                {m.body}
              </div>
              {m.caseTitle && (
                <div className="text-[10px] text-white/35 mt-0.5 truncate">
                  in "{m.caseTitle}"
                </div>
              )}
            </div>
            {!m.readAt && (
              <span
                className="size-2 rounded-full bg-[var(--color-primary)] shrink-0 mt-2 shadow-[0_0_8px_rgba(41,243,18,0.6)]"
                title="Unread"
              />
            )}
          </a>
        </Link>
      ))}
    </div>
  );
}

function displayName(c: Conversation, me: string): string {
  if (c.name) return c.name;
  const other = c.members.find((m) => m !== me);
  return other ?? "Direct message";
}

function MessageList({
  messages,
  onDelete,
  me,
}: {
  messages: Message[];
  onDelete: (id: number) => void;
  me: string;
}) {
  if (!messages.length) {
    return (
      <div className="text-xs text-white/40 text-center py-6">
        No messages yet — say hello.
      </div>
    );
  }
  // Group consecutive messages by sender
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
          <div
            key={gi}
            className={cn(
              "flex flex-col gap-1",
              isMe ? "items-end" : "items-start",
            )}
          >
            <div className="text-[10px] uppercase tracking-widest text-white/40 mb-0.5">
              {g.sender}
            </div>
            {g.items.map((m) => {
              const isDeleted = !!m.deletedAt;
              return (
                <div key={m.id} className="group max-w-[80%] flex items-center gap-2">
                  {isMe && !isDeleted && (
                    <button
                      onClick={() => onDelete(m.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md text-white/40 hover:text-red-400 hover:bg-red-500/10"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm",
                      isMe
                        ? "bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 text-white"
                        : "bg-white/5 border border-white/10 text-white/90",
                    )}
                  >
                    {isDeleted ? (
                      <span className="italic text-white/40">message deleted</span>
                    ) : (
                      <>
                        <div className="whitespace-pre-wrap break-words">{m.content}</div>
                        {m.caseTags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {m.caseTags.map((tag) => (
                              <Link key={tag.id} href={`/cases/${tag.id}`}>
                                <a className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 text-[var(--color-primary)] text-[10px] font-mono">
                                  {tag.caseNumber}
                                </a>
                              </Link>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <span className="text-[10px] text-white/30 shrink-0">
                    {formatRelative(m.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function Composer({
  input,
  setInput,
  onSend,
  selectedCaseTags,
  setSelectedCaseTags,
  showCasePicker,
  setShowCasePicker,
  cases,
  sending,
  canTagCases,
}: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  selectedCaseTags: number[];
  setSelectedCaseTags: (v: number[]) => void;
  showCasePicker: boolean;
  setShowCasePicker: (v: boolean) => void;
  cases: Case[];
  sending: boolean;
  /** Only employees who can view cases can tag them (RBAC Phase 5). */
  canTagCases: boolean;
}) {
  return (
    <div className="border-t border-white/5 p-3 space-y-2">
      {selectedCaseTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedCaseTags.map((id) => {
            const c = cases.find((x) => x.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--color-primary)]/15 text-[var(--color-primary)] text-[10px] font-mono"
              >
                {c?.caseNumber ?? `#${id}`}
                <button
                  onClick={() => setSelectedCaseTags(selectedCaseTags.filter((x) => x !== id))}
                  className="text-white/40 hover:text-white"
                >
                  <X size={10} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="flex items-end gap-2">
        {canTagCases && (<div className="relative">
          <button
            type="button"
            onClick={() => setShowCasePicker(!showCasePicker)}
            className="size-9 grid place-items-center rounded-md bg-white/5 hover:bg-white/10 text-white/60"
            title="Tag a case"
          >
            <FolderOpen size={15} />
          </button>
          {showCasePicker && (
            <div className="absolute bottom-11 left-0 w-56 glass-panel max-h-56 overflow-y-auto p-1 z-10">
              {cases.length === 0 ? (
                <div className="text-xs text-white/40 px-2 py-1.5">No cases</div>
              ) : (
                cases.map((c) => {
                  const checked = selectedCaseTags.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        if (checked) setSelectedCaseTags(selectedCaseTags.filter((x) => x !== c.id));
                        else setSelectedCaseTags([...selectedCaseTags, c.id]);
                      }}
                      className={cn(
                        "w-full text-left text-xs px-2 py-1.5 rounded-md flex items-center gap-2",
                        checked ? "bg-[var(--color-primary)]/10" : "hover:bg-white/5",
                      )}
                    >
                      <span className="font-mono text-white/60 w-16 shrink-0">{c.caseNumber}</span>
                      <span className="truncate">{c.title}</span>
                      {checked && (
                        <span className="ml-auto size-2 rounded-full bg-[var(--color-primary)]" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>)}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 resize-none bg-[var(--color-input)] border border-white/10 rounded-md px-3 py-2 text-sm placeholder:text-white/30 focus-ring max-h-32"
        />
        <button
          onClick={onSend}
          disabled={!input.trim() || sending}
          className="size-9 grid place-items-center rounded-md bg-[var(--color-primary)] text-[var(--color-primary-foreground)] disabled:opacity-40"
          title="Send"
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
