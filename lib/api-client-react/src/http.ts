/**
 * Fetch mutator used by Orval-generated React Query hooks.
 * Identical signature to the frontend's own fetchJson helper.
 */
export async function fetchJson<T>(config: {
  url: string;
  method: string;
  params?: Record<string, unknown>;
  data?: unknown;
  signal?: AbortSignal;
}): Promise<T> {
  const base = (typeof window !== "undefined" && (window as any).__API_BASE__) || "";
  const params = config.params
    ? "?" +
      new URLSearchParams(
        Object.entries(config.params)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  const r = await fetch(`${base}${config.url}${params}`, {
    method: config.method,
    headers: { "Content-Type": "application/json" },
    body: config.data ? JSON.stringify(config.data) : undefined,
    signal: config.signal,
  });
  if (!r.ok) throw new Error(await r.text());
  if (r.status === 204) return undefined as unknown as T;
  return (await r.json()) as T;
}

export default fetchJson;
