import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  NODE_H,
  NODE_META,
  NODE_W,
  type AutomationGraph,
  type AutomationNodeType,
} from "./types";
import { bezier, clamp } from "./geometry";
import { EdgePath } from "./EdgePath";
import { ConfigPopup } from "./ConfigPopup";

export interface AutomationBuilderHandle {
  /** Return pan to the origin and zoom to 100%. */
  resetView: () => void;
}

export interface AutomationBuilderProps {
  /** The graph being edited. */
  value: AutomationGraph;
  /** Called with the whole next graph on every edit. */
  onChange: (next: AutomationGraph) => void;
  /** Animates the edges, as the Run button does. */
  running?: boolean;
  /** Applied to the builder's flex column, e.g. "flex-1 min-h-0". */
  className?: string;
  ref?: Ref<AutomationBuilderHandle>;
}

/**
 * The visual workflow builder: node palette, pan/zoom canvas, edge drawing and
 * the per-node config popup.
 *
 * Extracted verbatim from pages/Workflow.tsx. The only structural change is
 * that the graph is now controlled through `value`/`onChange` instead of being
 * held in local state; pan, zoom and node selection remain internal because
 * they are view state, not document state. `value.viewport` is carried through
 * untouched — persisting it is a later concern.
 */
export function AutomationBuilder({
  value,
  onChange,
  running = false,
  className,
  ref,
}: AutomationBuilderProps) {
  const nodes = value.nodes;
  const edges = value.edges;

  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  function resetView() {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }

  useImperativeHandle(ref, () => ({ resetView }), []);

  const setNodes = (next: AutomationGraph["nodes"]) => onChange({ ...value, nodes: next });
  const setEdges = (next: AutomationGraph["edges"]) => onChange({ ...value, edges: next });

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  // screen (relative to canvasRef top-left) -> canvas-space
  function screenToCanvas(sx: number, sy: number) {
    return {
      x: (sx - pan.x) / zoom,
      y: (sy - pan.y) / zoom,
    };
  }

  // ── Node ops ───────────────────────────────────────────────────────────────
  function addNode(type: AutomationNodeType) {
    const id = `n${Date.now()}`;
    // Place new nodes near the center of the current view in canvas-space.
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 400;
    const cy = rect ? rect.height / 2 : 300;
    const center = screenToCanvas(cx, cy);
    setNodes([
      ...nodes,
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
    onChange({
      ...value,
      nodes: nodes.filter((n) => n.id !== id),
      edges: edges.filter((e) => e.from !== id && e.to !== id),
    });
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
      setNodes(
        nodes.map((n) =>
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
    if (!edges.some((e) => e.from === connect.from && e.to === toId)) {
      setEdges([...edges, { from: connect.from, to: toId }]);
    }
    setConnect(null);
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
    <div className={cn("flex flex-col gap-4 min-h-0", className)}>
      {/* Palette */}
      <div className="glass-panel p-3 flex flex-wrap items-center gap-2">
        <div className="label-eyebrow pr-2 border-r border-white/10 mr-2">Palette</div>
        {(Object.keys(NODE_META) as AutomationNodeType[]).map((type) => {
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
                setNodes(nodes.map((n) => (n.id === selected.id ? { ...n, config } : n)))
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
