import { Zap, Filter, UserCheck, Bell, Clock, GitBranch, Globe, Edit } from "lucide-react";

/**
 * Graph model for the visual automation builder.
 *
 * These mirror the server types in artifacts/api-server/src/store.ts — the
 * house convention is to duplicate rather than share a package, so change both
 * together.
 */
export type AutomationNodeType =
  | "trigger"
  | "filter"
  | "assign"
  | "notify"
  | "delay"
  | "branch"
  | "http"
  | "update";

export interface AutomationNode {
  id: string;
  type: AutomationNodeType;
  x: number;
  y: number;
  config: Record<string, string>;
}

export interface AutomationEdge {
  from: string;
  to: string;
}

export interface AutomationGraph {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  /** Last saved pan/zoom. Carried through unchanged by the builder for now. */
  viewport?: { pan: { x: number; y: number }; zoom: number } | null;
}

export const NODE_META: Record<
  AutomationNodeType,
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

export const NODE_W = 200;
export const NODE_H = 86;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

export const EMPTY_GRAPH: AutomationGraph = { nodes: [], edges: [], viewport: null };
