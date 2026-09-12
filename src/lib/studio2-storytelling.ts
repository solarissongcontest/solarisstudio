import { supabase } from '@/integrations/supabase/client';

export const STORYLINE_STATUSES = ['draft', 'published'] as const;
export const STORY_OPERATION_ACTIONS = [
  'generate_storyline',
  'update_storyline',
  'create_manual_item',
  'update_item',
  'reorder_item',
  'publish_storyline',
  'unpublish_storyline',
] as const;

export type StorylineStatus = (typeof STORYLINE_STATUSES)[number];
export type StoryOperationAction = (typeof STORY_OPERATION_ACTIONS)[number];

export type StorylineItem = {
  id: string;
  sourceEventId: string | null;
  sourceEventType: string | null;
  occurredAt: string;
  importance: number;
  headline: string;
  summary: string;
  canonicalFacts: Record<string, unknown>;
  included: boolean;
  manualOverride: boolean;
  sortOrder: number;
  updatedAt: string;
};

export type Storyline = {
  id: string;
  editionId: string;
  title: string;
  subtitle: string | null;
  introduction: string | null;
  status: StorylineStatus;
  revision: number;
  sourceEventCount: number;
  generatedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: StorylineItem[];
};

export type StorytellingSnapshot = {
  edition: {
    id: string;
    name: string;
    slug: string;
    editionNumber: number | null;
    eventDate: string | null;
    published: boolean;
  };
  sourceEventCount: number;
  eligibleSourceEventCount: number;
  lastSourceEventAt: string | null;
  storyline: Storyline | null;
};

export type StoryOperationExecution = {
  executionId: string;
  editionId: string;
  storylineId: string;
  itemId: string | null;
  action: StoryOperationAction;
  reason: string;
  revision: number;
  status: StorylineStatus;
  createdItems: number;
  idempotentReplay: boolean;
};

export type PublicStoryMoment = {
  id?: string;
  sourceEventType: string | null;
  occurredAt: string;
  importance: number;
  headline: string;
  summary: string;
  sortOrder?: number;
  yearsAgo?: number;
  editionSlug?: string;
  editionName?: string;
  editionNumber?: number | null;
};

export type PublicStorySummary = {
  editionId: string;
  editionSlug: string;
  editionName: string;
  editionNumber: number | null;
  eventDate: string | null;
  title: string;
  subtitle: string | null;
  introduction: string | null;
  publishedAt: string;
  itemCount: number;
  heroMoment: PublicStoryMoment | null;
};

export type PublicStoryline = Omit<PublicStorySummary, 'itemCount' | 'heroMoment'> & {
  items: PublicStoryMoment[];
};

export type CountryAnniversary = {
  countryId: string;
  countryName: string;
  firstParticipationDate: string;
  years: number;
};

export type AnniversaryEngine = {
  referenceDate: string;
  timeZone: string;
  sscAnniversary: { birthDate: string; years: number; label: string } | null;
  onThisDay: PublicStoryMoment[];
  oneYearAgo: PublicStoryMoment[];
  fiveYearsAgo: PublicStoryMoment[];
  countryAnniversaries: CountryAnniversary[];
  recentStories: Array<{
    editionSlug: string;
    editionName: string;
    editionNumber: number | null;
    title: string;
    subtitle: string | null;
    publishedAt: string;
    itemCount: number;
  }>;
};

type RpcClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

