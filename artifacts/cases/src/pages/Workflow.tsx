import { useRef, useState } from "react";
import {
  Play,
  Save,
  Trash2,
  Zap,
  Filter,
  UserCheck,
  Bell,
  Clock,
  GitBranch,
  Globe,
  Edit,
  X,
  Move,
  Plus,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/cn";

type NodeType =
  | "trigger"
  | "filter"
  | "assign"
  | "notify"
  | "delay"
  | "branch"
  | "http"
  | "update";

interface WFNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  config: Record<string, string>;
}

interface WFEdge {
  from: string;
  to: string;
}

const NODE_META: Record<
  NodeType,
  { label: string; icon: any; color: string; defaults: Record<string, string> }
> = {
  trigger: { label: "Trigger", icon: Zap, color: "#29f312", defaults: { event: "case.created" } },
  filter: { label: "Filter", icon: Filter, color: "#3b82f6", defaults: { condition: "status == 'intake'" } },
  assign: { label: "Assign", icon: UserCheck, color: "#a855f7", defaults: { assignee: "auto" } },
  notify: { label: "Notify", icon: Bell, color: "#f59e0b", defaults: { channel: "slack", message: "New case" } },
  delay: { label: "Delay", icon: Clock, color: "#10b981", defaults: { duration: "1h" } },
  branch: { label: "Branch", icon: GitBranch, color: "#ec4899", defaults: { condition: "priority == 'critical'" } },
  http: { label: "HTTP Request", icon: Globe, color: "#06b6d4", defaults: { url: "https://", method: "POST" } },
  update: { label: "Update Case", icon: Edit, color: "#ef4444", defaults: { field: "status", value: "review" } },
};

const NODE_W = 200;
const NODE_H = 86;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

const INITIAL_NODES: WFNode[] = [
  { id: "n1", type: "trigger", x: 80, y: 120, config: { event: "case.created" } },
  { id: "n2", type: "filter", x: 360, y: 120, config: { condition: "priority == 'high'" } },
  { id: "n3", type: "assign", x: 640, y: 60, config: { assignee: "team:litigation" } },
  { id: "n4", type: "notify", x: 640, y: 200, config: { channel: "slack", message: "High priority case opened" } },
  { id: "n5", type: "update", x: 920, y: 120, config: { field: "status", value: "review" } },
];

const INITIAL_EDGES: WFEdge[] = [
  { from: "n1", to: "n2" },
  { from: "n2", to: "n3" },
  { from: "n2", to: "n4" },
  { from: "n3", to: "n5" },
  { from: "n4", to: "n5" },
];

