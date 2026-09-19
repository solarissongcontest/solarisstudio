import { supabase } from "@/integrations/supabase/client";

export type PublicUxEventName =
  | "public_nav_clicked"
  | "section_nav_clicked"
  | "search_opened"
  | "search_submitted"
  | "search_result_clicked"
  | "search_no_results"
  | "breadcrumb_clicked"
  | "advanced_section_opened"
  | "task_started"
  | "task_completed"
  | "hub_primary_clicked";

export type PublicUxMetadata = {
  device?: "mobile" | "tablet" | "desktop";
  area?: string;
  group?: string;
  query_length?: number;
  result_count?: number;
  source?: string;
  visibility?: string;
  task_status?: string;
  interaction?: string;
  beta_task?: string;
};

type PublicUxEventOptions = {
  target?: string | null;
  metadata?: PublicUxMetadata;
};

type UxRpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

const client = supabase as unknown as UxRpcClient;
const SESSION_KEY = "solaris:public-ux-session:v1";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type StoredSession = {
  id: string;
  createdAt: number;
};

export function publicUxDevice(): PublicUxMetadata["device"] {
  if (typeof window === "undefined") return "desktop";
  if (window.innerWidth < 640) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

export function getPublicUxSessionId(
  storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage,
  now = Date.now(),
) {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredSession>;
      if (
        typeof parsed.id === "string" &&
        parsed.id.length >= 8 &&
        typeof parsed.createdAt === "number" &&
        now - parsed.createdAt < SESSION_MAX_AGE_MS
      ) {
        return parsed.id;
      }
    }
  } catch {
    // A blocked or malformed localStorage entry should never break navigation.
  }

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `ux-${now.toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

  try {
    storage.setItem(SESSION_KEY, JSON.stringify({ id, createdAt: now }));
  } catch {
    // Telemetry is optional; the product still works when storage is unavailable.
  }

  return id;
}

export function trackPublicUxEvent(
  eventName: PublicUxEventName,
  options: PublicUxEventOptions = {},
) {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/admin")) return;

  const metadata = sanitizeMetadata({
    ...options.metadata,
    device: options.metadata?.device ?? publicUxDevice(),
  });

  const payload = {
    p_event_name: eventName,
    p_session_id: getPublicUxSessionId(),
    p_pathname: safePathname(window.location.pathname),
    p_target: safeTarget(options.target),
    p_metadata: metadata,
  };

  // UX measurement must never delay a user's click or submission.
  void Promise.resolve(client.rpc("record_public_ux_event", payload)).catch(() => undefined);
}

function sanitizeMetadata(metadata: PublicUxMetadata): PublicUxMetadata {
  const clean: PublicUxMetadata = {};

  if (metadata.device) clean.device = metadata.device;
  for (const key of [
    "area",
    "group",
    "source",
    "visibility",
    "task_status",
    "interaction",
    "beta_task",
  ] as const) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) clean[key] = value.trim().slice(0, 120);
  }

  if (Number.isFinite(metadata.query_length)) {
    clean.query_length = Math.max(0, Math.min(500, Math.round(metadata.query_length!)));
  }
  if (Number.isFinite(metadata.result_count)) {
    clean.result_count = Math.max(0, Math.min(10_000, Math.round(metadata.result_count!)));
  }

  return clean;
}

function safePathname(value: string) {
  const path = value.startsWith("/") ? value : "/";
  return path.slice(0, 512);
}

function safeTarget(value?: string | null) {
  if (!value) return null;
  return value.slice(0, 512);
}
