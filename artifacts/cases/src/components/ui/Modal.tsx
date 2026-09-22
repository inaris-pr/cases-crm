import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  /** Slide-in drawer from the right rather than centered modal. */
  drawer?: boolean;
  /** Drawer/modal width override (Tailwind class). */
  widthClass?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  drawer,
  widthClass,
}: ModalProps) {
  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            initial={drawer ? { x: 80, opacity: 0 } : { y: 24, opacity: 0, scale: 0.98 }}
            animate={drawer ? { x: 0, opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
            exit={drawer ? { x: 80, opacity: 0 } : { y: 24, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={cn(
              "glass-panel relative shadow-2xl overflow-hidden",
              drawer
                ? cn("h-full ml-auto", widthClass ?? "w-full max-w-md")
                : cn(
                    "m-auto rounded-2xl max-h-[90vh] flex flex-col",
                    widthClass ?? "w-full max-w-xl",
                  ),
            )}
          >
            {(title || description) && (
              <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
                <div>
                  {title && (
                    <h2 className="text-base font-semibold tracking-tight">{title}</h2>
                  )}
                  {description && (
                    <p className="text-xs text-white/50 mt-0.5">{description}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="p-1 rounded-md text-white/60 hover:bg-white/5 hover:text-white"
                >
                  <X size={15} />
                </button>
              </div>
            )}
            <div className="overflow-y-auto px-5 pb-5 flex-1">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
