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

export type PublicUxDiagnostics = {
  definitions: {
    routeBacktracking: string;
    deadEnds: string;
    workflowAbandonment: string;
    errorClasses: string;
  };
  routeBacktracking: {
    sessions: number;
    events: number;
    topDestinations: Array<{ destination: string; count: number }>;
  };
  deadEnds: {
    sessions: number;
    topRoutes: Array<{ pathname: string; source: string; count: number }>;
  };
  workflowAbandonment: {
    windowMinutes: number;
    eligibleStarts: number;
    abandoned: number;
    tasks: Array<{
      target: string;
      eligibleStarts: number;
      abandoned: number;
      abandonmentRate: number;
    }>;
  };
  errors: {
    total: number;
    classes: Array<{ errorClass: string; count: number }>;
    routes: Array<{ pathname: string; errorClass: string; count: number }>;
  };
};

export type PublicUxMetrics = {
  schemaVersion: number;
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
  /**
   * Null only when an older server projection is still deployed. Missing V2
   * diagnostics remain visibly unavailable instead of being parsed as zero.
   */
  diagnostics: PublicUxDiagnostics | null;
};

export type PublicWebVitalRouteMetric = {
  pathname: string;
  metric: "LCP" | "INP" | "CLS";
  device: "mobile" | "tablet" | "desktop";
  samples: number;
  p75: number;
  good: number;
  needsImprovement: number;
  poor: number;
};

export type PublicWebVitalsMetrics = {
  since: string;
  generatedAt: string;
  samples: number;
  routes: PublicWebVitalRouteMetric[];
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
  return loadPublicUxMetricsSince(since);
}

export async function loadPublicUxMetricsSince(since: string): Promise<PublicUxMetrics> {
  const { data, error } = await client.rpc("admin_public_ux_metrics", {
    p_since: since,
  });
  if (error) throw new Error(error.message || "Could not load public UX metrics.");
  return parseMetrics(data);
}

export async function loadPublicWebVitalsMetrics(days = 30): Promise<PublicWebVitalsMetrics> {
  const safeDays = Math.max(1, Math.min(180, Math.round(days)));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
  return loadPublicWebVitalsMetricsSince(since);
}

export async function loadPublicWebVitalsMetricsSince(
  since: string,
): Promise<PublicWebVitalsMetrics> {
  const { data, error } = await client.rpc("admin_public_web_vitals", {
    p_since: since,
  });
  if (error) throw new Error(error.message || "Could not load public Web Vitals.");
  return parseWebVitals(data);
}

export async function loadBeta3FirstClickEvidence(days = 90): Promise<Beta3FirstClickEvidence> {
  const safeDays = Math.max(1, Math.min(180, Math.round(days)));
  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client.rpc("admin_beta3_first_click_evidence", {
    p_since: since,
  });
  if (error) throw new Error(error.message || "Could not load Beta 3 first-click evidence.");
  return parseBeta3FirstClickEvidence(data);
}

function parseWebVitals(value: unknown): PublicWebVitalsMetrics {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Public Web Vitals returned an invalid response.");
  }
  const raw = value as Record<string, any>;
  const routes = Array.isArray(raw.routes)
    ? raw.routes
        .filter((item: any) => item && typeof item === "object")
        .map((item: any): PublicWebVitalRouteMetric => ({
          pathname: String(item.pathname ?? "/"),
          metric: item.metric === "INP" || item.metric === "CLS" ? item.metric : "LCP",
          device: item.device === "mobile" || item.device === "tablet" ? item.device : "desktop",
          samples: number(item.samples),
          p75: number(item.p75),
          good: number(item.good),
          needsImprovement: number(item.needsImprovement),
          poor: number(item.poor),
        }))
    : [];

  return {
    since: String(raw.since ?? ""),
    generatedAt: String(raw.generatedAt ?? ""),
    samples: number(raw.samples),
    routes,
  };
}

