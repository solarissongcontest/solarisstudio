import {
  publicAreaForPath,
  publicDestinationById,
  publicDestinationForPath,
} from "@/lib/public-navigation";
import type { AppTabId } from "@/lib/app-navigation";

export type AppScreenArchetype =
  | "root"
  | "directory"
  | "entity"
  | "workspace"
  | "data"
  | "reading"
  | "task"
  | "live"
  | "immersive"
  | "settings"
  | "core";

export type AppTabBarMode = "visible" | "hidden" | "minimal";

export type AppRouteChrome = {
  title: string;
  tab: AppTabId | null;
  archetype: AppScreenArchetype;
  root: boolean;
  tabBar: AppTabBarMode;
  backFallback?: {
    label: string;
    to: string;
  };
  helpTo?: string;
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

function entityChrome(pathname: string): AppRouteChrome | null {
  const match = pathname.match(/^\/(countries|editions|shows|wiki)\/[^/]+/);
  if (!match) return null;
  const section = match[1]!;
  const metadata = {
    countries: { title: "Country", label: "Countries", to: "/countries" },
    editions: { title: "Edition", label: "Editions", to: "/editions" },
    shows: { title: "Show", label: "Shows", to: "/shows" },
    wiki: { title: "Wiki", label: "Wiki", to: "/wiki" },
  }[section as "countries" | "editions" | "shows" | "wiki"];

  return {
    title: metadata.title,
    tab: "explore",
    archetype: "entity",
    root: false,
    tabBar: "visible",
    backFallback: { label: metadata.label, to: metadata.to },
  };
}

export function resolveAppRouteChrome(pathname: string): AppRouteChrome {
  if (pathname === "/") {
    return {
      title: "Solaris Studio",
      tab: "home",
      archetype: "root",
      root: true,
      tabBar: "visible",
    };
  }

  if (pathname === "/explore" || pathname === "/explore/") {
    return {
      title: "Explore",
      tab: "explore",
      archetype: "root",
      root: true,
      tabBar: "visible",
    };
  }

  if (pathname === "/participate" || pathname === "/participate/") {
    return {
      title: "Participate",
      tab: "participate",
      archetype: "root",
      root: true,
      tabBar: "visible",
    };
  }

  if (pathname === "/results" || pathname === "/results/") {
    return {
      title: "Results",
      tab: "results",
      archetype: "root",
      root: true,
      tabBar: "visible",
    };
  }

  if (
    pathname === "/me" ||
    pathname === "/me/" ||
    pathname === "/my-solaris" ||
    pathname === "/my-solaris/"
  ) {
    return {
      title: "Me",
      tab: "me",
      archetype: "root",
      root: true,
      tabBar: "visible",
    };
  }

  const entity = entityChrome(pathname);
  if (entity) return entity;

  if (pathname === "/settings" || pathname === "/settings/") {
    return {
      title: "Settings",
      tab: "me",
      archetype: "settings",
      root: false,
      tabBar: "visible",
      backFallback: { label: "Me", to: "/me" },
    };
  }

  if (pathname.startsWith("/my-solaris/")) {
    const destination = publicDestinationForPath(pathname);
    return {
      title: destination?.label ?? "MySolaris",
      tab: "me",
      archetype: pathname.startsWith("/my-solaris/account") ? "settings" : "workspace",
      root: false,
      tabBar: "visible",
      backFallback: { label: "Me", to: "/my-solaris" },
    };
  }

  if (pathname === "/televoting/results" || pathname === "/televoting/results/") {
    return {
      title: "Televoting results",
      tab: "results",
      archetype: "data",
      root: false,
      tabBar: "visible",
      backFallback: { label: "Results", to: "/results" },
    };
  }

  if (pathname === "/televoting/how-to-vote" || pathname === "/televoting/how-to-vote/") {
    return {
      title: "How to vote",
      tab: "participate",
      archetype: "reading",
      root: false,
      tabBar: "visible",
      backFallback: { label: "Televoting", to: "/televoting" },
    };
  }

  if (/^\/(confirmations|jury-voting|televoting|next-in-line)(\/|$)/.test(pathname)) {
    const destination = publicDestinationForPath(pathname);
    return {
      title: destination?.label ?? "Participate",
      tab: "participate",
      archetype: "task",
      root: false,
      tabBar: "hidden",
      backFallback: { label: "Participate", to: "/participate" },
      helpTo: pathname.startsWith("/televoting") ? "/televoting/how-to-vote" : "/guide",
    };
  }

  if (/^\/integrity\/report(\/|$)/.test(pathname)) {
    return {
      title: "Report a concern",
      tab: "participate",
      archetype: "task",
      root: false,
      tabBar: "hidden",
      backFallback: { label: "Trust & Integrity", to: "/integrity" },
      helpTo: "/integrity/process",
    };
  }

  if (/^\/rules(\/|$)/.test(pathname)) {
    const destination = publicDestinationForPath(pathname);
    const parent = destination?.parent ? publicDestinationById(destination.parent) : null;
    return {
      title: destination?.label ?? "Rules",
      tab: "explore",
      archetype: "reading",
      root: false,
      tabBar: "visible",
      backFallback: parent
        ? { label: parent.label, to: parent.to }
        : { label: "Explore", to: "/explore" },
    };
  }

  if (/^\/integrity(\/|$)/.test(pathname)) {
    const destination = publicDestinationForPath(pathname);
    const parent = destination?.parent ? publicDestinationById(destination.parent) : null;
    return {
      title: destination?.label ?? "Trust & Integrity",
      tab: "participate",
      archetype: "reading",
      root: false,
      tabBar: "visible",
      backFallback: parent
        ? { label: parent.label, to: parent.to }
        : { label: "Participate", to: "/participate" },
    };
  }

  if (/^\/guide(\/|$)/.test(pathname)) {
    const destination = publicDestinationForPath(pathname);
    return {
      title: destination?.label ?? "Guide",
      tab: areaTab(pathname),
      archetype: "reading",
      root: false,
      tabBar: "visible",
      backFallback: { label: "Explore", to: "/explore" },
    };
  }

  if (/^\/(analysis|relationships|records|scorecharts|broadcast-intelligence|result-lab|voting-dna)(\/|$)/.test(pathname)) {
    const destination = publicDestinationForPath(pathname);
    return {
      title: destination?.label ?? "Results",
      tab: "results",
      archetype: "data",
      root: false,
      tabBar: "visible",
      backFallback: { label: "Results", to: "/results" },
    };
  }

  if (/^\/(predictions|compare|taste-dna|archive-games|fantasy)(\/|$)/.test(pathname)) {
    const destination = publicDestinationForPath(pathname);
    const tab = areaTab(pathname) ?? "results";
    return {
      title: destination?.label ?? "Solaris",
      tab,
      archetype: "workspace",
      root: false,
      tabBar: "visible",
      backFallback: {
        label: tab === "participate" ? "Participate" : tab === "explore" ? "Explore" : "Results",
        to: tab === "participate" ? "/participate" : tab === "explore" ? "/explore" : "/results",
      },
    };
  }

  if (pathname === "/show-mode" || pathname === "/show-mode/") {
    return {
      title: "Show Mode",
      tab: "home",
      archetype: "live",
      root: false,
      tabBar: "minimal",
      backFallback: { label: "Home", to: "/" },
    };
  }

  if (pathname.startsWith("/broadcast/")) {
    return {
      title: "Broadcast",
      tab: "home",
      archetype: "immersive",
      root: false,
      tabBar: "hidden",
      backFallback: { label: "Home", to: "/" },
    };
  }

  const destination = publicDestinationForPath(pathname);
  if (destination) {
    const tab = areaTab(pathname);
    const root =
      destination.to === "/" ||
      destination.to === "/explore" ||
      destination.to === "/participate" ||
      destination.to === "/results" ||
      destination.to === "/my-solaris";
    const parent = destination.parent ? publicDestinationById(destination.parent) : null;
    return {
      title: destination.to === "/" ? "Solaris Studio" : destination.label,
      tab,
      archetype: root
        ? "root"
        : /^\/(countries|editions|shows|wiki|encyclopedia)(\/|$)/.test(pathname)
          ? "directory"
          : "core",
      root,
      tabBar: "visible",
      backFallback: parent ? { label: parent.label, to: parent.to } : undefined,
    };
  }

  const tab = areaTab(pathname);
  return {
    title:
      tab === "home"
        ? "Solaris Studio"
        : tab === "me"
          ? "Me"
          : tab
            ? tab.charAt(0).toUpperCase() + tab.slice(1)
            : "Solaris Studio",
    tab,
    archetype: "core",
    root: false,
    tabBar: "visible",
  };
}
