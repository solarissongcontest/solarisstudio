import type { OperationalNotice } from './official-communications';
import type { SaveStudio2NoticeInput } from './studio2-communications';

export type CommunicationPublicationReview = {
  kind: 'schedule' | 'publish';
  editionId: string;
  noticeId: string | null;
  expectedRevision: number | null;
  expectedState: OperationalNotice['state'] | null;
  input: SaveStudio2NoticeInput;
  scheduledAtIso: string | null;
};

type PrepareCommunicationPublicationReviewInput = {
  kind: CommunicationPublicationReview['kind'];
  editionId: string;
  input: SaveStudio2NoticeInput;
  scheduledAt?: string | null;
  existingNotice?: OperationalNotice | null;
};

function cloneInput(input: SaveStudio2NoticeInput): SaveStudio2NoticeInput {
  return {
    ...input,
    displaySurfaces: [...input.displaySurfaces],
    countryIds: [...input.countryIds],
  };
}

export function prepareCommunicationPublicationReview({
  kind,
  editionId,
  input,
  scheduledAt,
  existingNotice = null,
}: PrepareCommunicationPublicationReviewInput): CommunicationPublicationReview {
  const exactEditionId = editionId.trim();
  if (!exactEditionId || input.editionId !== exactEditionId) {
    throw new Error('Official Communications review must match the exact selected Organizer edition.');
  }

  if (existingNotice && existingNotice.editionId !== exactEditionId) {
    throw new Error('The communication being reviewed is outside the selected Organizer edition.');
  }

  if (existingNotice && !['draft', 'scheduled'].includes(existingNotice.state)) {
    throw new Error('Only a draft or scheduled communication can be reviewed for publication changes.');
  }

  let scheduledAtIso: string | null = null;
  if (kind === 'schedule') {
    if (!scheduledAt) throw new Error('Choose a publication time before scheduling.');
    const date = new Date(scheduledAt);
    if (Number.isNaN(date.getTime())) throw new Error('The scheduled publication time is invalid.');
    scheduledAtIso = date.toISOString();
  }

  return {
    kind,
    editionId: exactEditionId,
    noticeId: existingNotice?.id ?? null,
    expectedRevision: existingNotice?.revision ?? null,
    expectedState: existingNotice?.state ?? null,
    input: cloneInput(input),
    scheduledAtIso,
  };
}

export function assertCommunicationPublicationReviewCurrent(
  review: CommunicationPublicationReview,
  currentEditionId: string | null | undefined,
  currentNotice: OperationalNotice | null | undefined,
): void {
  if (!currentEditionId || currentEditionId !== review.editionId) {
    throw new Error('Organizer edition changed after this communication was reviewed. Review it again.');
  }

  if (!review.noticeId) return;

  if (!currentNotice || currentNotice.id !== review.noticeId || currentNotice.editionId !== review.editionId) {
    throw new Error('The communication changed or disappeared after review. Reload and review it again.');
  }

  if (
    currentNotice.revision !== review.expectedRevision
    || currentNotice.state !== review.expectedState
  ) {
    throw new Error('The communication changed after this review was opened. Review the latest revision before continuing.');
  }
}
