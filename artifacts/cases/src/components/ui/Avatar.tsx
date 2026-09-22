import { initials, colorFromString } from "@/lib/format";
import { cn } from "@/lib/cn";

export function Avatar({
  name,
  size = 36,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const text = initials(name);
  const color = colorFromString(name);
  return (
    <div
      className={cn(
        "rounded-full grid place-items-center font-semibold text-[var(--color-primary-foreground)]",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${color}, ${color}aa)`,
        fontSize: size * 0.38,
        boxShadow: `0 0 18px ${color}33`,
      }}
    >
      {text || "?"}
    </div>
  );
}
