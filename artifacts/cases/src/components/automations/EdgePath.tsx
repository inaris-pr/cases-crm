import { NODE_W, NODE_H, type AutomationNode } from "./types";
import { bezier } from "./geometry";

export function EdgePath({
  from,
  to,
  running,
}: {
  from: AutomationNode;
  to: AutomationNode;
  running: boolean;
}) {
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
