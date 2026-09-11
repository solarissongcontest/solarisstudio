import { diffSubmissionSnapshots, type SubmissionChange, type SubmissionSnapshot } from './submission-versioning';

export type ConfirmationVersionSource = 'legacy_edit' | 'delegate_edit' | 'organizer_restore';

export type StoredConfirmationVersion = {
  id: string;
  submissionId: string;
  version: number;
  snapshot: SubmissionSnapshot;
  createdAt: string;
  changeSource?: ConfirmationVersionSource | null;
  changeReason?: string | null;
  actorUserId?: string | null;
  restoredFromVersionId?: string | null;
};

export type ConfirmationVersionChange = SubmissionChange & {
  label: string;
};

const FIELD_LABELS: Record<string, string> = {
  participating: 'Participation',
  selectionMethod: 'Selection method',
  entryUnknown: 'Entry unknown',
  nfEntriesUnknown: 'National Final entries unknown',
  revealDate: 'Entry reveal date',
  nfDate: 'National Final date',
  nfResultDate: 'National Final result date',
  internalArtist: 'Artist',
  internalSong: 'Song title',
  internalUrl: 'Song URL',
  previewRange: '25s preview',
  finalClipRange: '90s final clip',
  replacementVideo: 'Replacement video',
  nfName: 'National Final name',
  nfExpectedCount: 'Expected NF entries',
  nfWinner: 'National Final winner',
  nfEntries: 'National Final entries',
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function bool(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function range(start: unknown, end: unknown) {
  const from = text(start);
  const to = text(end);
  if (!from) return null;
  return to ? `${from}–${to}` : from;
}

function dateValue(source: Record<string, unknown>, typeKey: string, exactKey: string, approxKey: string) {
  const type = text(source[typeKey]);
  if (!type) return null;
  if (type === 'exact') return text(source[exactKey]);
  return text(source[approxKey]) ?? type;
}

function normalizeNfEntries(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => object(item))
    .map((entry) => ({
      artist: text(entry.artist),
      song: text(entry.song_title),
      url: text(entry.song_url),
      position: typeof entry.position === 'number' ? entry.position : null,
      removed: entry.removed === true,
    }))
    .filter((entry) => !entry.removed)
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));
}

/**
 * Old confirmation snapshots contain sensitive transport/session fields because
 * they were created from to_jsonb(submissions). Never expose the raw snapshot in
 * Organizer UI. This projection deliberately keeps only contest-operational data.
 */
export function projectConfirmationSnapshot(snapshot: SubmissionSnapshot): SubmissionSnapshot {
  const submission = object(snapshot.submission);
  const internal = object(snapshot.internal);
  const nationalFinal = object(snapshot.national_final);

  return {
    participating: bool(submission.participating),
    selectionMethod: text(submission.selection_method),
    entryUnknown: bool(submission.entry_unknown),
    nfEntriesUnknown: bool(submission.nf_entries_unknown),
    revealDate: dateValue(submission, 'reveal_date_type', 'reveal_exact_date', 'reveal_approximate_text'),
    nfDate: dateValue(submission, 'nf_date_type', 'nf_exact_date', 'nf_approximate_text'),
    nfResultDate: dateValue(submission, 'nf_result_date_type', 'nf_result_exact_date', 'nf_result_approximate_text'),
    internalArtist: text(internal.artist),
    internalSong: text(internal.song_title),
    internalUrl: text(internal.song_url),
    previewRange: range(internal.preview_start, internal.preview_end),
    finalClipRange: range(internal.final_clip_start, internal.final_clip_end),
    replacementVideo: internal.replacement_video_required === true ? text(internal.replacement_video_url) ?? 'Required' : null,
    nfName: text(nationalFinal.nf_name),
    nfExpectedCount: typeof nationalFinal.expected_entry_count === 'number' ? nationalFinal.expected_entry_count : null,
    nfWinner: text(nationalFinal.winning_entry_id),
    nfEntries: normalizeNfEntries(snapshot.nf_entries),
  };
}

export function diffConfirmationSnapshots(
  before: SubmissionSnapshot,
  after: SubmissionSnapshot,
): ConfirmationVersionChange[] {
  return diffSubmissionSnapshots(
    projectConfirmationSnapshot(before),
    projectConfirmationSnapshot(after),
  ).map((change) => ({
    ...change,
    label: FIELD_LABELS[change.field] ?? change.field,
  }));
}

export function formatConfirmationVersionValue(value: unknown): string {
  if (value == null || value === '') return 'Not set';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (!value.length) return 'None';
    return value.map((item) => {
      const entry = object(item);
      const artist = text(entry.artist) ?? 'Unknown artist';
      const song = text(entry.song) ?? 'Unknown song';
      return `${artist} — ${song}`;
    }).join('; ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function formatConfirmationVersionSource(source: ConfirmationVersionSource | null | undefined) {
  if (source === 'organizer_restore') return 'Before organizer restore';
  if (source === 'delegate_edit') return 'Before delegation edit';
  return 'Legacy edit';
}
