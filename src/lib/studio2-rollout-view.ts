import type { SolarisFeatureFlag } from "@/lib/feature-flags";
import {
  studio2SurfaceFor,
  type Studio2SurfaceState,
} from "@/lib/studio2-product-surfaces";

export type Studio2RolloutView =
  | "active"
  | "foundations"
  | "available"
  | "planned"
  | "external";

export type Studio2RolloutRowLike = {
  key: SolarisFeatureFlag;
  enabled: boolean;
};

export const STUDIO2_ROLLOUT_VIEWS: ReadonlyArray<{
  id: Studio2RolloutView;
  label: string;
  description: string;
}> = [
  {
    id: "active",
    label: "Active",
    description: "Enabled user-facing Studio 2 product surfaces.",
  },
  {
    id: "foundations",
    label: "Foundations",
    description: "Shared engines and permission foundations used by product surfaces.",
  },
  {
    id: "available",
    label: "Available",
    description: "Implemented product surfaces that are eligible for rollout but currently disabled.",
  },
  {
    id: "planned",
    label: "Planned",
    description: "Reserved roadmap flags. These remain rollout-locked until their product slice exists.",
  },
  {
    id: "external",
    label: "External",
    description: "Features owned by another workstream and intentionally not controlled here.",
  },
] as const;

export function rolloutViewFor(row: Studio2RolloutRowLike): Studio2RolloutView {
  const surface = studio2SurfaceFor(row.key);

  if (surface.state === "foundation") return "foundations";
  if (surface.state === "planned") return "planned";
  if (surface.state === "external_workstream") return "external";
  if (row.enabled) return "active";
  return "available";
}

export function rowsForRolloutView<T extends Studio2RolloutRowLike>(
  rows: readonly T[],
  view: Studio2RolloutView,
): T[] {
  return rows.filter((row) => rolloutViewFor(row) === view);
}

export function rolloutViewCounts(rows: readonly Studio2RolloutRowLike[]) {
  return STUDIO2_ROLLOUT_VIEWS.reduce<Record<Studio2RolloutView, number>>(
    (counts, view) => {
      counts[view.id] = rowsForRolloutView(rows, view.id).length;
      return counts;
    },
    {
      active: 0,
      foundations: 0,
      available: 0,
      planned: 0,
      external: 0,
    },
  );
}

export function rolloutStateSummary(
  state: Studio2SurfaceState,
  enabled: boolean,
): string {
  if (state === "foundation") {
    return enabled ? "Foundation enabled" : "Foundation available";
  }
  if (state === "planned") return "Roadmap only";
  if (state === "external_workstream") return "External workstream";
  return enabled ? "Live product surface" : "Ready for rollout";
}
