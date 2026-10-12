import type { V3BootstrapProjection } from "./v3-bootstrap";
import {
  loadV3BootstrapProjection,
  normalizeV3BootstrapServerRequest,
  type V3BootstrapServerRequest,
  type V3BootstrapServerSnapshot,
  type V3BootstrapServerSource,
} from "./v3-bootstrap-server";

export type V3PrimaryHomeListItem = {
  id: string;
  title: string;
  description: string;
  to?: string;
};

export type V3PrimaryHomeStat = {
  value: string;
  label: string;
};

export type V3PrimaryActionProgress = {
  current: number;
  total: number;
  label?: string;
};

export type V3PrimarySurfaceSupplement = {
  upcoming: readonly V3PrimaryHomeListItem[];
  latest: readonly V3PrimaryHomeListItem[];
  contestStats?: readonly V3PrimaryHomeStat[];
  liveShowLabel?: string | null;
  resultsLabel?: string | null;
  progressByActionId?: Readonly<Record<string, V3PrimaryActionProgress>>;
};

export type V3PrimarySurfaceServerSnapshot = V3BootstrapServerSnapshot & {
  primarySurfaces: V3PrimarySurfaceSupplement;
};

export type V3PrimarySurfaceServerSource = Omit<
  V3BootstrapServerSource,
  "loadSnapshot"
> & {
  loadSnapshot(
    request: V3BootstrapServerRequest,
  ): Promise<V3PrimarySurfaceServerSnapshot>;
};

export type V3PrimarySurfaceBundle = {
  bootstrap: V3BootstrapProjection;
  shell: {
    editionLabel: string;
    phaseLabel: string | null;
    participateAttentionCount: number;
  };
  home: {
    bootstrap: V3BootstrapProjection;
    currentContest: {
      title: string;
      headline: string;
      meta: string | null;
      stats: readonly V3PrimaryHomeStat[];
      liveHeadline: string | null;
      resultsHeadline: string | null;
    };
    upcoming: readonly V3PrimaryHomeListItem[];
    latest: readonly V3PrimaryHomeListItem[];
    liveShowLabel: string | null;
    resultsLabel: string | null;
  };
  participate: {
    bootstrap: V3BootstrapProjection;
    progressByActionId: Readonly<Record<string, V3PrimaryActionProgress>>;
    delegationLabel: string | null;
  };
};

