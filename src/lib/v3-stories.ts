export type V3StoryMoment = {
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

export type V3StorySummary = {
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
  heroMoment: V3StoryMoment | null;
};

export type V3Storyline = Omit<V3StorySummary, "itemCount" | "heroMoment"> & {
  items: V3StoryMoment[];
};

export type V3StoryArtwork = {
  src: string;
  alt: string;
};

export type V3StoriesAnniversary = {
  referenceDate: string;
  timeZone: string;
  sscAnniversary: { birthDate: string; years: number; label: string } | null;
  onThisDay: V3StoryMoment[];
};

export type V3StoriesIndexBundle = {
  shell: { editionLabel: string; phaseLabel: string };
  stories: V3StorySummary[];
  currentStory: V3StorySummary | null;
  historicalStories: V3StorySummary[];
  anniversary: V3StoriesAnniversary;
  generatedAt: string;
};

export type V3StoryDetailBundle = {
  shell: { editionLabel: string; phaseLabel: string };
  story: V3Storyline | null;
  artwork: V3StoryArtwork | null;
  relatedEdition: { label: string; href: string } | null;
  relatedStories: V3StorySummary[];
  generatedAt: string;
};
