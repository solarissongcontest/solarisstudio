import { useInfiniteQuery, useMemo } from "@tanstack/react-query";

import {
  v3ParticipantActivityQueryKey,
  type V3ParticipantActivityBundle,
  type V3ParticipantActivityCursor,
} from "./v3-participant-activity";
import { getV3ParticipantActivity } from "./v3-participant-activity.functions";

/**
 * The RPC resolves identity from the authenticated session. The viewer ID is
 * used only for browser-cache partitioning and to disable the query until
 * the route and authenticated identity agree. Each page is at most 30 items.
 */
export function useV3ParticipantActivity(
  viewerId: string | null | undefined,
  enabled: boolean,
) {
  const scopedViewerId = viewerId?.trim() || null;
  const query = useInfiniteQuery({
    queryKey: v3ParticipantActivityQueryKey(scopedViewerId),
    initialPageParam: { before: null, operationId: null } as V3ParticipantActivityCursor,
    queryFn: ({ pageParam }) => getV3ParticipantActivity({ data: pageParam }),
    getNextPageParam: (lastPage: V3ParticipantActivityBundle) =>
      lastPage.schemaReady && lastPage.nextBefore && lastPage.nextOperationId
        ? { before: lastPage.nextBefore, operationId: lastPage.nextOperationId }
        : undefined,
    enabled: enabled && Boolean(scopedViewerId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const data = useMemo(() => {
    if (!query.data?.pages.length) return undefined;
    const first = query.data.pages[0];
    const last = query.data.pages[query.data.pages.length - 1];
    return {
      ...first,
      items: query.data.pages.flatMap((page) => page.items),
      nextBefore: last.nextBefore,
      nextOperationId: last.nextOperationId,
    };
  }, [query.data]);

  return { ...query, data };
}
