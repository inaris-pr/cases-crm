import { Select } from "@/components/ui/Input";
import type { AutomationSummary } from "@/lib/api";

/**
 * Automation chooser for a case.
 *
 * A native select with optgroups: it keeps "This case" and "Global" visually
 * distinct, stays usable with many entries, and is keyboard-accessible for
 * free.
 */
export function AutomationPicker({
  automations,
  selectedId,
  onSelect,
  disabled,
}: {
  automations: AutomationSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  disabled?: boolean;
}) {
  const own = automations.filter((a) => a.scope === "case");
  const globals = automations.filter((a) => a.scope === "global");

  return (
    <Select
      value={selectedId ?? ""}
      disabled={disabled}
      onChange={(e) => {
        const next = Number(e.target.value);
        if (Number.isFinite(next) && next > 0) onSelect(next);
      }}
      aria-label="Select an automation"
    >
      {selectedId === null && <option value="">Select an automation…</option>}
      {own.length > 0 && (
        <optgroup label={`This case (${own.length})`}>
          {own.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.customized ? " — customized" : ""}
            </option>
          ))}
        </optgroup>
      )}
      {globals.length > 0 && (
        <optgroup label={`Global — shared with every case (${globals.length})`}>
          {globals.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </optgroup>
      )}
    </Select>
  );
}

/** Small scope pill shown beside the picker and in the header. */
export function ScopePill({ scope }: { scope: AutomationSummary["scope"] }) {
  const isGlobal = scope === "global";
  return (
    <span
      className={
        isGlobal
          ? "inline-flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-semibold uppercase tracking-widest border border-amber-400/30 bg-amber-400/10 text-amber-300"
          : "inline-flex items-center gap-1 h-6 px-2 rounded-md text-[10px] font-semibold uppercase tracking-widest border border-white/10 bg-white/5 text-white/60"
      }
    >
      {isGlobal ? "Global" : "This case"}
    </span>
  );
}