const rpcClient = supabase as unknown as RpcClient;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid ${label}`);
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function numberValue(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}`);
  return parsed;
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid ${label}`);
  return value;
}

function parseMoment(value: unknown): PublicStoryMoment {
  const row = object(value, 'public story moment');
  return {
    id: nullableString(row.id) ?? undefined,
    sourceEventType: nullableString(row.sourceEventType),
    occurredAt: stringValue(row.occurredAt, 'story moment occurred at'),
    importance: numberValue(row.importance, 'story moment importance'),
    headline: stringValue(row.headline, 'story moment headline'),
    summary: stringValue(row.summary, 'story moment summary'),
    sortOrder: nullableNumber(row.sortOrder) ?? undefined,
    yearsAgo: nullableNumber(row.yearsAgo) ?? undefined,
    editionSlug: nullableString(row.editionSlug) ?? undefined,
    editionName: nullableString(row.editionName) ?? undefined,
    editionNumber: nullableNumber(row.editionNumber),
  };
}

export function parseStorylineItem(value: unknown): StorylineItem {
  const row = object(value, 'storyline item');
  return {
    id: stringValue(row.id, 'storyline item id'),
    sourceEventId: nullableString(row.sourceEventId),
    sourceEventType: nullableString(row.sourceEventType),
    occurredAt: stringValue(row.occurredAt, 'storyline item occurred at'),
    importance: numberValue(row.importance, 'storyline item importance'),
    headline: stringValue(row.headline, 'storyline item headline'),
    summary: stringValue(row.summary, 'storyline item summary'),
    canonicalFacts: object(row.canonicalFacts ?? {}, 'storyline canonical facts'),
    included: boolValue(row.included, 'storyline item included'),
    manualOverride: boolValue(row.manualOverride, 'storyline item manual override'),
    sortOrder: numberValue(row.sortOrder, 'storyline item sort order'),
    updatedAt: stringValue(row.updatedAt, 'storyline item updated at'),
  };
}

export function parseStorytellingSnapshot(value: unknown): StorytellingSnapshot {
  const root = object(value, 'storytelling snapshot');
  const edition = object(root.edition, 'storytelling edition');
  let storyline: Storyline | null = null;
  if (root.storyline) {
    const row = object(root.storyline, 'storyline');
    if (!STORYLINE_STATUSES.includes(row.status as StorylineStatus)) throw new Error('Invalid storyline status');
    storyline = {
      id: stringValue(row.id, 'storyline id'),
      editionId: stringValue(row.editionId, 'storyline edition id'),
      title: stringValue(row.title, 'storyline title'),
      subtitle: nullableString(row.subtitle),
      introduction: nullableString(row.introduction),
      status: row.status as StorylineStatus,
      revision: numberValue(row.revision, 'storyline revision'),
      sourceEventCount: numberValue(row.sourceEventCount, 'storyline source event count'),
      generatedAt: nullableString(row.generatedAt),
      publishedAt: nullableString(row.publishedAt),
      createdAt: stringValue(row.createdAt, 'storyline created at'),
      updatedAt: stringValue(row.updatedAt, 'storyline updated at'),
      items: Array.isArray(row.items) ? row.items.map(parseStorylineItem) : [],
    };
  }

  return {
    edition: {
      id: stringValue(edition.id, 'storytelling edition id'),
      name: stringValue(edition.name, 'storytelling edition name'),
      slug: stringValue(edition.slug, 'storytelling edition slug'),
      editionNumber: nullableNumber(edition.editionNumber),
      eventDate: nullableString(edition.eventDate),
      published: boolValue(edition.published, 'storytelling edition published'),
    },
    sourceEventCount: numberValue(root.sourceEventCount ?? 0, 'story source event count'),
    eligibleSourceEventCount: numberValue(root.eligibleSourceEventCount ?? 0, 'eligible story source event count'),
    lastSourceEventAt: nullableString(root.lastSourceEventAt),
    storyline,
  };
}

function parseExecution(value: unknown): StoryOperationExecution {
  const row = object(value, 'story operation execution');
  if (!STORY_OPERATION_ACTIONS.includes(row.action as StoryOperationAction)) throw new Error('Invalid story operation action');
  if (!STORYLINE_STATUSES.includes(row.status as StorylineStatus)) throw new Error('Invalid story execution status');
  return {
    executionId: stringValue(row.executionId, 'story execution id'),
    editionId: stringValue(row.editionId, 'story execution edition id'),
    storylineId: stringValue(row.storylineId, 'storyline id'),
    itemId: nullableString(row.itemId),
    action: row.action as StoryOperationAction,
    reason: stringValue(row.reason, 'story execution reason'),
    revision: numberValue(row.revision, 'story execution revision'),
    status: row.status as StorylineStatus,
    createdItems: numberValue(row.createdItems ?? 0, 'story created item count'),
    idempotentReplay: boolValue(row.idempotentReplay, 'story execution replay state'),
  };
}

function parsePublicStorySummary(value: unknown): PublicStorySummary {
  const row = object(value, 'public story summary');
  return {
    editionId: stringValue(row.editionId, 'story edition id'),
    editionSlug: stringValue(row.editionSlug, 'story edition slug'),
    editionName: stringValue(row.editionName, 'story edition name'),
    editionNumber: nullableNumber(row.editionNumber),
    eventDate: nullableString(row.eventDate),
    title: stringValue(row.title, 'story title'),
    subtitle: nullableString(row.subtitle),
    introduction: nullableString(row.introduction),
    publishedAt: stringValue(row.publishedAt, 'story published at'),
    itemCount: numberValue(row.itemCount ?? 0, 'story item count'),
    heroMoment: row.heroMoment ? parseMoment(row.heroMoment) : null,
  };
}

function parsePublicStoryline(value: unknown): PublicStoryline | null {
  if (value == null) return null;
  const row = object(value, 'public storyline');
  return {
    editionId: stringValue(row.editionId, 'story edition id'),
    editionSlug: stringValue(row.editionSlug, 'story edition slug'),
    editionName: stringValue(row.editionName, 'story edition name'),
    editionNumber: nullableNumber(row.editionNumber),
    eventDate: nullableString(row.eventDate),
    title: stringValue(row.title, 'story title'),
    subtitle: nullableString(row.subtitle),
    introduction: nullableString(row.introduction),
    publishedAt: stringValue(row.publishedAt, 'story published at'),
    items: Array.isArray(row.items) ? row.items.map(parseMoment) : [],
  };
}

export function parseAnniversaryEngine(value: unknown): AnniversaryEngine {
  const row = object(value, 'anniversary engine');
  const ssc = row.sscAnniversary ? object(row.sscAnniversary, 'SSC anniversary') : null;
  return {
    referenceDate: stringValue(row.referenceDate, 'anniversary reference date'),
    timeZone: stringValue(row.timeZone, 'anniversary time zone'),
    sscAnniversary: ssc ? {
      birthDate: stringValue(ssc.birthDate, 'SSC birth date'),
      years: numberValue(ssc.years, 'SSC anniversary years'),
      label: stringValue(ssc.label, 'SSC anniversary label'),
    } : null,
    onThisDay: Array.isArray(row.onThisDay) ? row.onThisDay.map(parseMoment) : [],
    oneYearAgo: Array.isArray(row.oneYearAgo) ? row.oneYearAgo.map(parseMoment) : [],
    fiveYearsAgo: Array.isArray(row.fiveYearsAgo) ? row.fiveYearsAgo.map(parseMoment) : [],
    countryAnniversaries: Array.isArray(row.countryAnniversaries) ? row.countryAnniversaries.map((value) => {
      const item = object(value, 'country anniversary');
      return {
        countryId: stringValue(item.countryId, 'country anniversary id'),
        countryName: stringValue(item.countryName, 'country anniversary name'),
        firstParticipationDate: stringValue(item.firstParticipationDate, 'country first participation date'),
        years: numberValue(item.years, 'country anniversary years'),
      };
    }) : [],
    recentStories: Array.isArray(row.recentStories) ? row.recentStories.map((value) => {
      const item = object(value, 'recent story');
      return {
        editionSlug: stringValue(item.editionSlug, 'recent story slug'),
        editionName: stringValue(item.editionName, 'recent story edition name'),
        editionNumber: nullableNumber(item.editionNumber),
        title: stringValue(item.title, 'recent story title'),
        subtitle: nullableString(item.subtitle),
        publishedAt: stringValue(item.publishedAt, 'recent story published at'),
        itemCount: numberValue(item.itemCount ?? 0, 'recent story item count'),
      };
    }) : [],
  };
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await rpcClient.rpc(name, args);
  if (error) throw error;
  return data;
}

export async function loadStudio2Storytelling(editionId: string): Promise<StorytellingSnapshot> {
  if (!editionId) throw new Error('Edition is required.');
  return parseStorytellingSnapshot(await rpc('studio2_storytelling_snapshot', { p_edition_id: editionId }));
}

export async function executeStudio2StoryOperation(input: {
  editionId: string;
  action: StoryOperationAction;
  reason: string;
  executionId: string;
  expectedRevision?: number | null;
  itemId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<StoryOperationExecution> {
  const reason = input.reason.trim();
  if (!input.editionId) throw new Error('Edition is required.');
  if (!STORY_OPERATION_ACTIONS.includes(input.action)) throw new Error('Unsupported story operation.');
  if (reason.length < 5) throw new Error('An audit reason of at least 5 characters is required.');
  if (!input.executionId) throw new Error('Execution id is required.');
  if (input.expectedRevision != null && (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 1)) {
    throw new Error('Expected storyline revision is invalid.');
  }

  return parseExecution(await rpc('studio2_execute_story_operation', {
    p_edition_id: input.editionId,
    p_action: input.action,
    p_reason: reason,
    p_execution_id: input.executionId,
    p_expected_revision: input.expectedRevision ?? null,
    p_item_id: input.itemId ?? null,
    p_payload: input.payload ?? {},
  }));
}

export async function loadPublicStorylines(limit = 20): Promise<PublicStorySummary[]> {
  const data = await rpc('studio2_public_storylines', { p_limit: limit });
  return Array.isArray(data) ? data.map(parsePublicStorySummary) : [];
}

export async function loadPublicStoryline(editionSlug: string): Promise<PublicStoryline | null> {
  if (!editionSlug) return null;
  return parsePublicStoryline(await rpc('studio2_public_storyline', { p_edition_slug: editionSlug }));
}

export async function loadAnniversaryEngine(referenceDate: string, limit = 24): Promise<AnniversaryEngine> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) throw new Error('Anniversary reference date must be YYYY-MM-DD.');
  return parseAnniversaryEngine(await rpc('studio2_anniversary_engine', {
    p_reference_date: referenceDate,
    p_limit: limit,
  }));
}

export function storylineReadiness(snapshot: StorytellingSnapshot): {
  included: number;
  edited: number;
  publishable: boolean;
  blockers: string[];
} {
  const story = snapshot.storyline;
  if (!story) return { included: 0, edited: 0, publishable: false, blockers: ['Generate the storyline first.'] };
  const included = story.items.filter((item) => item.included).length;
  const edited = story.items.filter((item) => item.manualOverride).length;
  const blockers: string[] = [];
  if (!snapshot.edition.published) blockers.push('The edition must be published first.');
  if ((story.introduction?.trim().length ?? 0) < 10) blockers.push('Add a storyline introduction.');
  if (included < 3) blockers.push('Include at least three story moments.');
  return { included, edited, publishable: blockers.length === 0, blockers };
}

export function storyStatusTone(status: StorylineStatus): 'ready' | 'attention' {
  return status === 'published' ? 'ready' : 'attention';
}

export function storyOperationLabel(action: StoryOperationAction): string {
  switch (action) {
    case 'generate_storyline': return 'Generate storyline';
    case 'update_storyline': return 'Save storyline copy';
    case 'create_manual_item': return 'Add manual moment';
    case 'update_item': return 'Update story moment';
    case 'reorder_item': return 'Reorder story moment';
    case 'publish_storyline': return 'Publish storyline';
    case 'unpublish_storyline': return 'Unpublish storyline';
  }
}
