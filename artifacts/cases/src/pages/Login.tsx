import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, Mail, Lock, Loader2 } from "lucide-react";
import { API, fetchJson } from "@/lib/api";
import type { User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await fetchJson<User>(API("/api/auth/login"), {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      login(user);
    } catch (err: any) {
      const msg = (err?.message ?? "").toLowerCase();
      setError(
        msg.includes("invalid_credentials") || msg.includes("401")
          ? "Wrong email or password."
          : "Couldn't sign in. Try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen w-full relative grid place-items-center px-4 bg-[var(--color-background)]">
      <div className="bg-glow fixed inset-0 pointer-events-none -z-10" aria-hidden />
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full max-w-sm glass-panel neon-border p-6 rounded-2xl"
      >
        <div className="flex items-center gap-2 mb-5">
          <div className="size-9 grid place-items-center rounded-lg bg-[var(--color-primary)]/15">
            <Zap size={18} className="text-[var(--color-primary)] neon-text" />
          </div>
          <div>
            <div className="text-[var(--color-primary)] font-black tracking-widest neon-text text-sm">
              CASES.
            </div>
            <div className="text-[10px] uppercase tracking-widest text-white/40">
              Sign in to your workspace
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <Label>Email</Label>
            <div className="relative">
              <Mail
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40"
              />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="iris@example.com"
                autoFocus
                required
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <Label>Password</Label>
            <div className="relative">
              <Lock
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40"
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="pl-8"
              />
            </div>
          </div>

          {error && (
            <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-2.5 py-1.5">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={!email || !password || submitting}
            className="w-full"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        <div className="mt-5 pt-4 border-t border-white/5 text-[11px] text-white/40">
          <div className="label-eyebrow mb-1.5">Demo accounts</div>
          <div className="space-y-0.5 font-mono">
            <div>iris@example.com · test123</div>
            <div>devon@example.com · test123</div>
            <div>sara@example.com · test123</div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
