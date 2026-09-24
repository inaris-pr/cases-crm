import { useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { UserRoundCog } from "lucide-react";
import type { ReassignableType } from "@cases/access";
import { API, fetchJson } from "@/lib/api";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

/**
 * The owner of a record, with a Reassign control when the employee holds the
 * assign permission for it (RBAC Phase 5, using the Phase 4 API).
 *
 * The picker lists only the employees the API would accept as the new owner
 * (GET /api/owners/:type/candidates — active, able to view this kind of
 * record, inside the caller's assign scope). The change is sent as
 * { ownerUserId } to PUT /api/<type>/:id/owner — never as a display name.
 * The API still checks everything, including the current owner's scope.
 */
export function ReassignControl({
  type,
  recordId,
  ownerName,
  ownerUserId,
  canReassign,
  invalidate,
}: {
  type: ReassignableType;
  recordId: number;
  ownerName: string;
  ownerUserId: number | null | undefined;
  canReassign: boolean;
  /** Query keys to refresh after a successful reassignment. */
  invalidate: QueryKey[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<number | "">("");
  const candidates = useQuery({
    queryKey: ["owner-candidates", type],
    queryFn: () => fetchJson<{ id: number; name: string }[]>(API(`/api/owners/${type}/candidates`)),
    enabled: canReassign && open,
  });
  const reassign = useMutation({
    mutationFn: (id: number) =>
      fetchJson(API(`/api/${type}/${recordId}/owner`), {
        method: "PUT",
        body: JSON.stringify({ ownerUserId: id }),
      }),
    onSuccess: () => {
      for (const key of invalidate) qc.invalidateQueries({ queryKey: key });
      setOpen(false);
      setTarget("");
    },
  });
  const options = (candidates.data ?? []).filter((u) => u.id !== ownerUserId);

  return (
    <div data-testid="owner-field" className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-white">{ownerName}</span>
        {canReassign && !open && (
          <button
            type="button"
            data-testid="reassign-open"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-[11px] text-[var(--color-primary)] hover:underline"
          >
            <UserRoundCog size={12} /> Reassign
          </button>
        )}
      </div>
      {canReassign && open && (
        <div className="flex items-center gap-2">
          <Select
            data-testid="reassign-select"
            value={target === "" ? "" : String(target)}
            onChange={(e) => setTarget(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">{candidates.isLoading ? "Loading…" : "Choose an employee"}</option>
            {options.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            data-testid="reassign-confirm"
            disabled={target === "" || reassign.isPending}
            onClick={() => target !== "" && reassign.mutate(target)}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      )}
      {reassign.isError && (
        <div className="text-[11px] text-rose-300">Couldn't reassign: {(reassign.error as Error).message}</div>
      )}
    </div>
  );
}
