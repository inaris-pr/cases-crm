import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { API, fetchJson } from "@/lib/api";
import { cn } from "@/lib/cn";

/**
 * Render a thread body with @mentions highlighted as green pills.
 * Splits the body on @-tokens and decorates each one.
 */
export function renderMentions(
  body: string,
  team: string[],
): (string | { kind: "mention"; name: string })[] {
  const out: (string | { kind: "mention"; name: string })[] = [];
  let cursor = 0;
  // Build a regex that matches @ followed by any team-member name/first name.
  // Longest match first to prefer "@Devon Park" over "@Devon".
  const candidates = Array.from(
    new Set(team.flatMap((m) => [m, m.split(" ")[0]])),
  ).sort((a, b) => b.length - a.length);
  if (candidates.length === 0) return [body];
  const pattern = candidates
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const re = new RegExp(`@(${pattern})(?![A-Za-z0-9])`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > cursor) out.push(body.slice(cursor, m.index));
    const matchedForm = m[1];
    // Resolve to full member name (so "@Devon" → "Devon Park")
    const full =
      team.find((t) => t.toLowerCase() === matchedForm.toLowerCase()) ??
      team.find(
        (t) => t.split(" ")[0].toLowerCase() === matchedForm.toLowerCase(),
      ) ??
      matchedForm;
    out.push({ kind: "mention", name: full });
    cursor = m.index + m[0].length;
  }
  if (cursor < body.length) out.push(body.slice(cursor));
  return out;
}

/** Render the segmented body as React children. */
export function MentionBody({ body }: { body: string }) {
  const team = useTeam();
  const segments = useMemo(() => renderMentions(body, team), [body, team]);
  return (
    <>
      {segments.map((seg, i) =>
        typeof seg === "string" ? (
          <span key={i}>{seg}</span>
        ) : (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-px rounded-md bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/30 text-[var(--color-primary)] font-medium text-[12px] mx-0.5"
          >
            @{seg.name}
          </span>
        ),
      )}
    </>
  );
}

export function useTeam() {
  const q = useQuery({
    queryKey: ["team"],
    queryFn: () => fetchJson<string[]>(API("/api/team")),
    staleTime: 5 * 60_000,
  });
  return q.data ?? [];
}

/**
 * A textarea that pops up an @-mention autocomplete when the user types '@'.
 * Calls `onChange` with the textarea value as a normal controlled input.
 */
export function MentionTextarea({
  value,
  onChange,
  onSubmit,
  rows = 3,
  placeholder,
  excludeName,
  className,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  rows?: number;
  placeholder?: string;
  /** Don't suggest this name (e.g. the author). */
  excludeName?: string;
  className?: string;
} & Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "onSubmit"
>) {
  const team = useTeam();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tokenStart, setTokenStart] = useState(-1);
  const [activeIdx, setActiveIdx] = useState(0);

  const suggestions = useMemo(() => {
    if (!menuOpen) return [];
    const q = query.toLowerCase();
    return team
      .filter((m) => m !== excludeName)
      .filter(
        (m) =>
          !q ||
          m.toLowerCase().includes(q) ||
          m.split(" ")[0].toLowerCase().startsWith(q),
      )
      .slice(0, 6);
  }, [team, query, excludeName, menuOpen]);

  function updateMentionState(text: string, caret: number) {
    // Look backwards from caret for an @ that starts a token.
    const before = text.slice(0, caret);
    const match = /(^|\s)@([A-Za-z][A-Za-z\s]{0,30})?$/.exec(before);
    if (match) {
      setMenuOpen(true);
      setQuery((match[2] ?? "").trimEnd());
      setTokenStart(before.length - (match[2]?.length ?? 0) - 1);
      setActiveIdx(0);
    } else {
      setMenuOpen(false);
      setQuery("");
      setTokenStart(-1);
    }
  }

  function applyMention(name: string) {
    const el = ref.current;
    if (!el) return;
    const start = tokenStart;
    const end = el.selectionStart;
    if (start < 0) return;
    const next = value.slice(0, start) + "@" + name + " " + value.slice(end);
    onChange(next);
    setMenuOpen(false);
    setQuery("");
    setTokenStart(-1);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = start + name.length + 2; // '@' + name + space
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (menuOpen && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyMention(suggestions[activeIdx]);
        return;
      }
      if (e.key === "Escape") {
        setMenuOpen(false);
        return;
      }
    }
    if (onSubmit && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          updateMentionState(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Close the menu shortly after blur so clicks can register.
          setTimeout(() => setMenuOpen(false), 150);
        }}
        onClick={(e) =>
          updateMentionState(value, (e.target as HTMLTextAreaElement).selectionStart)
        }
        className={cn(
          "w-full bg-[var(--color-input)] border border-white/10 rounded-md px-2.5 py-2 text-[13px] text-white placeholder:text-white/30 focus-ring min-h-[64px] resize-y",
          className,
        )}
        {...rest}
      />
      {menuOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 glass-panel border border-white/10 rounded-lg shadow-xl overflow-hidden">
          <div className="px-2.5 py-1.5 text-[10px] uppercase tracking-widest text-white/40 border-b border-white/5">
            Mention a teammate
          </div>
          {suggestions.map((name, i) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                applyMention(name);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={cn(
                "w-full text-left px-2.5 py-1.5 text-[13px] flex items-center gap-2",
                i === activeIdx
                  ? "bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
                  : "text-white/80 hover:bg-white/5",
              )}
            >
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-px rounded-md text-[11px] font-medium",
                  i === activeIdx
                    ? "bg-[var(--color-primary)]/25"
                    : "bg-white/5 text-white/60",
                )}
              >
                @
              </span>
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
