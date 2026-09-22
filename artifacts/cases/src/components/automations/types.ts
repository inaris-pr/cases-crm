import { Zap, Filter, UserCheck, Bell, Clock, GitBranch, Globe, Edit } from "lucide-react";

/**
 * Builder-side constants for the visual automation editor.
 *
 * The graph types themselves live in lib/api.ts alongside every other type
 * that mirrors the server, and are re-exported here so builder code has one
 * import site.
 */
import type { AutomationGraph, AutomationNodeType } from "@/lib/api";

export type {
  AutomationNodeType,
  AutomationNode,
  AutomationEdge,
  AutomationGraph,
} from "@/lib/api";

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
