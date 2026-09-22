import { useRef, useState } from "react";
import { Play, Save, Trash2, Move } from "lucide-react";
import {
  AutomationBuilder,
  type AutomationBuilderHandle,
} from "@/components/automations/AutomationBuilder";
import type { AutomationGraph } from "@/components/automations/types";

/**
 * The standalone Automations page.
 *
 * The canvas itself now lives in components/automations/AutomationBuilder;
 * this page keeps the header, the Run/Reset view/Clear/Save controls and the
 * demo graph exactly as they were. Save is still inert, as it has always been.
 */
const INITIAL_GRAPH: AutomationGraph = {
  nodes: [
    { id: "n1", type: "trigger", x: 80, y: 120, config: { event: "case.created" } },
    { id: "n2", type: "filter", x: 360, y: 120, config: { condition: "priority == 'high'" } },
    { id: "n3", type: "assign", x: 640, y: 60, config: { assignee: "team:litigation" } },
    { id: "n4", type: "notify", x: 640, y: 200, config: { channel: "slack", message: "High priority case opened" } },
    { id: "n5", type: "update", x: 920, y: 120, config: { field: "status", value: "review" } },
  ],
  edges: [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n3" },
    { from: "n2", to: "n4" },
    { from: "n3", to: "n5" },
    { from: "n4", to: "n5" },
  ],
  viewport: null,
};

export function Workflow() {
  const [graph, setGraph] = useState<AutomationGraph>(INITIAL_GRAPH);
  const [running, setRunning] = useState(false);
  const builderRef = useRef<AutomationBuilderHandle>(null);

  function runWorkflow() {
    setRunning(true);
    setTimeout(() => setRunning(false), 2200);
  }

  function clearAll() {
    setGraph((g) => ({ ...g, nodes: [], edges: [] }));
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
            onClick={() => builderRef.current?.resetView()}
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

      <AutomationBuilder
        ref={builderRef}
        value={graph}
        onChange={setGraph}
        running={running}
        className="flex-1 min-h-0"
      />
    </div>
  );
}
