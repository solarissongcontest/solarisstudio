import type { ReactNode } from "react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import { useNotificationPreferences } from "@/lib/engagement-data";
import {
  useV3EditionRolloutProbe,
  useV3RolloutProbe,
} from "@/lib/v3-primary-runtime";
import { resolveV3ResultsSpoilerProtection } from "@/lib/v3-results";
import {
  useV3StoriesIndexBundle,
  useV3StoryDetailBundle,
} from "@/lib/v3-stories-runtime";
import { V3Screen, V3Surface } from "./V3Foundation";
import { V3StoriesIndexScreen } from "./V3StoriesIndexScreen";
import { V3StoryDetailScreen } from "./V3StoryDetailScreen";

function LoadingStories({ title }: { title: string }) {
  return (
    <V3AppShell editionLabel="Solaris Studio" phaseLabel="Stories" activeArea="explore">
      <V3Screen>
        <V3Surface className="p-5">
          <h1 className="text-2xl font-bold">{title}</h1>
          <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
            Opening published Solaris stories…
          </p>
        </V3Surface>
      </V3Screen>
    </V3AppShell>
  );
}

function StoriesUnavailable({
  title,
  retrying,
  onRetry,
}: {
  title: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <V3AppShell editionLabel="Solaris Studio" phaseLabel="Stories" activeArea="explore">
      <V3Screen>
        <V3Surface className="p-5" data-v3-stories-state="error">
          <p className="v3-kicker">Explore · Stories</p>
          <h1 className="mt-2 text-2xl font-bold">{title}</h1>
          <p role="alert" className="mt-2 max-w-2xl text-sm leading-6 text-[var(--v3-text-secondary)]">
            Solaris could not verify the publication-safe story projection. The V3 route stays fail-closed instead of switching to a second data path or exposing unverified story content.
          </p>
          <button
            type="button"
            disabled={retrying}
            onClick={onRetry}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[var(--v3-border-subtle)] px-4 text-sm font-semibold disabled:cursor-wait disabled:opacity-50"
          >
            {retrying ? "Retrying…" : "Retry published stories"}
          </button>
        </V3Surface>
      </V3Screen>
    </V3AppShell>
  );
}

function useSharedSpoilerProtection(
  rollout: ReturnType<typeof useV3RolloutProbe> | ReturnType<typeof useV3EditionRolloutProbe>,
) {
  const { preferences } = useAppExperiencePreferences();
  const serverPreferences = useNotificationPreferences(rollout.data?.userId ?? undefined);

  return resolveV3ResultsSpoilerProtection({
    localSpoilerFree: preferences.spoilerFree,
    viewerResolved: Boolean(rollout.data),
    viewerId: rollout.data?.userId ?? null,
    serverPending: serverPreferences.isPending,
    serverError: serverPreferences.isError,
    serverSpoilerFree: serverPreferences.data?.spoiler_free ?? null,
  });
}

/**
 * Stories follows the same reversible authority rule as the other V3 Public
 * surfaces: rollout authority is resolved before the V3 read graph starts.
 * Before V3 is selected, legacy remains the safe compatibility path. Once the
 * server rollout selects V3, an initial Story read failure stays visibly
 * fail-closed in V3, and later refetch failures keep cached publication-safe V3
 * data mounted instead of switching data paths underneath the viewer.
 */
export function V3StoriesIndexGate({ fallback }: { fallback: ReactNode }) {
  const rollout = useV3RolloutProbe(true);
  const v3Selected =
    rollout.data?.enabled === true && rollout.data.exploreEnabled === true;
  const bundle = useV3StoriesIndexBundle(v3Selected);
  const hideSpoilers = useSharedSpoilerProtection(rollout);

  if (rollout.isLoading && !rollout.data) {
    return <LoadingStories title="Stories" />;
  }

  if (!rollout.data || !v3Selected) {
    return <>{fallback}</>;
  }

  if (bundle.isLoading && !bundle.data) {
    return <LoadingStories title="Stories" />;
  }

  if (!bundle.data) {
    return (
      <StoriesUnavailable
        title="Stories are temporarily unavailable"
        retrying={bundle.isFetching}
        onRetry={() => void bundle.refetch()}
      />
    );
  }

  return (
    <V3AppShell
      editionLabel={bundle.data.shell.editionLabel}
      phaseLabel={bundle.data.shell.phaseLabel}
      activeArea="explore"
    >
      <V3StoriesIndexScreen
        key={`${rollout.data.userId ?? "anonymous"}:${hideSpoilers}`}
        bundle={bundle.data}
        hideSpoilers={hideSpoilers}
      />
    </V3AppShell>
  );
}

export function V3StoryDetailGate({
  editionSlug,
  fallback,
}: {
  editionSlug: string;
  fallback: ReactNode;
}) {
  const rollout = useV3EditionRolloutProbe(editionSlug, Boolean(editionSlug));
  const v3Selected =
    rollout.data?.enabled === true && rollout.data.exploreEnabled === true;
  const bundle = useV3StoryDetailBundle(editionSlug, v3Selected);
  const hideSpoilers = useSharedSpoilerProtection(rollout);

  if (rollout.isLoading && !rollout.data) {
    return <LoadingStories title="Edition Story" />;
  }

  if (!rollout.data || !v3Selected) {
    return <>{fallback}</>;
  }

  if (bundle.isLoading && !bundle.data) {
    return <LoadingStories title="Edition Story" />;
  }

  if (!bundle.data) {
    return (
      <StoriesUnavailable
        title="This published story could not be verified"
        retrying={bundle.isFetching}
        onRetry={() => void bundle.refetch()}
      />
    );
  }

  return (
    <V3AppShell
      editionLabel={bundle.data.shell.editionLabel}
      phaseLabel={bundle.data.shell.phaseLabel}
      activeArea="explore"
    >
      <V3StoryDetailScreen
        key={`${rollout.data.userId ?? "anonymous"}:${editionSlug}:${hideSpoilers}`}
        bundle={bundle.data}
        hideSpoilers={hideSpoilers}
      />
    </V3AppShell>
  );
}