export function Workflow() {
  const [nodes, setNodes] = useState<WFNode[]>(INITIAL_NODES);
  const [edges, setEdges] = useState<WFEdge[]>(INITIAL_EDGES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [drag, setDrag] = useState<null | { id: string; offX: number; offY: number }>(null);
  const [connect, setConnect] = useState<null | { from: string; x: number; y: number }>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panStart, setPanStart] = useState<null | {
    mouseX: number;
    mouseY: number;
    panX: number;
    panY: number;
  }>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  // screen (relative to canvasRef top-left) -> canvas-space
  function screenToCanvas(sx: number, sy: number) {
    return {
      x: (sx - pan.x) / zoom,
      y: (sy - pan.y) / zoom,
    };
  }

  // ── Node ops ───────────────────────────────────────────────────────────────
  function addNode(type: NodeType) {
    const id = `n${Date.now()}`;
    // Place new nodes near the center of the current view in canvas-space.
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 400;
    const cy = rect ? rect.height / 2 : 300;
    const center = screenToCanvas(cx, cy);
    setNodes((ns) => [
      ...ns,
      {
        id,
        type,
        x: center.x - NODE_W / 2 + (Math.random() - 0.5) * 60,
        y: center.y - NODE_H / 2 + (Math.random() - 0.5) * 60,
        config: { ...NODE_META[type].defaults },
      },
    ]);
  }

  function deleteNode(id: string) {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.from !== id && e.to !== id));
    if (selectedId === id) setSelectedId(null);
  }

  // ── Canvas interactions ────────────────────────────────────────────────────
  function onCanvasMouseDown(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.dataset.canvasBg === "1") {
      setSelectedId(null);
      setPanStart({
        mouseX: e.clientX,
        mouseY: e.clientY,
        panX: pan.x,
        panY: pan.y,
      });
    }
  }

  function onMouseMove(e: React.MouseEvent) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (panStart) {
      setPan({
        x: panStart.panX + (e.clientX - panStart.mouseX),
        y: panStart.panY + (e.clientY - panStart.mouseY),
      });
      return;
    }
    if (drag) {
      const p = screenToCanvas(sx, sy);
      setNodes((ns) =>
        ns.map((n) =>
          n.id === drag.id ? { ...n, x: p.x - drag.offX, y: p.y - drag.offY } : n,
        ),
      );
    }
    if (connect) setConnect({ ...connect, x: sx, y: sy });
  }

  function endConnect(toId: string) {
    if (!connect || connect.from === toId) {
      setConnect(null);
      return;
    }
    setEdges((es) => {
      if (es.some((e) => e.from === connect.from && e.to === toId)) return es;
      return [...es, { from: connect.from, to: toId }];
    });
    setConnect(null);
  }

  function runWorkflow() {
    setRunning(true);
    setTimeout(() => setRunning(false), 2200);
  }

  function clearAll() {
    setNodes([]);
    setEdges([]);
    setSelectedId(null);
  }

  function resetView() {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }

  // ── Zoom ───────────────────────────────────────────────────────────────────
  // Zoom centered on a given screen point (so the point stays under the cursor).
  function zoomAt(screenX: number, screenY: number, factor: number) {
    const newZoom = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (newZoom === zoom) return;
    // canvasPoint = (screen - pan) / zoom; we want the same canvasPoint at newZoom:
    // newPan = screen - canvasPoint * newZoom
    const canvasX = (screenX - pan.x) / zoom;
    const canvasY = (screenY - pan.y) / zoom;
    setPan({
      x: screenX - canvasX * newZoom,
      y: screenY - canvasY * newZoom,
    });
    setZoom(newZoom);
  }

  function onWheel(e: React.WheelEvent) {
    // Only zoom on Ctrl/Cmd+wheel? Most node-graph apps zoom on plain wheel.
    // We zoom on plain wheel for a more familiar feel.
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAt(sx, sy, factor);
  }

  function zoomButton(delta: number) {
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 400;
    const cy = rect ? rect.height / 2 : 300;
    zoomAt(cx, cy, delta);
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-4rem)] overflow-hidden">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="label-eyebrow mb-1">Automations</div>
          <h1 className="text-xl font-bold tracking-tight">Automations</h1>
          <p className="text-xs text-white/50 mt-0.5">
            Drag the canvas to pan, scroll to zoom, click a node to configure.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runWorkflow}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)] text-sm font-semibold"
          >
            <Play size={14} />
            {running ? "Running…" : "Run"}
          </button>
          <button
            onClick={resetView}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10"
            title="Reset view"
          >
            <Move size={14} />
            Reset view
          </button>
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-white/15 text-sm text-white/70 hover:bg-white/5"
          >
            <Trash2 size={14} />
            Clear
          </button>
          <button className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10">
            <Save size={14} />
            Save
          </button>
        </div>
      </div>

      {/* Palette */}
      <div className="glass-panel p-3 flex flex-wrap items-center gap-2">
        <div className="label-eyebrow pr-2 border-r border-white/10 mr-2">Palette</div>
        {(Object.keys(NODE_META) as NodeType[]).map((type) => {
          const meta = NODE_META[type];
          const Icon = meta.icon;
          return (
            <button
              key={type}
              onClick={() => addNode(type)}
              className="inline-flex items-center gap-2 h-8 px-3 rounded-md bg-white/5 hover:bg-white/10 text-xs border border-white/5"
              style={{ color: meta.color }}
            >
              <Icon size={12} />
              <span className="text-white/80">{meta.label}</span>
            </button>
          );
        })}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={() => {
          setDrag(null);
          setConnect(null);
          setPanStart(null);
        }}
        onMouseLeave={() => {
          setDrag(null);
          setConnect(null);
          setPanStart(null);
        }}
        onWheel={onWheel}
        className={cn(
          "glass-panel dot-grid relative overflow-hidden select-none flex-1 min-h-0",
          panStart ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        {/* Background hit target */}
        <div data-canvas-bg="1" className="absolute inset-0" aria-hidden />

        {/* Transformed content: edges + nodes + popup */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: panStart ? "none" : "transform 0.05s linear",
          }}
        >
          {/* Edges */}
          <svg
            className="absolute"
            style={{ left: 0, top: 0, width: 4000, height: 2000, overflow: "visible" }}
          >
            {edges.map((e, i) => {
              const from = nodes.find((n) => n.id === e.from);
              const to = nodes.find((n) => n.id === e.to);
              if (!from || !to) return null;
              return <EdgePath key={i} from={from} to={to} running={running} />;
            })}
            {connect && (() => {
              const from = nodes.find((n) => n.id === connect.from);
              if (!from) return null;
              const x1 = from.x + NODE_W;
              const y1 = from.y + NODE_H / 2;
              // connect.x/y are in screen-space relative to the canvas rect;
              // translate to canvas-space.
              const cx = (connect.x - pan.x) / zoom;
              const cy = (connect.y - pan.y) / zoom;
              return (
                <path
                  d={bezier(x1, y1, cx, cy)}
                  fill="none"
                  stroke="#29f312"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              );
            })()}
          </svg>

          {/* Nodes */}
          {nodes.map((n) => {
            const meta = NODE_META[n.type];
            const Icon = meta.icon;
            const isSelected = selectedId === n.id;
            return (
              <div
                key={n.id}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  const rect = canvasRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  const sx = e.clientX - rect.left;
                  const sy = e.clientY - rect.top;
                  const p = screenToCanvas(sx, sy);
                  setDrag({
                    id: n.id,
                    offX: p.x - n.x,
                    offY: p.y - n.y,
                  });
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(n.id);
                }}
                style={{
                  left: n.x,
                  top: n.y,
                  width: NODE_W,
                  height: NODE_H,
                  borderColor: isSelected ? meta.color : "rgba(255,255,255,0.08)",
                  boxShadow: isSelected ? `0 0 24px ${meta.color}66` : undefined,
                  pointerEvents: "auto",
                }}
                className="absolute rounded-xl glass-panel border-2 select-none cursor-grab active:cursor-grabbing"
              >
                <div
                  className="px-3 py-2 flex items-center gap-2 border-b border-white/5"
                  style={{ color: meta.color }}
                >
                  <Icon size={14} />
                  <span className="text-xs font-semibold text-white">{meta.label}</span>
                </div>
                <div className="px-3 py-2 text-[11px] text-white/50 truncate">
                  {Object.entries(n.config)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </div>
                {/* Input port */}
                <div
                  onMouseUp={(e) => {
                    e.stopPropagation();
                    endConnect(n.id);
                  }}
                  className="absolute -left-2 top-1/2 -translate-y-1/2 size-4 rounded-full border-2 border-white/40 bg-[var(--color-card)]"
                  style={{ pointerEvents: "auto" }}
                />
                {/* Output port */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const rect = canvasRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setConnect({
                      from: n.id,
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                    });
                  }}
                  className="absolute -right-2 top-1/2 -translate-y-1/2 size-4 rounded-full bg-[var(--color-primary)] shadow-[0_0_10px_rgba(41,243,18,0.6)] cursor-crosshair"
                  style={{ pointerEvents: "auto" }}
                />
              </div>
            );
          })}

          {/* Popup config card lives inside the transformed container so it follows the node */}
          {selected && (
            <ConfigPopup
              key={selected.id}
              node={selected}
              onChange={(config) =>
                setNodes((ns) =>
                  ns.map((n) => (n.id === selected.id ? { ...n, config } : n)),
                )
              }
              onDelete={() => deleteNode(selected.id)}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>

        {/* Hint */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 grid place-items-center text-white/30 text-sm pointer-events-none">
            Click a node in the palette to start.
          </div>
        )}

        {/* Zoom controls (fixed, not zoomed) */}
        <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-black/40 backdrop-blur rounded-lg p-1 border border-white/5">
          <button
            onClick={() => zoomButton(1 / 1.2)}
            className="size-7 grid place-items-center rounded-md text-white/70 hover:bg-white/10"
            title="Zoom out"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={() => resetView()}
            className="px-2 h-7 text-[10px] uppercase tracking-widest text-white/60 hover:text-white tabular-nums min-w-[3.5rem]"
            title="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => zoomButton(1.2)}
            className="size-7 grid place-items-center rounded-md text-white/70 hover:bg-white/10"
            title="Zoom in"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Pan indicator */}
        {(pan.x !== 0 || pan.y !== 0 || zoom !== 1) && (
          <div className="absolute bottom-3 right-3 text-[10px] uppercase tracking-widest text-white/30 bg-black/40 px-2 py-1 rounded-md backdrop-blur">
            View · {pan.x.toFixed(0)}, {pan.y.toFixed(0)} · {Math.round(zoom * 100)}%
          </div>
        )}
      </div>
    </div>
  );
}

function ConfigPopup({
  node,
  onChange,
  onDelete,
  onClose,
}: {
  node: WFNode;
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

function bezier(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.5, 40);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function EdgePath({ from, to, running }: { from: WFNode; to: WFNode; running: boolean }) {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  return (
    <g>
      <path
        d={bezier(x1, y1, x2, y2)}
        fill="none"
        stroke={running ? "#29f312" : "rgba(255,255,255,0.18)"}
        strokeWidth={2}
        style={{
          filter: running ? "drop-shadow(0 0 6px rgba(41,243,18,0.7))" : undefined,
          transition: "stroke 0.2s",
        }}
        strokeDasharray={running ? "6 4" : undefined}
      >
        {running && (
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-40"
            dur="0.8s"
            repeatCount="indefinite"
          />
        )}
      </path>
    </g>
  );
}
