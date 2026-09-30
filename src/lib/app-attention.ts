import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import type { AccountAccess } from "@/lib/country-account";
import { useEditions } from "@/lib/data";
import { useContentEvents, useEventReads } from "@/lib/engagement-data";
import {
  participationTaskCounts,
  tasksFromHodWorkspace,
} from "@/lib/participation-os";
import { setSolarisAppBadge } from "@/lib/platform";
import { loadStudio2HodWorkspace } from "@/lib/studio2-hod-workspace";

export type AppAttentionState = {
  participateBadge: number;
  meBadge: number;
  osBadge: number;
};

function currentEditionFrom<T extends {
  id: string;
  edition_number?: number | null;
  status?: string | null;
}>(editions: readonly T[]) {
  const sorted = [...editions].sort(
    (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
  );
  return (
    sorted.find(
      (edition) =>
        !["complete", "completed", "finished", "archived"].includes(
          String(edition.status ?? "").trim().toLowerCase(),
        ),
    ) ??
    sorted[0] ??
    null
  );
}

export function useAppAttention({
  access,
  enabled,
  canBadge,
}: {
  access: AccountAccess;
  enabled: boolean;
  canBadge: boolean;
}): AppAttentionState {
  const editionsQuery = useEditions();
  const eventsQuery = useContentEvents(50);
  const readsQuery = useEventReads(access.userId ?? undefined);

  const edition = useMemo(
    () => currentEditionFrom(editionsQuery.data ?? []),
    [editionsQuery.data],
  );

  const workspaceQuery = useQuery({
    queryKey: [
      "app-attention-workspace",
      edition?.id ?? "none",
      access.countryId ?? "none",
    ],
    enabled: enabled && Boolean(edition?.id && access.countryId),
    queryFn: () => loadStudio2HodWorkspace(edition!.id, access.countryId!),
    staleTime: 30_000,
    retry: 1,
  });

  const participateBadge = useMemo(() => {
    if (!workspaceQuery.data) return 0;
    return Math.min(
      99,
      participationTaskCounts(tasksFromHodWorkspace(workspaceQuery.data)).needsAction,
    );
  }, [workspaceQuery.data]);

  const meBadge = useMemo(() => {
    if (!access.userId) return 0;
    const read = new Set((readsQuery.data ?? []).map((item) => item.event_id));
    return Math.min(
      99,
      (eventsQuery.data?.events ?? []).filter(
        (event) => event.importance === "important" && !read.has(event.id),
      ).length,
    );
  }, [access.userId, eventsQuery.data?.events, readsQuery.data]);

  const osBadge = meBadge;

  useEffect(() => {
    if (!enabled || !canBadge) return;
    void setSolarisAppBadge(osBadge).catch(() => undefined);
  }, [canBadge, enabled, osBadge]);

  return {
    participateBadge,
    meBadge,
    osBadge,
  };
}
