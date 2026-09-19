import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { getPublicRounds, type PublicRound } from "@/lib/confirmation-rounds.functions";
import { useMyCountryAccount } from "@/lib/country-account";
import { useAllParticipants, useEditions, type Edition, type Participant } from "@/lib/data";
import { useOwnedEntryPublication } from "@/lib/entry-publication";
import { useFanSession } from "@/lib/prediction-data";
import { loadStudio2RecipientNoticeInbox } from "@/lib/studio2-recipient-inbox";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";
import { NAV_TARGETS } from "@/lib/navigation-targets";
import {
  sortMySolarisPriorities,
  type MySolarisPriorityItem,
} from "@/lib/my-solaris-priorities";

const PARTICIPANT_CAPABILITIES = [
  "official_communications",
  "hod_workspace_v2",
  "rules_engine",
] as const;

type ParticipantCapability = (typeof PARTICIPANT_CAPABILITIES)[number];

export type MySolarisDeadline = {
  id: string;
  label: string;
  opensAt: string | null;
  closesAt: string | null;
  status: string;
};

export type MySolarisContextValue = {
  user: ReturnType<typeof useFanSession>["data"];
  countryAccount: ReturnType<typeof useMyCountryAccount>["data"];
  currentEdition: Edition | null;
  currentEntry: Participant | null;
  permissions: {
    isOrganizer: boolean;
    canManageCountry: boolean;
    countryStatus: "active" | "suspended" | null;
  };
  capabilities: Record<ParticipantCapability, boolean>;
  taskCounts: {
    needsAction: number;
    upcoming: number;
    completed: number;
  };
  unreadNoticeCount: number;
  deadlines: MySolarisDeadline[];
  priorities: MySolarisPriorityItem[];
  isLoading: boolean;
};

const EMPTY_CAPABILITIES = Object.freeze(
  Object.fromEntries(PARTICIPANT_CAPABILITIES.map((key) => [key, false])) as Record<
    ParticipantCapability,
    boolean
  >,
);

const MySolarisContext = createContext<MySolarisContextValue | null>(null);

