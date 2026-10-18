import type { ReactNode } from "react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import {
  useV3EditionRolloutProbe,
  useV3RolloutProbe,
} from "@/lib/v3-primary-runtime";
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

export function V3StoriesIndexGate({ fallback }: { fallback: ReactNode }) {
  const bundle = useV3StoriesIndexBundle(true);
  const rollout = useV3RolloutProbe(bundle.isSuccess);

  if (bundle.isLoading || (bundle.isSuccess && rollout.isLoading)) {
    return <LoadingStories title="Stories" />;
  }

  if (bundle.isError || !bundle.data || rollout.isError || !rollout.data) {
    return <>{fallback}</>;
  }

  if (rollout.data.enabled !== true || rollout.data.exploreEnabled !== true) {
    return <>{fallback}</>;
  }

  return (
    <V3AppShell
      editionLabel={bundle.data.shell.editionLabel}
      phaseLabel={bundle.data.shell.phaseLabel}
      activeArea="explore"
    >
      <V3StoriesIndexScreen bundle={bundle.data} />
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
  const bundle = useV3StoryDetailBundle(editionSlug, true);
  const rollout = useV3EditionRolloutProbe(editionSlug, Boolean(editionSlug));

  if (bundle.isLoading || rollout.isLoading) {
    return <LoadingStories title="Edition Story" />;
  }

  if (bundle.isError || !bundle.data || rollout.isError || !rollout.data) {
    return <>{fallback}</>;
  }

  if (rollout.data.enabled !== true || rollout.data.exploreEnabled !== true) {
    return <>{fallback}</>;
  }

  return (
    <V3AppShell
      editionLabel={bundle.data.shell.editionLabel}
      phaseLabel={bundle.data.shell.phaseLabel}
      activeArea="explore"
    >
      <V3StoryDetailScreen bundle={bundle.data} />
    </V3AppShell>
  );
}
