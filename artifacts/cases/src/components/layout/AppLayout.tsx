import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import { Sidebar } from "./Sidebar";
import { MessagesWidget } from "./MessagesWidget";
import { can } from "@cases/access";
import { useAuth } from "@/lib/auth";

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { permissions } = useAuth();
  return (
    <div className="min-h-screen w-full relative bg-[var(--color-background)] text-white">
      {/* Background glow */}
      <div className="bg-glow fixed inset-0 pointer-events-none -z-10" aria-hidden />

      <Sidebar />

      <main className="min-h-screen pl-20 pr-4 sm:pr-6 py-5">
        <motion.div
          key={location}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="max-w-7xl mx-auto"
        >
          {children}
        </motion.div>
      </main>

      {can(permissions, "messages.use") && <MessagesWidget />}
    </div>
  );
}
