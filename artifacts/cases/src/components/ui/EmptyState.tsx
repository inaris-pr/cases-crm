import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  cta?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("py-14 text-center flex flex-col items-center gap-3", className)}>
      <div className="size-14 rounded-2xl bg-white/5 grid place-items-center text-white/40">
        <Icon size={24} />
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {description && <p className="text-sm text-white/50 max-w-sm">{description}</p>}
      {cta}
    </div>
  );
}
