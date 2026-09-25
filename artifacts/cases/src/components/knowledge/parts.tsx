/**
 * Small shared pieces for the Knowledge Base pages (Phase 8B).
 * Colours follow the CRM's existing chips: restrained borders, tinted fills.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/knowledge";

export const TONE_CHIP: Record<Tone, string> = {
  neutral: "border-white/10 bg-white/5 text-white/60",
  info: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  notice: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  warning: "border-orange-400/35 bg-orange-500/10 text-orange-200",
  unresolved: "border-dashed border-violet-300/40 bg-violet-400/10 text-violet-200",
  positive: "border-[var(--color-primary)]/25 bg-[var(--color-primary)]/10 text-[var(--color-primary)]",
  muted: "border-white/10 bg-transparent text-white/45",
};

/** Left accent for a highlighted section card. */
export const TONE_ACCENT: Record<Tone, string> = {
  neutral: "border-l-white/10",
  info: "border-l-sky-400/50",
  notice: "border-l-amber-400/60",
  warning: "border-l-orange-400/60",
  unresolved: "border-l-violet-300/60 border-dashed",
  positive: "border-l-[var(--color-primary)]/50",
  muted: "border-l-white/10",
};

export function Chip({
  tone = "neutral",
  children,
  className,
  title,
  testId,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
  testId?: string;
}) {
  return (
    <span
      title={title}
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-4 max-w-full",
        TONE_CHIP[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
