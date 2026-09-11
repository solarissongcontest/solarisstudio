export type EligibilityLevel = 'pass' | 'warning' | 'blocked';

export type EligibilityContext = {
  countryConfirmed: boolean;
  artistName?: string | null;
  songTitle?: string | null;
  videoUrl?: string | null;
  artworkUrl?: string | null;
  durationSeconds?: number | null;
  broadcasterApproved?: boolean | null;
  duplicateEntryDetected?: boolean;
  deadlinePassed?: boolean;
  editingExceptionGranted?: boolean;
};

export type EligibilityConfig = {
  requireVideo: boolean;
  requireArtwork: boolean;
  requireBroadcasterApproval: boolean;
  maxDurationSeconds: number | null;
  blockDuplicates: boolean;
};

export type EligibilityCheck = {
  id: string;
  label: string;
  level: EligibilityLevel;
  message: string;
};

export type EligibilityResult = {
  status: 'ready' | 'warning' | 'blocked';
  score: number;
  checks: EligibilityCheck[];
  blockers: EligibilityCheck[];
  warnings: EligibilityCheck[];
};

export const DEFAULT_ELIGIBILITY_CONFIG: EligibilityConfig = {
  requireVideo: true,
  requireArtwork: true,
  requireBroadcasterApproval: true,
  maxDurationSeconds: null,
  blockDuplicates: true,
};

function present(value?: string | null) {
  return Boolean(value?.trim());
}

function urlLooksValid(value?: string | null) {
  if (!present(value)) return false;
  try {
    const url = new URL(value!);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function evaluateEntryEligibility(
  context: EligibilityContext,
  config: EligibilityConfig = DEFAULT_ELIGIBILITY_CONFIG,
): EligibilityResult {
  const checks: EligibilityCheck[] = [];
  const add = (id: string, label: string, level: EligibilityLevel, message: string) =>
    checks.push({ id, label, level, message });

  add(
    'country-confirmed',
    'Country eligibility',
    context.countryConfirmed ? 'pass' : 'blocked',
    context.countryConfirmed ? 'Country is confirmed for the edition.' : 'Country is not confirmed for the edition.',
  );

  add(
    'artist',
    'Artist information',
    present(context.artistName) ? 'pass' : 'blocked',
    present(context.artistName) ? 'Artist name is present.' : 'Artist name is missing.',
  );

  add(
    'song',
    'Song information',
    present(context.songTitle) ? 'pass' : 'blocked',
    present(context.songTitle) ? 'Song title is present.' : 'Song title is missing.',
  );

  if (config.requireVideo) {
    add(
      'video',
      'Performance video',
      urlLooksValid(context.videoUrl) ? 'pass' : 'blocked',
      urlLooksValid(context.videoUrl) ? 'Video URL is valid.' : 'A valid video URL is required.',
    );
  } else if (present(context.videoUrl)) {
    add(
      'video',
      'Performance video',
      urlLooksValid(context.videoUrl) ? 'pass' : 'warning',
      urlLooksValid(context.videoUrl) ? 'Video URL is valid.' : 'Optional video URL is malformed.',
    );
  }

  if (config.requireArtwork) {
    add(
      'artwork',
      'Artwork',
      urlLooksValid(context.artworkUrl) ? 'pass' : 'blocked',
      urlLooksValid(context.artworkUrl) ? 'Artwork is available.' : 'Artwork is required.',
    );
  }

  if (config.maxDurationSeconds != null && context.durationSeconds != null) {
    add(
      'duration',
      'Song duration',
      context.durationSeconds <= config.maxDurationSeconds ? 'pass' : 'blocked',
      context.durationSeconds <= config.maxDurationSeconds
        ? 'Song duration is within the configured limit.'
        : `Song exceeds the ${config.maxDurationSeconds}-second duration limit.`,
    );
  }

  if (config.requireBroadcasterApproval) {
    const approved = context.broadcasterApproved === true;
    add(
      'broadcaster-approval',
      'Broadcaster approval',
      approved ? 'pass' : 'blocked',
      approved ? 'Broadcaster approval is recorded.' : 'Broadcaster approval is still required.',
    );
  }

  if (context.duplicateEntryDetected) {
    add(
      'duplicate',
      'Duplicate check',
      config.blockDuplicates ? 'blocked' : 'warning',
      'A possible duplicate entry was detected and needs review.',
    );
  } else {
    add('duplicate', 'Duplicate check', 'pass', 'No duplicate entry was detected.');
  }

  if (context.deadlinePassed && !context.editingExceptionGranted) {
    add('deadline', 'Submission deadline', 'blocked', 'The submission deadline has passed and no exception is recorded.');
  } else if (context.deadlinePassed && context.editingExceptionGranted) {
    add('deadline', 'Submission deadline', 'warning', 'The deadline has passed, but an editing exception is active.');
  } else {
    add('deadline', 'Submission deadline', 'pass', 'The entry is within the submission window.');
  }

  const blockers = checks.filter((check) => check.level === 'blocked');
  const warnings = checks.filter((check) => check.level === 'warning');
  const passed = checks.filter((check) => check.level === 'pass').length;
  const score = checks.length === 0 ? 100 : Math.round((passed / checks.length) * 100);

  return {
    status: blockers.length ? 'blocked' : warnings.length ? 'warning' : 'ready',
    score,
    checks,
    blockers,
    warnings,
  };
}
