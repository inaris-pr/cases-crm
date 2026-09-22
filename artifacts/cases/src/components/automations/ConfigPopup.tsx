import { Trash2, X } from "lucide-react";
import { NODE_META, NODE_H, NODE_W, type AutomationNode } from "./types";

export function ConfigPopup({
  node,
  onChange,
  onDelete,
  onClose,
}: {
  node: AutomationNode;
  onChange: (config: Record<string, string>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const meta = NODE_META[node.type];
  const Icon = meta.icon;

  const CARD_W = 280;
  const GAP = 16;
  const left = node.x + NODE_W + GAP;
  const top = node.y;

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left,
        top,
        width: CARD_W,
        pointerEvents: "auto",
        boxShadow: `0 12px 40px rgba(0,0,0,0.4), 0 0 24px ${meta.color}30`,
      }}
      className="glass-panel border border-white/10 rounded-xl overflow-hidden z-10"
    >
      <div
        className="absolute"
        style={{
          left: -7,
          top: NODE_H / 2 - 6,
          width: 0,
          height: 0,
          borderTop: "6px solid transparent",
          borderBottom: "6px solid transparent",
          borderRight: `7px solid rgba(20,20,25,0.85)`,
        }}
      />
      <div
        className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/5"
        style={{ background: `${meta.color}10` }}
      >
        <div className="flex items-center gap-2" style={{ color: meta.color }}>
          <Icon size={14} />
          <span className="text-xs font-semibold text-white">{meta.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onDelete}
            className="text-white/40 hover:text-rose-400 p-1 rounded-md hover:bg-rose-500/10"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white p-1 rounded-md hover:bg-white/5"
            title="Close"
          >
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="p-3 space-y-2.5">
        {Object.entries(node.config).map(([k, v]) => (
          <div key={k}>
            <div className="label-eyebrow mb-1">{k}</div>
            <input
              value={v}
              onChange={(e) => onChange({ ...node.config, [k]: e.target.value })}
              className="w-full bg-[var(--color-input)] border border-white/10 rounded-md px-2.5 h-9 text-sm focus-ring"
            />
          </div>
        ))}
        {Object.keys(node.config).length === 0 && (
          <div className="text-xs text-white/40">No configurable fields for this node.</div>
        )}
      </div>
    </div>
  );
}
