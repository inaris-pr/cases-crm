import { Link } from "wouter";
import { Frown } from "lucide-react";

export function NotFound() {
  return (
    <div className="min-h-[50vh] grid place-items-center text-center">
      <div className="space-y-4">
        <Frown size={40} className="mx-auto text-white/40" />
        <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
        <Link href="/">
          <a className="text-sm text-[var(--color-primary)] hover:underline">← Back to dashboard</a>
        </Link>
      </div>
    </div>
  );
}
