export type V3SavedEntityType = "country" | "edition";
export type V3SavedNotificationLevel = "none" | "important" | "all";

export type V3SavedItem = {
  followId: string;
  entityType: V3SavedEntityType;
  entityId: string;
  notificationLevel: V3SavedNotificationLevel;
  createdAt: string | null;
  title: string;
  subtitle: string | null;
  href: string | null;
  flagUrl: string | null;
  available: boolean;
};

export type V3SavedProjection = {
  viewerId: string;
  countries: readonly V3SavedItem[];
  editions: readonly V3SavedItem[];
  unavailable: readonly V3SavedItem[];
  generatedAt: string;
};
