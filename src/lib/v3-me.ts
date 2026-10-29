export type V3MeIdentity = {
  userId: string;
  displayName: string;
  delegationName: string | null;
  delegationFlagUrl: string | null;
  displayRole: string | null;
};

export type V3MeMembership = {
  editionId: string;
  editionName: string;
  roleLabel: string | null;
  href: string;
};

export type V3MeHistoryItem = V3MeMembership & {
  completed: boolean;
};

export type V3MeActivitySummary = {
  verifiedReceiptCount: number | null;
  awaitingAuthoritativeReceiptCount: number | null;
  href: string;
};

export type V3MeFollowingSummary = {
  followedCountryCount: number | null;
  followedContentCount: number | null;
  href: string;
};

export type V3MeLink = {
  key: string;
  label: string;
  href: string;
};

export type V3MeProjectionInput = {
  identity: V3MeIdentity;
  currentMembership: V3MeMembership | null;
  history: readonly V3MeHistoryItem[];
  historyAvailable?: boolean;
  activity: V3MeActivitySummary;
  following: V3MeFollowingSummary;
  delegationLinks?: readonly V3MeLink[];
  preferenceLinks: readonly V3MeLink[];
  accountLinks: readonly V3MeLink[];
  canEnterOrganizer: boolean;
  organizerHref: string;
};

export type V3MeProjection = {
  identity: V3MeIdentity;
  current: V3MeMembership | null;
  history: readonly V3MeHistoryItem[];
  historyAvailable?: boolean;
  activity: V3MeActivitySummary;
  following: V3MeFollowingSummary;
  delegation: readonly V3MeLink[];
  preferences: readonly V3MeLink[];
  account: readonly V3MeLink[];
  organizerAction: {
    label: "Switch to Organizer";
    href: string;
  } | null;
};

export function buildV3MeProjection(input: V3MeProjectionInput): V3MeProjection {
  return {
    identity: { ...input.identity },
    current: input.currentMembership ? { ...input.currentMembership } : null,
    historyAvailable: input.historyAvailable ?? true,
    history: input.history.map((item) => ({ ...item })),
    activity: { ...input.activity },
    following: { ...input.following },
    delegation: (input.delegationLinks ?? []).map((link) => ({ ...link })),
    preferences: input.preferenceLinks.map((link) => ({ ...link })),
    account: input.accountLinks.map((link) => ({ ...link })),
    organizerAction: input.canEnterOrganizer
      ? {
          label: "Switch to Organizer",
          href: input.organizerHref,
        }
      : null,
  };
}

export const V3_ME_SECTION_ORDER = [
  "identity",
  "current",
  "history",
  "activity",
  "following",
  "delegation",
  "preferences",
  "account",
] as const;

export type V3MeSection = (typeof V3_ME_SECTION_ORDER)[number];