function parseMetrics(value: unknown): PublicUxMetrics {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Public UX metrics returned an invalid response.");
  }
  const raw = value as Record<string, any>;
  const schemaVersion = number(raw.schemaVersion);
  return {
    schemaVersion,
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
    diagnostics: schemaVersion >= 2 ? parseDiagnostics(raw.diagnostics) : null,
  };
}

function parseDiagnostics(value: unknown): PublicUxDiagnostics {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Public UX diagnostics are missing from a schema-v2 response.");
  }
  const raw = value as Record<string, any>;
  const definitions = raw.definitions;
  const backtracking = raw.routeBacktracking;
  const deadEnds = raw.deadEnds;
  const abandonment = raw.workflowAbandonment;
  const errors = raw.errors;
  if (
    !definitions ||
    !backtracking ||
    !deadEnds ||
    !abandonment ||
    !errors ||
    typeof definitions !== "object" ||
    typeof backtracking !== "object" ||
    typeof deadEnds !== "object" ||
    typeof abandonment !== "object" ||
    typeof errors !== "object"
  ) {
    throw new Error("Public UX diagnostics returned an incomplete schema-v2 response.");
  }

  return {
    definitions: {
      routeBacktracking: String(definitions.routeBacktracking ?? ""),
      deadEnds: String(definitions.deadEnds ?? ""),
      workflowAbandonment: String(definitions.workflowAbandonment ?? ""),
      errorClasses: String(definitions.errorClasses ?? ""),
    },
    routeBacktracking: {
      sessions: number(backtracking.sessions),
      events: number(backtracking.events),
      topDestinations: Array.isArray(backtracking.topDestinations)
        ? backtracking.topDestinations.map((item: any) => ({
            destination: String(item?.destination ?? "unknown"),
            count: number(item?.count),
          }))
        : [],
    },
    deadEnds: {
      sessions: number(deadEnds.sessions),
      topRoutes: Array.isArray(deadEnds.topRoutes)
        ? deadEnds.topRoutes.map((item: any) => ({
            pathname: String(item?.pathname ?? "/"),
            source: String(item?.source ?? "unknown"),
            count: number(item?.count),
          }))
        : [],
    },
    workflowAbandonment: {
      windowMinutes: number(abandonment.windowMinutes),
      eligibleStarts: number(abandonment.eligibleStarts),
      abandoned: number(abandonment.abandoned),
      tasks: Array.isArray(abandonment.tasks)
        ? abandonment.tasks.map((item: any) => ({
            target: String(item?.target ?? "unknown"),
            eligibleStarts: number(item?.eligibleStarts),
            abandoned: number(item?.abandoned),
            abandonmentRate: number(item?.abandonmentRate),
          }))
        : [],
    },
    errors: {
      total: number(errors.total),
      classes: Array.isArray(errors.classes)
        ? errors.classes.map((item: any) => ({
            errorClass: String(item?.error_class ?? "unexpected"),
            count: number(item?.count),
          }))
        : [],
      routes: Array.isArray(errors.routes)
        ? errors.routes.map((item: any) => ({
            pathname: String(item?.pathname ?? "/"),
            errorClass: String(item?.error_class ?? "unexpected"),
            count: number(item?.count),
          }))
        : [],
    },
  };
}

function rows(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          ...(item as Record<string, unknown>),
          count: number((item as any).count),
        }))
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
          .map((item: any): Beta3FirstClickRunCount => ({
            task: String(item.task ?? ""),
            started: number(item.started),
          }))
          .filter((item: Beta3FirstClickRunCount) => item.task)
      : [],
    firstClicks: Array.isArray(raw.firstClicks)
      ? raw.firstClicks
          .filter((item: any) => item && typeof item === "object")
          .map((item: any): Beta3FirstClickTargetCount => ({
            task: String(item.task ?? ""),
            target: String(item.target ?? ""),
            count: number(item.count),
          }))
          .filter((item: Beta3FirstClickTargetCount) => item.task && item.target)
      : [],
  };
}