export function MySolarisProvider({ children }: { children: ReactNode }) {
  const userQuery = useFanSession();
  const countryAccountQuery = useMyCountryAccount();
  const editionsQuery = useEditions();
  const participantsQuery = useAllParticipants();

  const currentEdition = useMemo(
    () =>
      [...(editionsQuery.data ?? [])].sort(
        (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
      )[0] ?? null,
    [editionsQuery.data],
  );

  const currentEntry = useMemo(() => {
    const countryId = countryAccountQuery.data?.country?.id;
    if (!countryId) return null;
    const owned = (participantsQuery.data ?? []).filter(
      (entry) => entry.country_id === countryId && entry.show_id == null,
    );
    if (!currentEdition) return owned[0] ?? null;
    return owned.find((entry) => entry.edition_id === currentEdition.id) ?? null;
  }, [countryAccountQuery.data?.country?.id, currentEdition, participantsQuery.data]);

  const publicationQuery = useOwnedEntryPublication(currentEdition?.id);

  const capabilitiesQuery = useQuery({
    enabled: Boolean(userQuery.data),
    queryKey: ["mysolaris-capabilities", currentEdition?.id],
    queryFn: async () => {
      const results = await Promise.allSettled(
        PARTICIPANT_CAPABILITIES.map((key) =>
          isStudio2FeatureEnabled(key, currentEdition?.id ?? null),
        ),
      );
      return Object.fromEntries(
        PARTICIPANT_CAPABILITIES.map((key, index) => {
          const result = results[index];
          return [key, result?.status === "fulfilled" ? result.value : false];
        }),
      ) as Record<ParticipantCapability, boolean>;
    },
    staleTime: 30_000,
  });

  const capabilities = capabilitiesQuery.data ?? EMPTY_CAPABILITIES;
  const isOrganizer = Boolean(countryAccountQuery.data?.access.isOrganizer);
  const noticesQuery = useQuery({
    enabled: Boolean(userQuery.data && capabilities.official_communications),
    queryKey: ["mysolaris-notice-summary", currentEdition?.id, "recipient-inbox"],
    queryFn: async () => {
      const notices = await loadStudio2RecipientNoticeInbox(currentEdition?.id);
      return {
        unreadNoticeCount: notices.filter(
          (item) => item.inboxState === "unread" || item.inboxState === "acknowledgement_required",
        ).length,
        acknowledgementTasks: notices.filter(
          (item) =>
            item.inboxState === "acknowledgement_required" ||
            (item.notice.acknowledgementRequired && item.inboxState === "unread"),
        ).length,
        acknowledgedNotices: notices.filter((item) => item.inboxState === "acknowledged").length,
      };
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const roundsQuery = useQuery({
    enabled: Boolean(userQuery.data),
    queryKey: ["mysolaris-context-deadlines"],
    queryFn: () => getPublicRounds(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const noticeSummary = noticesQuery.data ?? {
    unreadNoticeCount: 0,
    acknowledgementTasks: 0,
    acknowledgedNotices: 0,
  };
  const unreadNoticeCount = noticeSummary.unreadNoticeCount;
  const acknowledgementTasks = noticeSummary.acknowledgementTasks;
  const acknowledgedNotices = noticeSummary.acknowledgedNotices;

  const deadlines = useMemo(
    () =>
      (roundsQuery.data ?? [])
        .filter((round) => !currentEdition || round.edition_id === currentEdition.id)
        .filter((round) => round.status !== "closed")
        .map(deadlineFromRound),
    [currentEdition, roundsQuery.data],
  );

  const entryComplete = Boolean(currentEntry?.artist?.trim() && currentEntry?.song?.trim());
  const publicationReady =
    publicationQuery.data?.publication_status === "published" ||
    publicationQuery.data?.publication_status === "scheduled";

  const priorities = useMemo(() => {
    const items: MySolarisPriorityItem[] = [];

    if (currentEdition && !currentEntry) {
      items.push({
        id: "entry-missing",
        title: "Current entry is missing",
        description: "Add the current-edition entry and start readiness checks.",
        to: NAV_TARGETS.mySolarisEntry,
        search: { view: "readiness" },
        priority: 100,
        deadline: null,
        severity: "critical",
        actionRequired: true,
        kind: "entry",
      });
    } else if (currentEntry && !entryComplete) {
      items.push({
        id: "entry-incomplete",
        title: "Entry readiness needs details",
        description: "Artist or song information is incomplete.",
        to: NAV_TARGETS.mySolarisEntry,
        search: { view: "readiness" },
        priority: 90,
        deadline: null,
        severity: "high",
        actionRequired: true,
        kind: "entry",
      });
    }

    if (currentEntry && publicationQuery.data && !publicationReady) {
      items.push({
        id: "entry-publication",
        title: "Entry publication is not ready",
        description: "Complete the publication checks for the current entry.",
        to: NAV_TARGETS.mySolarisEntry,
        search: { view: "readiness" },
        priority: 80,
        deadline: null,
        severity: "high",
        actionRequired: true,
        kind: "entry",
      });
    }

    if (acknowledgementTasks > 0) {
      items.push({
        id: "required-notices",
        title: `${acknowledgementTasks} required acknowledgement${acknowledgementTasks === 1 ? "" : "s"}`,
        description: "Read the official notice and acknowledge it.",
        to: NAV_TARGETS.mySolarisNotices,
        priority: 110,
        deadline: null,
        severity: "critical",
        actionRequired: true,
        kind: "notice",
      });
    }

    const otherUnreadNotices = Math.max(0, unreadNoticeCount - acknowledgementTasks);
    if (otherUnreadNotices > 0) {
      items.push({
        id: "unread-notices",
        title: `${otherUnreadNotices} unread important notice${otherUnreadNotices === 1 ? "" : "s"}`,
        description: "Review new official communications.",
        to: NAV_TARGETS.mySolarisNotices,
        priority: 60,
        deadline: null,
        severity: "high",
        actionRequired: false,
        kind: "notice",
      });
    }

    for (const deadline of deadlines) {
      items.push({
        id: `deadline:${deadline.id}`,
        title: deadline.label,
        description: deadline.closesAt ? "Current-edition deadline" : "Upcoming current-edition window",
        to: NAV_TARGETS.mySolarisTasks,
        priority: 50,
        deadline: deadline.closesAt ?? deadline.opensAt,
        severity: "medium",
        actionRequired: false,
        kind: "deadline",
      });
    }

    return sortMySolarisPriorities(items);
  }, [
    acknowledgementTasks,
    currentEdition,
    currentEntry,
    deadlines,
    entryComplete,
    publicationQuery.data,
    publicationReady,
    unreadNoticeCount,
  ]);

  const needsAction =
    (currentEdition && !currentEntry ? 1 : 0) +
    (currentEntry && !entryComplete ? 1 : 0) +
    (currentEntry && publicationQuery.data && !publicationReady ? 1 : 0) +
    acknowledgementTasks;

  const value: MySolarisContextValue = {
    user: userQuery.data,
    countryAccount: countryAccountQuery.data,
    currentEdition,
    currentEntry,
    permissions: {
      isOrganizer,
      canManageCountry:
        Boolean(countryAccountQuery.data?.country) &&
        countryAccountQuery.data?.access.countryStatus !== "suspended",
      countryStatus: countryAccountQuery.data?.access.countryStatus ?? null,
    },
    capabilities,
    taskCounts: {
      needsAction,
      upcoming: deadlines.length,
      completed: (entryComplete ? 1 : 0) + (publicationReady ? 1 : 0) + acknowledgedNotices,
    },
    unreadNoticeCount,
    deadlines,
    priorities,
    isLoading:
      userQuery.isLoading ||
      countryAccountQuery.isLoading ||
      editionsQuery.isLoading ||
      participantsQuery.isLoading ||
      capabilitiesQuery.isLoading,
  };

  return <MySolarisContext.Provider value={value}>{children}</MySolarisContext.Provider>;
}

export function useMySolaris() {
  const context = useContext(MySolarisContext);
  if (!context) throw new Error("useMySolaris must be used inside MySolarisProvider.");
  return context;
}

function deadlineFromRound(round: PublicRound): MySolarisDeadline {
  return {
    id: round.id,
    label: round.name,
    opensAt: round.opens_at,
    closesAt: round.closes_at,
    status: round.status,
  };
}
