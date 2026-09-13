import { NAV_TARGETS } from "@/lib/navigation-targets";

export type MySolarisSectionId =
  | "home"
  | "tasks"
  | "entry"
  | "voting"
  | "notices"
  | "country"
  | "page-media"
  | "history"
  | "activity"
  | "predictions"
  | "saved"
  | "account";

export type MySolarisNavigationItem = {
  id: MySolarisSectionId;
  label: string;
  description: string;
  to: string;
  activePaths?: readonly string[];
};

export type MySolarisNavigationGroup = {
  label: "My edition" | "My country" | "My Solaris" | null;
  items: readonly MySolarisNavigationItem[];
};

export const MY_SOLARIS_NAVIGATION: readonly MySolarisNavigationGroup[] = [
  {
    label: null,
    items: [
      {
        id: "home",
        label: "Home",
        description: "Current priorities and edition status",
        to: NAV_TARGETS.mySolaris,
      },
    ],
  },
  {
    label: "My edition",
    items: [
      {
        id: "tasks",
        label: "Tasks",
        description: "What needs action now and what comes next",
        to: NAV_TARGETS.mySolarisTasks,
      },
      {
        id: "entry",
        label: "Entry",
        description: "Details, media, eligibility and readiness",
        to: NAV_TARGETS.mySolarisEntry,
      },
      {
        id: "voting",
        label: "Voting",
        description: "Jury voting and public televoting",
        to: NAV_TARGETS.mySolarisVoting,
      },
      {
        id: "notices",
        label: "Notices",
        description: "Official organizer communications",
        to: NAV_TARGETS.mySolarisNotices,
      },
    ],
  },
  {
    label: "My country",
    items: [
      {
        id: "country",
        label: "Country",
        description: "Identity and delegation settings",
        to: NAV_TARGETS.mySolarisCountry,
      },
      {
        id: "page-media",
        label: "Page & media",
        description: "Public page, media and appearance",
        to: NAV_TARGETS.mySolarisPageBuilder,
        activePaths: [NAV_TARGETS.mySolarisPageBuilder, NAV_TARGETS.mySolarisTheme],
      },
      {
        id: "history",
        label: "History",
        description: "Delegation and account history",
        to: NAV_TARGETS.mySolarisHistory,
      },
    ],
  },
  {
    label: "My Solaris",
    items: [
      {
        id: "activity",
        label: "Activity",
        description: "Recent updates connected to you",
        to: NAV_TARGETS.mySolarisActivity,
      },
      {
        id: "predictions",
        label: "Predictions",
        description: "Your Prediction Arena history",
        to: NAV_TARGETS.mySolarisPredictions,
      },
      {
        id: "saved",
        label: "Saved",
        description: "Countries and editions you follow",
        to: NAV_TARGETS.mySolarisSaved,
      },
      {
        id: "account",
        label: "Account",
        description: "Profile, sign-in and security",
        to: NAV_TARGETS.mySolarisAccount,
      },
    ],
  },
] as const;

export const MY_SOLARIS_MOBILE_PRIMARY_IDS = ["home", "tasks", "entry", "voting"] as const;

export function mySolarisNavigationItems() {
  return MY_SOLARIS_NAVIGATION.flatMap((group) => group.items);
}

export function mySolarisItemIsActive(item: MySolarisNavigationItem, pathname: string) {
  const paths = item.activePaths ?? [item.to];
  return paths.some((path) =>
    path === NAV_TARGETS.mySolaris
      ? pathname === path || pathname === `${path}/`
      : pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function mySolarisMoreItems() {
  const primary = new Set<MySolarisSectionId>(MY_SOLARIS_MOBILE_PRIMARY_IDS);
  return mySolarisNavigationItems().filter((item) => !primary.has(item.id));
}
