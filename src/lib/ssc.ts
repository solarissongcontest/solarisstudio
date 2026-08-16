export type SelectionMethod = "internal" | "national_final" | "unknown";
export type DateType = "exact" | "approximate" | "unknown" | "immediately";

export interface NfEntryInput {
  artist: string;
  song_title: string;
  song_url: string;
}

export interface ConfirmationPayload {
  round_id: string;
  instagram_username: string;
  country: string;
  has_country_account: boolean;
  country_account: string;
  participating: boolean;
  selection_method: SelectionMethod | "";
  entry_unknown: boolean;
  nf_entries_unknown: boolean;
  artist: string;
  song_title: string;
  song_url: string;
  preview_start: string;
  preview_end: string;
  final_clip_start: string;
  final_clip_end: string;
  replacement_video_required: boolean;
  replacement_video_url: string;
  nf_name: string;
  expected_entry_count: string;
  nf_entries: NfEntryInput[];
  nf_date_type: DateType | "";
  nf_exact_date: string;
  nf_approximate_text: string;
  nf_result_date_type: DateType | "";
  nf_result_exact_date: string;
  nf_result_approximate_text: string;
  reveal_date_type: DateType | "";
  reveal_exact_date: string;
  reveal_approximate_text: string;
}

export const emptyPayload = (roundId: string): ConfirmationPayload => ({
  round_id: roundId,
  instagram_username: "",
  country: "",
  has_country_account: false,
  country_account: "",
  participating: true,
  selection_method: "",
  entry_unknown: false,
  nf_entries_unknown: false,
  artist: "",
  song_title: "",
  song_url: "",
  preview_start: "",
  preview_end: "",
  final_clip_start: "",
  final_clip_end: "",
  replacement_video_required: false,
  replacement_video_url: "",
  nf_name: "",
  expected_entry_count: "",
  nf_entries: [],
  nf_date_type: "",
  nf_exact_date: "",
  nf_approximate_text: "",
  nf_result_date_type: "",
  nf_result_exact_date: "",
  nf_result_approximate_text: "",
  reveal_date_type: "",
  reveal_exact_date: "",
  reveal_approximate_text: "",
});

export function parseTimestamp(value: string): number | null {
  const match = /^(\d{1,3}):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatTimestamp(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function offsetTimestamp(value: string, seconds: number): string {
  const start = parseTimestamp(value);
  if (start === null) return "";
  return formatTimestamp(start + seconds);
}

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const ENTRY_STATUSES = [
  "Not Participating",
  "Participation Confirmed",
  "Selection Method Unknown",
  "Internal Entry Pending",
  "Internal Entry Submitted",
  "National Final Pending",
  "National Final Entries Submitted",
  "Awaiting NF Result",
  "Winning Entry Submitted",
  "Complete",
] as const;

export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export interface StatusInput {
  participating: boolean;
  selection_method: string | null;
  entry_unknown: boolean;
  nf_entries_unknown: boolean;
  hasInternalSong: boolean;
  nfEntryCount: number;
  winningEntryId: string | null;
  revealKnown: boolean;
}

export function computeEntryStatus(s: StatusInput): EntryStatus {
  if (!s.participating) return "Not Participating";
  if (!s.selection_method || s.selection_method === "unknown") return "Selection Method Unknown";
  if (s.selection_method === "internal") {
    if (s.entry_unknown || !s.hasInternalSong) return "Internal Entry Pending";
    return s.revealKnown ? "Complete" : "Internal Entry Submitted";
  }
  if (s.winningEntryId) return s.revealKnown ? "Complete" : "Winning Entry Submitted";
  if (s.nf_entries_unknown || s.nfEntryCount === 0) return "National Final Pending";
  return "National Final Entries Submitted";
}

export function statusTone(status: EntryStatus): "muted" | "warning" | "accent" | "success" {
  switch (status) {
    case "Not Participating": return "muted";
    case "Complete":
    case "Winning Entry Submitted": return "success";
    case "Internal Entry Submitted":
    case "National Final Entries Submitted": return "accent";
    default: return "warning";
  }
}

export const AVAILABILITY_REASONS = [
  "OPEN",
  "MANUALLY_CLOSED",
  "NOT_OPEN_YET",
  "DEADLINE_PASSED",
  "RESPONSE_LIMIT_REACHED",
  "ROUND_DISABLED",
] as const;

export type AvailabilityReason = (typeof AVAILABILITY_REASONS)[number];

export interface RoundAvailability {
  can_accept: boolean;
  reason: AvailabilityReason;
  count: number;
  limit: number | null;
  remaining: number | null;
  status: string | null;
  opens_at?: string | null;
  closes_at?: string | null;
  server_time?: string;
}

export function availabilityMessage(reason: AvailabilityReason): string {
  switch (reason) {
    case "OPEN": return "This round is accepting responses.";
    case "MANUALLY_CLOSED": return "Confirmations are currently closed.";
    case "NOT_OPEN_YET": return "This round has not opened yet. Please check back later.";
    case "DEADLINE_PASSED": return "The deadline for this round has passed.";
    case "RESPONSE_LIMIT_REACHED": return "This confirmation round has reached its maximum number of submissions.";
    case "ROUND_DISABLED":
    default: return "This round is not available.";
  }
}

export function availabilityBadge(reason: AvailabilityReason): "open" | "closed" | "full" | "scheduled" {
  if (reason === "OPEN") return "open";
  if (reason === "RESPONSE_LIMIT_REACHED") return "full";
  if (reason === "NOT_OPEN_YET") return "scheduled";
  return "closed";
}

export function computeAvailability(input: {
  status: string;
  count: number;
  limit: number | null;
  opens_at: string | null;
  closes_at: string | null;
  edition_active?: boolean;
}): AvailabilityReason {
  const now = Date.now();
  if (input.edition_active === false) return "ROUND_DISABLED";
  if (input.status === "draft") return "ROUND_DISABLED";
  if (input.status === "auto_closed") {
    if (input.limit !== null && input.count >= input.limit) return "RESPONSE_LIMIT_REACHED";
    return "MANUALLY_CLOSED";
  }
  if (input.status === "closed") return "MANUALLY_CLOSED";
  if (input.opens_at && new Date(input.opens_at).getTime() > now) return "NOT_OPEN_YET";
  if (input.closes_at && new Date(input.closes_at).getTime() <= now) return "DEADLINE_PASSED";
  if (input.limit !== null && input.count >= input.limit) return "RESPONSE_LIMIT_REACHED";
  return "OPEN";
}

export function roundStateLabel(
  status: string,
  count: number,
  limit: number | null,
  opensAt: string | null,
  closesAt: string | null,
): "open" | "closed" | "full" | "scheduled" {
  return availabilityBadge(computeAvailability({ status, count, limit, opens_at: opensAt, closes_at: closesAt }));
}
