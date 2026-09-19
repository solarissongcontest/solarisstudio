import { supabase } from "@/integrations/supabase/client";
import type {
  Beta3FirstClickEvidence,
  Beta3FirstClickRunCount,
  Beta3FirstClickTargetCount,
} from "@/lib/beta3-release-evidence";

export type PublicUxCount = {
  count: number;
};

export type PublicUxDestinationCount = PublicUxCount & {
  target?: string | null;
  destination?: string | null;
};

export type PublicUxGroupCount = PublicUxCount & {
  group_name?: string | null;
  bucket?: string | null;
  device?: string | null;
};

export type PublicUxTaskMetric = {
  target: string;
  started: number;
  completed: number;
  completionRate: number;
};

export type PublicUxMetrics = {
  since: string;
  generatedAt: string;
  totals: {
    events: number;
    sessions: number;
    users: number;
  };
  navigation: {
    topDestinations: PublicUxDestinationCount[];
    firstClicks: PublicUxDestinationCount[];
  };
  search: {
    opened: number;
    submitted: number;
    noResults: number;
    resultClicks: number;
    clickedGroups: PublicUxGroupCount[];
    queryLengthBuckets: PublicUxGroupCount[];
    rescueSessions: number;
  };
  friction: {
    highStepSessions: number;
    repeatedSectionSessions: number;
  };
  tasks: PublicUxTaskMetric[];
  devices: PublicUxGroupCount[];
};

type MetricsRpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

const client = supabase as unknown as MetricsRpcClient;

export async function loadPublicUxMetrics(days = 30): Promise<PublicUxMetrics> {
  const safeDays = Math.max(1, Math.min(180, Math.round(days)));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client.rpc("admin_public_ux_metrics", {
    p_since: since,
  });
  if (error) throw new Error(error.message || "Could not load public UX metrics.");
  return parseMetrics(data);
}


export async function loadBeta3FirstClickEvidence(
  days = 90,
): Promise<Beta3FirstClickEvidence> {
  const safeDays = Math.max(1, Math.min(180, Math.round(days)));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client.rpc("admin_beta3_first_click_evidence", {
    p_since: since,
  });
  if (error) throw new Error(error.message || "Could not load Beta 3 first-click evidence.");
  return parseBeta3FirstClickEvidence(data);
}

function parseMetrics(value: unknown): PublicUxMetrics {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Public UX metrics returned an invalid response.");
  }
  const raw = value as Record<string, any>;
  return {
    since: String(raw.since ?? ""),
    generatedAt: String(raw.generatedAt ?? ""),
    totals: {
      events: number(raw.totals?.events),
      sessions: number(raw.totals?.sessions),
      users: number(raw.totals?.users),
    },
    navigation: {
      topDestinations: rows(raw.navigation?.topDestinations),
      firstClicks: rows(raw.navigation?.firstClicks),
    },
    search: {
      opened: number(raw.search?.opened),
      submitted: number(raw.search?.submitted),
      noResults: number(raw.search?.noResults),
      resultClicks: number(raw.search?.resultClicks),
      clickedGroups: rows(raw.search?.clickedGroups),
      queryLengthBuckets: rows(raw.search?.queryLengthBuckets),
      rescueSessions: number(raw.search?.rescueSessions),
    },
    friction: {
      highStepSessions: number(raw.friction?.highStepSessions),
      repeatedSectionSessions: number(raw.friction?.repeatedSectionSessions),
    },
    tasks: Array.isArray(raw.tasks)
      ? raw.tasks.map((item: any) => ({
          target: String(item?.target ?? "unknown"),
          started: number(item?.started),
          completed: number(item?.completed),
          completionRate: number(item?.completionRate),
        }))
      : [],
    devices: rows(raw.devices),
  };
}

function rows(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item) => item && typeof item === "object")
        .map((item) => ({ ...(item as Record<string, unknown>), count: number((item as any).count) }))
    : [];
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}


function parseBeta3FirstClickEvidence(value: unknown): Beta3FirstClickEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Beta 3 first-click evidence returned an invalid response.");
  }
  const raw = value as Record<string, any>;
  return {
    since: String(raw.since ?? ""),
    runs: Array.isArray(raw.runs)
      ? raw.runs
          .filter((item: any) => item && typeof item === "object")
          .map(
            (item: any): Beta3FirstClickRunCount => ({
              task: String(item.task ?? ""),
              started: number(item.started),
            }),
          )
          .filter((item: Beta3FirstClickRunCount) => item.task)
      : [],
    firstClicks: Array.isArray(raw.firstClicks)
      ? raw.firstClicks
          .filter((item: any) => item && typeof item === "object")
          .map(
            (item: any): Beta3FirstClickTargetCount => ({
              task: String(item.task ?? ""),
              target: String(item.target ?? ""),
              count: number(item.count),
            }),
          )
          .filter((item: Beta3FirstClickTargetCount) => item.task && item.target)
      : [],
  };
}
