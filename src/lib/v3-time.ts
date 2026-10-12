export type V3ServerClock = {
  serverTime: string;
  observedClientTimeMs: number;
  serverTimeMs: number;
  offsetMs: number;
};

export type V3DeadlineState =
  | "invalid"
  | "expired"
  | "immediate"
  | "soon"
  | "today"
  | "future";

export type V3DeadlineProjection = {
  deadline: string;
  serverNowMs: number;
  deadlineMs: number | null;
  remainingMs: number | null;
  state: V3DeadlineState;
};

function parseTimestamp(value: string, label: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`V3 time model requires a valid ${label} timestamp.`);
  return parsed;
}

/**
 * Capture the relationship between the authoritative server clock and the
 * client's monotonic-ish wall clock at the moment the response is observed.
 * Later countdowns advance from this offset instead of trusting the device's
 * configured date/time as contest truth.
 */
export function createV3ServerClock(serverTime: string, observedClientTimeMs = Date.now()): V3ServerClock {
  if (!Number.isFinite(observedClientTimeMs)) {
    throw new Error("V3 time model requires a valid observed client time.");
  }
  const serverTimeMs = parseTimestamp(serverTime, "serverTime");
  return {
    serverTime,
    observedClientTimeMs,
    serverTimeMs,
    offsetMs: serverTimeMs - observedClientTimeMs,
  };
}

export function v3ServerNowMs(clock: V3ServerClock, clientNowMs = Date.now()) {
  if (!Number.isFinite(clientNowMs)) throw new Error("V3 time model requires a valid clientNow value.");
  return clientNowMs + clock.offsetMs;
}

export function projectV3Deadline(
  deadline: string,
  clock: V3ServerClock,
  clientNowMs = Date.now(),
): V3DeadlineProjection {
  const serverNowMs = v3ServerNowMs(clock, clientNowMs);
  const deadlineMs = Date.parse(deadline);

  if (!Number.isFinite(deadlineMs)) {
    return {
      deadline,
      serverNowMs,
      deadlineMs: null,
      remainingMs: null,
      state: "invalid",
    };
  }

  const remainingMs = deadlineMs - serverNowMs;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;

  return {
    deadline,
    serverNowMs,
    deadlineMs,
    remainingMs,
    state:
      remainingMs <= 0
        ? "expired"
        : remainingMs <= hour
          ? "immediate"
          : remainingMs <= 3 * hour
            ? "soon"
            : remainingMs <= day
              ? "today"
              : "future",
  };
}

export type V3TimeDisplay = {
  official: string;
  user: string | null;
  sameZone: boolean;
};

export function formatV3ContestTime(
  timestamp: string,
  officialTimeZone: string,
  userTimeZone?: string | null,
  locale = "en-GB",
): V3TimeDisplay {
  const time = parseTimestamp(timestamp, "contest time");
  const date = new Date(time);

  const formatter = (timeZone: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).format(date);

  const official = formatter(officialTimeZone);
  const userZone = userTimeZone?.trim() || null;
  const sameZone = !userZone || userZone === officialTimeZone;

  return {
    official,
    user: sameZone ? null : formatter(userZone),
    sameZone,
  };
}

export function formatV3Countdown(remainingMs: number) {
  if (!Number.isFinite(remainingMs)) return "Unknown";
  if (remainingMs <= 0) return "Closed";

  const second = 1000;
  const minute = 60 * second;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (remainingMs < 10 * minute) {
    const totalSeconds = Math.max(0, Math.floor(remainingMs / second));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  if (remainingMs < hour) {
    return `${Math.ceil(remainingMs / minute)}m`;
  }

  if (remainingMs < day) {
    const totalMinutes = Math.ceil(remainingMs / minute);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(remainingMs / day);
  const hours = Math.floor((remainingMs % day) / hour);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}
