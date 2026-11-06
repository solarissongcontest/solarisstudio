import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ShieldCheck, UserPlus, UserX } from "lucide-react";

import {
  PRIVATE_WORLD_QUERY_ROOT,
  changeWorldRoomGrant,
  getWorldRoomCandidates,
  isVisiblePrivateWorldQuery,
  type WorldRoomCandidate,
} from "@/lib/terra-world-private";

type Props = {
  roomId: string;
  visibility: "members" | "leadership" | "organ" | "custom";
  actorId: string;
  online: boolean;
  onClose: () => void;
};

/** Separate client presentation for the TG11 canonical governed invite RPC.
 * No raw room-grant table reads/writes and no unbounded member directory.
 */
export function WorldRoomAccessManager({ roomId, visibility, actorId, online, onClose }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  // Keep a request UUID on uncertain network responses. A second click with
  // the same expected version and intent retries the same canonical command.
  const requests = useRef<Map<string, string>>(new Map());

  const candidates = useQuery({
    queryKey: [...PRIVATE_WORLD_QUERY_ROOT, actorId, roomId, "eligible-users"],
    queryFn: ({ signal }) => getWorldRoomCandidates(roomId, signal),
    enabled: Boolean(actorId && roomId && online),
    staleTime: 0, gcTime: 0, retry: false,
    refetchOnMount: "always", refetchOnWindowFocus: "always",
  });
  const visible = isVisiblePrivateWorldQuery(candidates, online) ? candidates.data : null;

  const mutation = useMutation({
    mutationFn: async (args: { user: WorldRoomCandidate; role: WorldRoomCandidate["role"]; active: boolean }) => {
      const { user, role, active } = args;
      const key = [roomId, user.userId, role, String(active), user.revision].join(":");
      let requestId = requests.current.get(key);
      if (!requestId) {
        requestId = crypto.randomUUID();
        requests.current.set(key, requestId);
      }
      const receipt = await changeWorldRoomGrant({
        spaceId: roomId, userId: user.userId,
        role, active, expectedRevision: user.revision, requestId,
      });
      requests.current.delete(key);
      return receipt;
    },
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries({ queryKey: [...PRIVATE_WORLD_QUERY_ROOT, actorId, roomId, "eligible-users"] });
      await qc.invalidateQueries({ queryKey: [...PRIVATE_WORLD_QUERY_ROOT, actorId] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "The change was not confirmed. You can safely retry.");
    },
  });

  const matching = (visible ?? []).filter((candidate) =>
    candidate.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const submit = (user: WorldRoomCandidate, role: WorldRoomCandidate["role"], active: boolean) => {
    setError(null);
    mutation.mutate({ user, role, active });
  };

  return <section className="border-b border-border bg-muted/20 p-4 sm:p-5"
    aria-label="Manage private room access">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="inline-flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-4" aria-hidden="true" /> Room access
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {visibility === "members" ?
            "Every active institutional member already has room access. Grants only add moderator privileges." :
            "Only current institutional members are eligible. Ending membership revokes access immediately."}
        </p>
      </div>
      <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 text-sm font-medium">
        Close
      </button>
    </header>
    {!online ? <p role="alert" className="text-sm text-muted-foreground">Reconnect to manage permissions securely.</p> :
      candidates.isPending || !candidates.isFetchedAfterMount ?
        <p role="status" className="text-sm text-muted-foreground">Checking current eligible members…</p> :
      !visible ? <div role="alert" className="space-y-3">
        <p className="text-sm">Access to member management could not be verified. Cached participant names are hidden.</p>
        <button type="button" onClick={() => void candidates.refetch()}
          className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold">Retry permission check</button>
      </div> :
      visible.length === 0 ? <p className="text-sm text-muted-foreground">No eligible current members are available.</p> :
      <>
        <label htmlFor="world-room-member-filter" className="block max-w-lg text-sm font-semibold">
          Find an eligible member
          <input id="world-room-member-filter" type="search" value={filter}
            placeholder="Filter current member names" maxLength={80}
            onChange={(event) => setFilter(event.target.value)}
            className="mt-2 block min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm font-normal" />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">{matching.length} of {visible.length} eligible members</p>
        {error ? <p role="alert" className="my-3 text-sm text-destructive">{error}</p> : null}
        <div className="mt-3 max-h-80 divide-y divide-border overflow-y-auto">
          {matching.map((user) => <div key={user.userId}
            className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <strong className="block text-sm">{user.name}</strong>
              <span className="text-xs text-muted-foreground">
                {user.invited ? user.role === "moderator" ? "Invited moderator" : "Invited member" : "Not invited to this room"}
              </span>
            </div>
            {user.invited ? <>
              <button type="button" disabled={mutation.isPending}
                onClick={() => submit(user, user.role === "moderator" ? "member" : "moderator", true)}
                className="min-h-11 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50">
                {user.role === "moderator" ? "Remove moderator" : "Make moderator"}
              </button>
              {visibility !== "members" || user.role === "moderator" ? <button type="button" disabled={mutation.isPending}
                onClick={() => submit(user, user.role, false)}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 text-xs font-semibold text-destructive disabled:opacity-50">
                <UserX className="size-4" aria-hidden="true" /> {visibility === "members" ? "Remove extra role" : "Revoke"}
              </button> : null}
            </> :
              visibility === "members" ?
              <button type="button" disabled={mutation.isPending} onClick={() => submit(user, "moderator", true)}
                className="min-h-11 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50">
                Make moderator
              </button> :
              <button type="button" disabled={mutation.isPending}
                onClick={() => submit(user, "member", true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                <UserPlus className="size-4" aria-hidden="true" /> Invite
              </button>}
          </div>)}
          {matching.length === 0 && <p className="py-6 text-sm text-muted-foreground">No eligible members match that search.</p>}
        </div>
      </>}
  </section>;
}
