import {
  assertSolarisScreenContract,
  type SolarisScreenContract,
} from "@/lib/solaris-screen-contract";

export type OrganizerV6Root =
  | "command"
  | "participants"
  | "entries"
  | "voting"
  | "more";

const rootScreen = (
  id: string,
  root: OrganizerV6Root,
  title: string,
): SolarisScreenContract =>
  assertSolarisScreenContract({
    id,
    perspective: "organizer",
    title,
    root,
    presentation: "root",
    toolbar: "root",
    tabbar: "full",
    search: "global",
    preserveScroll: true,
    immersive: false,
  });

export const ORGANIZER_V6_ROOT_SCREENS = {
  command: rootScreen("organizer.command", "command", "Command"),
  participants: rootScreen("organizer.participants", "participants", "Participants"),
  entries: rootScreen("organizer.entries", "entries", "Entries"),
  voting: rootScreen("organizer.voting", "voting", "Voting"),
  more: rootScreen("organizer.more", "more", "More"),
} as const;

export function organizerV6RootForPath(pathname: string): OrganizerV6Root {
  if (
    pathname.startsWith("/admin/operations") ||
    pathname.startsWith("/admin/tasks") ||
    pathname.startsWith("/admin/action-center") ||
    pathname.startsWith("/admin/inbox") ||
    pathname.startsWith("/admin/control-room") ||
    pathname.startsWith("/admin/incidents")
  ) {
    return "command";
  }

  if (
    pathname.startsWith("/admin/countries") ||
    pathname.startsWith("/confirmations/admin") ||
    pathname.startsWith("/admin/next-in-line") ||
    pathname.startsWith("/admin/country-accounts") ||
    pathname.startsWith("/admin/hod-history")
  ) {
    return "participants";
  }

  if (
    pathname.startsWith("/admin/entries") ||
    pathname.startsWith("/admin/media-assets") ||
    pathname.startsWith("/admin/eligibility") ||
    pathname.startsWith("/admin/lineup-sync") ||
    pathname.startsWith("/admin/hosts")
  ) {
    return "entries";
  }

  if (
    pathname.startsWith("/admin/jury") ||
    pathname.startsWith("/televoting/admin") ||
    pathname.startsWith("/admin/televote") ||
    pathname.startsWith("/admin/results") ||
    pathname.startsWith("/admin/voting-system") ||
    pathname.startsWith("/admin/friend-voting") ||
    pathname.startsWith("/admin/jury-integrity") ||
    pathname.startsWith("/admin/voting-lab")
  ) {
    return "voting";
  }

  return "more";
}

export function resolveOrganizerV6Screen(pathname: string): SolarisScreenContract {
  const root = organizerV6RootForPath(pathname);
  const base = ORGANIZER_V6_ROOT_SCREENS[root];
  if (
    pathname === "/admin" ||
    pathname === "/admin/" ||
    pathname === "/admin/operations" ||
    pathname === "/admin/countries" ||
    pathname === "/admin/entries" ||
    pathname === "/admin/results" ||
    pathname === "/admin/more"
  ) {
    return base;
  }

  return assertSolarisScreenContract({
    ...base,
    id: `${base.id}.detail`,
    title: base.title,
    presentation: pathname.includes("/incidents") ? "live" : "workspace",
    toolbar: "back",
    tabbar: "compact",
  });
}
