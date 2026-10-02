import {
  publicAreaForPath,
  publicDestinationById,
  publicDestinationForPath,
} from "@/lib/public-navigation";
import type { AppTabId } from "@/lib/app-navigation";

export type SolarisAppPresentation =
  | "root"
  | "directory"
  | "entity"
  | "article"
  | "data"
  | "settings"
  | "task"
  | "live"
  | "immersive"
  | "workspace"
  | "core";

export type SolarisAppToolbarMode = "root" | "back" | "focused" | "hidden";
export type SolarisAppTabbarMode = "full" | "minimal" | "hidden";
export type SolarisAppSearchMode = "none" | "global" | "local";
export type SolarisAppOfflinePolicy = "ready" | "readable" | "online-required";
export type SolarisAppAuthPolicy = "public" | "authenticated";

export type SolarisAppScreen = {
  id: string;
  title: string;
  hierarchy: {
    rootTab: AppTabId | null;
    parent?: {
      label: string;
      href: string;
    };
  };
  presentation: SolarisAppPresentation;
  chrome: {
    toolbar: SolarisAppToolbarMode;
    tabbar: SolarisAppTabbarMode;
    search: SolarisAppSearchMode;
  };
  access: {
    auth: SolarisAppAuthPolicy;
  };
  behavior: {
    preserveScroll: boolean;
    immersive: boolean;
    personalityAllowed: boolean;
    offline: SolarisAppOfflinePolicy;
    criticalTask: boolean;
  };
  helpTo?: string;
};

type ScreenDefaults = Pick<SolarisAppScreen, "chrome" | "access" | "behavior">;

const BROWSE_DEFAULTS: ScreenDefaults = {
  chrome: { toolbar: "back", tabbar: "full", search: "global" },
  access: { auth: "public" },
  behavior: {
    preserveScroll: true,
    immersive: false,
    personalityAllowed: false,
    offline: "readable",
    criticalTask: false,
  },
};

const ROOT_DEFAULTS: ScreenDefaults = {
  chrome: { toolbar: "root", tabbar: "full", search: "global" },
  access: { auth: "public" },
  behavior: {
    preserveScroll: true,
    immersive: false,
    personalityAllowed: false,
    offline: "readable",
    criticalTask: false,
  },
};

const TASK_DEFAULTS: ScreenDefaults = {
  chrome: { toolbar: "focused", tabbar: "hidden", search: "none" },
  access: { auth: "public" },
  behavior: {
    preserveScroll: false,
    immersive: false,
    personalityAllowed: false,
    offline: "online-required",
    criticalTask: true,
  },
};

function areaTab(pathname: string): AppTabId | null {
  const area = publicAreaForPath(pathname);
  return area === "home" ||
    area === "explore" ||
    area === "participate" ||
    area === "results" ||
    area === "me"
    ? area
    : null;
}

function rootScreen(
  id: string,
  title: string,
  rootTab: AppTabId,
  search: SolarisAppSearchMode = "global",
): SolarisAppScreen {
  return {
    id,
    title,
    hierarchy: { rootTab },
    presentation: "root",
    ...ROOT_DEFAULTS,
    chrome: { ...ROOT_DEFAULTS.chrome, search },
  };
}

function entityScreen(pathname: string, searchStr: string): SolarisAppScreen | null {
  const match = pathname.match(/^\/(countries|editions|shows|wiki)\/[^/]+/);
  if (!match) return null;

  const section = match[1]!;
  const segment = decodeURIComponent(pathname.split("/")[2] ?? "");
  const editionNumber =
    section === "editions" ? segment.match(/^ssc[-_ ]?(\d+)$/i)?.[1] ?? null : null;

  const metadata = {
    countries: { title: segment.toUpperCase(), label: "Countries", href: "/countries" },
    editions: {
      title: editionNumber ? `SSC ${editionNumber}` : "Edition",
      label: "Editions",
      href: "/editions",
    },
    shows: { title: "Show", label: "Shows", href: "/shows" },
    wiki: { title: segment.toUpperCase(), label: "Wiki", href: "/wiki" },
  }[section as "countries" | "editions" | "shows" | "wiki"];

  const params = new URLSearchParams(searchStr.startsWith("?") ? searchStr.slice(1) : searchStr);
  const resultsContext = section === "shows" && params.get("from") === "results";

  return {
    id: `${section}.entity`,
    title: metadata.title,
    hierarchy: {
      rootTab: resultsContext ? "results" : "explore",
      parent: resultsContext
        ? { label: "Results", href: "/results" }
        : { label: metadata.label, href: metadata.href },
    },
    presentation: "entity",
    ...BROWSE_DEFAULTS,
    chrome: {
      ...BROWSE_DEFAULTS.chrome,
      search: section === "wiki" ? "local" : "global",
    },
    behavior: {
      ...BROWSE_DEFAULTS.behavior,
      personalityAllowed: true,
      offline: "readable",
    },
  };
}