function required(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty`);
  return normalized;
}

function optionalLabel(value: string | null | undefined, label: string) {
  if (value == null) return null;
  return required(value, label);
}

function internalRoute(value: string | undefined, label: string) {
  if (value == null) return undefined;
  const normalized = required(value, label);
  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    throw new Error(`${label} must be an internal Solaris route`);
  }
  return normalized;
}

function normalizeList(
  items: readonly V3PrimaryHomeListItem[],
  label: string,
): readonly V3PrimaryHomeListItem[] {
  if (!Array.isArray(items)) {
    throw new Error(`${label} must be supplied by the shared server snapshot`);
  }

  const seen = new Set<string>();
  return items.map((item, index) => {
    const id = required(item.id, `${label}[${index}].id`);
    if (seen.has(id)) throw new Error(`${label} contains duplicate id ${id}`);
    seen.add(id);
    return {
      id,
      title: required(item.title, `${label}[${index}].title`),
      description: required(
        item.description,
        `${label}[${index}].description`,
      ),
      to: internalRoute(item.to, `${label}[${index}].to`),
    };
  });
}

function normalizeStats(
  stats: readonly V3PrimaryHomeStat[] | undefined,
): readonly V3PrimaryHomeStat[] {
  if (!stats) return [];
  return stats.map((stat, index) => ({
    value: required(stat.value, `contestStats[${index}].value`),
    label: required(stat.label, `contestStats[${index}].label`),
  }));
}

function normalizeProgress(
  progress: Readonly<Record<string, V3PrimaryActionProgress>> | undefined,
): Readonly<Record<string, V3PrimaryActionProgress>> {
  if (!progress) return {};
  const normalized: Record<string, V3PrimaryActionProgress> = {};

  for (const [rawActionId, value] of Object.entries(progress)) {
    const actionId = required(rawActionId, "progress action id");
    if (!Number.isFinite(value.current) || value.current < 0) {
      throw new Error(
        `progress ${actionId}.current must be a non-negative number`,
      );
    }
    if (!Number.isFinite(value.total) || value.total <= 0) {
      throw new Error(`progress ${actionId}.total must be a positive number`);
    }
    if (value.current > value.total) {
      throw new Error(`progress ${actionId}.current cannot exceed total`);
    }
    normalized[actionId] = {
      current: value.current,
      total: value.total,
      label:
        value.label == null
          ? undefined
          : required(value.label, `progress ${actionId}.label`),
    };
  }

  return normalized;
}

function contestTitle(
  snapshot: V3PrimarySurfaceServerSnapshot,
  bootstrap: V3BootstrapProjection,
) {
  const editionName = snapshot.publicContest.edition?.name?.trim();
  return editionName || bootstrap.context.editionLabel || "Solaris";
}

function projectPrimarySurfaceBundle(
  snapshot: V3PrimarySurfaceServerSnapshot,
  bootstrap: V3BootstrapProjection,
): V3PrimarySurfaceBundle {
  if (!snapshot.primarySurfaces || typeof snapshot.primarySurfaces !== "object") {
    throw new Error(
      "V3 primary surfaces require supplemental Home/Participate data in the shared server snapshot",
    );
  }

  const upcoming = normalizeList(snapshot.primarySurfaces.upcoming, "upcoming");
  const latest = normalizeList(snapshot.primarySurfaces.latest, "latest");
  const stats = normalizeStats(snapshot.primarySurfaces.contestStats);
  const progressByActionId = normalizeProgress(
    snapshot.primarySurfaces.progressByActionId,
  );
  const publicContest = snapshot.publicContest;
  const liveHeadline =
    publicContest.phase === "live" ? publicContest.headline : null;
  const resultsHeadline =
    publicContest.phase === "results_published" ? publicContest.headline : null;

  return {
    bootstrap,
    shell: {
      editionLabel: bootstrap.context.editionLabel ?? "Solaris",
      phaseLabel: publicContest.statusLabel?.trim() || null,
      participateAttentionCount: bootstrap.attention.badgeCount,
    },
    home: {
      bootstrap,
      currentContest: {
        title: contestTitle(snapshot, bootstrap),
        headline: required(publicContest.headline, "publicContest.headline"),
        meta: optionalLabel(
          publicContest.description,
          "publicContest.description",
        ),
        stats,
        liveHeadline,
        resultsHeadline,
      },
      upcoming,
      latest,
      liveShowLabel: optionalLabel(
        snapshot.primarySurfaces.liveShowLabel,
        "liveShowLabel",
      ),
      resultsLabel: optionalLabel(
        snapshot.primarySurfaces.resultsLabel,
        "resultsLabel",
      ),
    },
    participate: {
      bootstrap,
      progressByActionId,
      delegationLabel: bootstrap.context.delegationName,
    },
  };
}

/**
 * Loads the authorized canonical snapshot exactly once and projects Home,
 * Participate and shell props from that same evidence object.
 *
 * `loadV3BootstrapProjection` still owns bootstrap scope/timestamp validation.
 * The canonical source is invoked once with the normalized request; the exact
 * in-memory snapshot is then handed to the parent bootstrap projector through a
 * zero-I/O adapter. No second reader or client fetch is permitted here.
 */
export async function loadV3PrimarySurfaceBundle(
  request: V3BootstrapServerRequest,
  source: V3PrimarySurfaceServerSource,
): Promise<V3PrimarySurfaceBundle> {
  const normalizedRequest = normalizeV3BootstrapServerRequest(request);
  const snapshot = await source.loadSnapshot(normalizedRequest);
  const bootstrap = await loadV3BootstrapProjection(normalizedRequest, {
    async loadSnapshot() {
      return snapshot;
    },
  });

  return projectPrimarySurfaceBundle(snapshot, bootstrap);
}
