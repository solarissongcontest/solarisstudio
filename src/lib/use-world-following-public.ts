import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { fetchPublishedFollowingOrganizations } from "./v3-world-following-public";

export type OwnedFollowingIdentity = {
  profile_id: string;
  entity_type: string;
  entity_id: string;
};

/**
 * Only the currently authenticated user's verified private follows may drive
 * a public name lookup. Public names are reverified on mount/focus and never
 * read from a prior account's cache or a failed/dark rollout check.
 */
export function usePublishedWorldFollowing({
  viewerId,
  follows,
  enabled = true,
}: {
  viewerId: string | null | undefined;
  follows: readonly OwnedFollowingIdentity[] | undefined;
  enabled?: boolean;
}) {
  const scoped = Boolean(viewerId && follows?.every((row) => row.profile_id === viewerId));
  const ids = useMemo(
    () => scoped
      ? [...new Set((follows ?? [])
        .filter((follow) => follow.entity_type === "organization")
        .map((follow) => follow.entity_id))].sort()
      : [],
    [follows, scoped],
  );
  const lookup = useQuery({
    queryKey: ["v3-world-following-public", viewerId ?? null, ids],
    enabled: enabled && scoped && ids.length > 0,
    queryFn: () => fetchPublishedFollowingOrganizations(ids),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const verified = lookup.isSuccess && lookup.isFetchedAfterMount && !lookup.isFetching;
  return {
    scoped,
    ids,
    organizations: verified ? lookup.data : [],
    isError: enabled && lookup.isError,
    isPending: enabled && ids.length > 0 && !verified && lookup.isPending,
  };
}