export function resolveSolarisAppScreen(pathname: string, searchStr = ""): SolarisAppScreen {
  if (pathname === "/") return rootScreen("home", "Solaris Studio", "home");
  if (pathname === "/explore" || pathname === "/explore/") {
    return rootScreen("explore", "Explore", "explore");
  }
  if (pathname === "/participate" || pathname === "/participate/") {
    return rootScreen("participate", "Participate", "participate", "none");
  }
  if (pathname === "/results" || pathname === "/results/") {
    return rootScreen("results", "Results", "results");
  }
  if (
    pathname === "/me" ||
    pathname === "/me/" ||
    pathname === "/my-solaris" ||
    pathname === "/my-solaris/"
  ) {
    return {
      ...rootScreen("me", "Me", "me"),
      access: { auth: "authenticated" },
      behavior: { ...ROOT_DEFAULTS.behavior, offline: "readable" },
    };
  }

  const entity = entityScreen(pathname, searchStr);
  if (entity) return entity;

  if (pathname === "/settings" || pathname === "/settings/") {
    return {
      id: "settings",
      title: "Settings",
      hierarchy: { rootTab: "me", parent: { label: "Me", href: "/me" } },
      presentation: "settings",
      ...BROWSE_DEFAULTS,
      access: { auth: "authenticated" },
      behavior: { ...BROWSE_DEFAULTS.behavior, offline: "readable" },
    };
  }

  if (pathname.startsWith("/my-solaris/")) {
    const destination = publicDestinationForPath(pathname);
    return {
      id: "mysolaris.child",
      title: destination?.label ?? "MySolaris",
      hierarchy: { rootTab: "me", parent: { label: "Me", href: "/my-solaris" } },
      presentation: pathname.startsWith("/my-solaris/account") ? "settings" : "workspace",
      ...BROWSE_DEFAULTS,
      access: { auth: "authenticated" },
      behavior: {
        ...BROWSE_DEFAULTS.behavior,
        offline: pathname.startsWith("/my-solaris/account") ? "online-required" : "readable",
      },
    };
  }

  if (pathname === "/televoting/results" || pathname === "/televoting/results/") {
    return {
      id: "televoting.results",
      title: "Televoting results",
      hierarchy: { rootTab: "results", parent: { label: "Results", href: "/results" } },
      presentation: "data",
      ...BROWSE_DEFAULTS,
    };
  }

  if (pathname === "/televoting/how-to-vote" || pathname === "/televoting/how-to-vote/") {
    return {
      id: "televoting.guide",
      title: "How to vote",
      hierarchy: {
        rootTab: "participate",
        parent: { label: "Televoting", href: "/televoting" },
      },
      presentation: "article",
      ...BROWSE_DEFAULTS,
      chrome: { ...BROWSE_DEFAULTS.chrome, search: "none" },
    };
  }

  if (/^\/(confirmations|jury-voting|televoting|next-in-line)(\/|$)/.test(pathname)) {
    const destination = publicDestinationForPath(pathname);
    return {
      id: "participation.task",
      title: destination?.label ?? "Participate",
      hierarchy: {
        rootTab: "participate",
        parent: { label: "Participate", href: "/participate" },
      },
      presentation: "task",
      ...TASK_DEFAULTS,
      helpTo: pathname.startsWith("/televoting") ? "/televoting/how-to-vote" : "/guide",
    };
  }

  if (/^\/integrity\/report(\/|$)/.test(pathname)) {
    return {
      id: "integrity.report",
      title: "Report a concern",
      hierarchy: {
        rootTab: "participate",
        parent: { label: "Trust & Integrity", href: "/integrity" },
      },
      presentation: "task",
      ...TASK_DEFAULTS,
      chrome: { ...TASK_DEFAULTS.chrome, toolbar: "hidden" },
      helpTo: "/integrity/process",
    };
  }

  if (/^\/rules(\/|$)/.test(pathname)) {
    const destination = publicDestinationForPath(pathname);
    const parent = destination?.parent ? publicDestinationById(destination.parent) : null;
    return {
      id: "rules",
      title: destination?.label ?? "Rules",
      hierarchy: {
        rootTab: "explore",
        parent: parent
          ? { label: parent.label, href: parent.to }
          : { label: "Explore", href: "/explore" },
      },
      presentation: "article",
      ...BROWSE_DEFAULTS,
      chrome: { ...BROWSE_DEFAULTS.chrome, search: "local" },
      behavior: { ...BROWSE_DEFAULTS.behavior, offline: "ready" },
    };
  }

  if (pathname === "/site-directory" || pathname === "/site-directory/") {
    return {
      id: "site-directory",
      title: "All Solaris pages",
      hierarchy: { rootTab: "explore", parent: { label: "Explore", href: "/explore" } },
      presentation: "directory",
      ...BROWSE_DEFAULTS,
      chrome: { ...BROWSE_DEFAULTS.chrome, search: "local" },
    };
  }

  if (/^\/integrity(\/|$)/.test(pathname)) {
    const destination = publicDestinationForPath(pathname);
    const parent = destination?.parent ? publicDestinationById(destination.parent) : null;
    return {
      id: "integrity",
      title: destination?.label ?? "Trust & Integrity",
      hierarchy: {
        rootTab: "participate",
        parent: parent
          ? { label: parent.label, href: parent.to }
          : { label: "Participate", href: "/participate" },
      },
      presentation: "article",
      ...BROWSE_DEFAULTS,
      chrome: { ...BROWSE_DEFAULTS.chrome, search: "local" },
      behavior: { ...BROWSE_DEFAULTS.behavior, offline: "ready" },
    };
  }

  if (/^\/guide(\/|$)/.test(pathname)) {
    const destination = publicDestinationForPath(pathname);
    return {
      id: "guide",
      title: destination?.label ?? "Guide",
      hierarchy: { rootTab: "explore", parent: { label: "Explore", href: "/explore" } },
      presentation: "article",
      ...BROWSE_DEFAULTS,
      chrome: { ...BROWSE_DEFAULTS.chrome, search: "local" },
      behavior: { ...BROWSE_DEFAULTS.behavior, offline: "ready" },
    };
  }

  if (
    /^\/(analysis|relationships|records|scorecharts|broadcast-intelligence|result-lab|voting-dna)(\/|$)/.test(
      pathname,
    )
  ) {
    const destination = publicDestinationForPath(pathname);
    return {
      id: "results.data",
      title: destination?.label ?? "Results",
      hierarchy: { rootTab: "results", parent: { label: "Results", href: "/results" } },
      presentation: "data",
      ...BROWSE_DEFAULTS,
    };
  }

  if (/^\/(predictions|compare|taste-dna|archive-games|fantasy)(\/|$)/.test(pathname)) {
    const destination = publicDestinationForPath(pathname);
    const rootTab = areaTab(pathname) ?? "results";
    const parent =
      rootTab === "participate"
        ? { label: "Participate", href: "/participate" }
        : rootTab === "explore"
          ? { label: "Explore", href: "/explore" }
          : { label: "Results", href: "/results" };
    return {
      id: "workspace",
      title: destination?.label ?? "Solaris",
      hierarchy: { rootTab, parent },
      presentation: "workspace",
      ...BROWSE_DEFAULTS,
    };
  }

  if (pathname === "/show-mode" || pathname === "/show-mode/") {
    return {
      id: "show-mode",
      title: "Show Mode",
      hierarchy: { rootTab: "home", parent: { label: "Home", href: "/" } },
      presentation: "live",
      chrome: { toolbar: "back", tabbar: "minimal", search: "none" },
      access: { auth: "public" },
      behavior: {
        preserveScroll: false,
        immersive: true,
        personalityAllowed: false,
        offline: "readable",
        criticalTask: false,
      },
    };
  }

  if (pathname.startsWith("/broadcast/")) {
    return {
      id: "broadcast",
      title: "Broadcast",
      hierarchy: { rootTab: "home", parent: { label: "Home", href: "/" } },
      presentation: "immersive",
      chrome: { toolbar: "hidden", tabbar: "hidden", search: "none" },
      access: { auth: "public" },
      behavior: {
        preserveScroll: false,
        immersive: true,
        personalityAllowed: false,
        offline: "online-required",
        criticalTask: false,
      },
    };
  }

  const destination = publicDestinationForPath(pathname);
  if (destination) {
    const rootTab = areaTab(pathname) ?? "home";
    const root =
      destination.to === "/" ||
      destination.to === "/explore" ||
      destination.to === "/participate" ||
      destination.to === "/results" ||
      destination.to === "/my-solaris";
    const parent = destination.parent ? publicDestinationById(destination.parent) : null;
    const directory = /^\/(countries|editions|shows|wiki|encyclopedia)(\/|$)/.test(pathname);

    return {
      id: `destination.${destination.id}`,
      title: destination.to === "/" ? "Solaris Studio" : destination.label,
      hierarchy: {
        rootTab,
        parent: parent ? { label: parent.label, href: parent.to } : undefined,
      },
      presentation: root ? "root" : directory ? "directory" : "core",
      ...(root ? ROOT_DEFAULTS : BROWSE_DEFAULTS),
      chrome: root
        ? ROOT_DEFAULTS.chrome
        : {
            ...BROWSE_DEFAULTS.chrome,
            search: directory ? "local" : "global",
          },
    };
  }

  const rootTab = areaTab(pathname) ?? "home";
  return {
    id: "fallback",
    title:
      rootTab === "home"
        ? "Solaris Studio"
        : rootTab === "me"
          ? "Me"
          : rootTab
            ? rootTab.charAt(0).toUpperCase() + rootTab.slice(1)
            : "Solaris Studio",
    hierarchy: { rootTab },
    presentation: "core",
    ...BROWSE_DEFAULTS,
  };
}
