import { useEffect, useRef, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";

type FieldType = "text" | "textarea" | "number" | "date" | "url" | "tel" | "email";

interface EditableFieldProps {
  /** Current value (already formatted as a string — the component round-trips it). */
  value: string | null;
  /** Display formatter — only affects the rendered (non-editing) view. */
  displayValue?: React.ReactNode;
  /** Called with the new raw string when the user saves. */
  onSave: (next: string | null) => void | Promise<unknown>;
  /** Input type. */
  type?: FieldType;
  /** Optional dropdown — if provided, renders a <select> instead of <input>. */
  options?: { value: string; label: string }[];
  /** Placeholder shown in the input when empty. */
  placeholder?: string;
  /** Override the input width — defaults to fill. */
  inputClassName?: string;
  /** Display-only mode (no edit). */
  readOnly?: boolean;
  /** Allow saving an empty value (becomes null). Default true. */
  allowEmpty?: boolean;
}

/**
 * Inline-editable field. Renders the value as a static cell with a hover-only
 * pencil icon; clicking the pencil (or the value itself) flips it to an
 * editable input that saves on Enter or blur and reverts on Escape.
 */
export function EditableField({
  value,
  displayValue,
  onSave,
  type = "text",
  options,
  placeholder,
  inputClassName,
  readOnly,
  allowEmpty = true,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    null,
  );

  // Sync draft whenever the canonical value changes from outside.
  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  // Auto-focus on entering edit mode.
  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    if (
      inputRef.current &&
      "select" in inputRef.current &&
      typeof inputRef.current.select === "function"
    ) {
      inputRef.current.select();
    }
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (!allowEmpty && !trimmed) {
      setEditing(false);
      setDraft(value ?? "");
      return;
    }
    const next = trimmed === "" ? null : trimmed;
    if (next !== value) {
      Promise.resolve(onSave(next)).finally(() => setEditing(false));
    } else {
      setEditing(false);
    }
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  if (readOnly || !editing) {
    return (
      <div
        className={cn(
          "group flex items-center justify-between gap-2 -mx-1 px-1 py-1 rounded",
          !readOnly && "hover:bg-white/[0.04] cursor-text",
        )}
        onClick={() => {
          if (!readOnly) setEditing(true);
        }}
      >
        <div className={cn("min-w-0 flex-1 text-sm text-white truncate", !value && "text-white/30")}>
          {displayValue ?? value ?? <span className="italic">—</span>}
        </div>
        {!readOnly && (
          <Pencil
            size={11}
            className="text-white/0 group-hover:text-white/50 shrink-0 transition-colors"
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 -mx-1 px-1 py-0.5">
      {options ? (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          className={cn(
            "flex-1 bg-[var(--color-input)] border border-[var(--color-primary)]/50 rounded px-2 h-7 text-sm focus-ring",
            inputClassName,
          )}
        >
          <option value="">(none)</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commit();
            if (e.key === "Escape") cancel();
          }}
          placeholder={placeholder}
          rows={2}
          className={cn(
            "flex-1 bg-[var(--color-input)] border border-[var(--color-primary)]/50 rounded px-2 py-1 text-sm focus-ring resize-none",
            inputClassName,
          )}
        />
      ) : (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={type === "date" ? "date" : type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") cancel();
          }}
          placeholder={placeholder}
          className={cn(
            "flex-1 bg-[var(--color-input)] border border-[var(--color-primary)]/50 rounded px-2 h-7 text-sm focus-ring",
            inputClassName,
          )}
        />
      )}
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          commit();
        }}
        className="size-6 grid place-items-center rounded text-[var(--color-primary)] hover:bg-white/5"
        title="Save"
      >
        <Check size={12} />
      </button>
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          cancel();
        }}
        className="size-6 grid place-items-center rounded text-white/45 hover:bg-white/5"
        title="Cancel"
      >
        <X size={12} />
      </button>
    </div>
  );
}

/**
 * Editable boolean field — rendered as a checkbox that toggles immediately.
 */
export function EditableCheckbox({
  value,
  onSave,
  readOnly,
}: {
  value: boolean;
  onSave: (next: boolean) => void | Promise<unknown>;
  readOnly?: boolean;
}) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 -mx-1 px-1 py-1 rounded cursor-pointer",
        !readOnly && "hover:bg-white/[0.04]",
      )}
    >
      <input
        type="checkbox"
        checked={value}
        disabled={readOnly}
        onChange={(e) => onSave(e.target.checked)}
        className="accent-[var(--color-primary)]"
      />
      <span className="text-xs text-white/65">{value ? "Yes" : "No"}</span>
    </label>
  );
}
