export type PublicRouteArchetype =
  | "home"
  | "hub"
  | "directory"
  | "detail"
  | "data-explorer"
  | "workspace"
  | "reading"
  | "focused-task"
  | "core";

export function publicRouteArchetype(pathname: string): PublicRouteArchetype {
  if (pathname === "/") return "home";

  if (/^\/(guide|rules|integrity)(\/|$)/.test(pathname)) return "reading";

  if (/^\/(auth|reset|recover)(\/|$)/.test(pathname)) return "focused-task";

  if (
    /^\/(confirmations|jury-voting|televoting|next-in-line)(\/|$)/.test(pathname)
  ) {
    return "focused-task";
  }

  if (
    /^\/(analysis|relationships|records|scorecharts|pulse|broadcast-intelligence|result-lab)(\/|$)/.test(
      pathname,
    )
  ) {
    return "data-explorer";
  }

  if (
    /^\/(predictions|compare|taste-dna|archive-games|my-solaris|country-hub)(\/|$)/.test(
      pathname,
    )
  ) {
    return "workspace";
  }

  if (/^\/(explore|participate|results|tools)\/?$/.test(pathname)) {
    return "hub";
  }

  if (/^\/(countries|wiki|editions|shows)\/?$/.test(pathname)) {
    return "directory";
  }

  if (/^\/(countries|wiki|editions|shows|results)\/.+/.test(pathname)) {
    return "detail";
  }

  return "core";
}

export function publicCanvasForArchetype(archetype: PublicRouteArchetype) {
  switch (archetype) {
    case "home":
    case "hub":
    case "directory":
    case "data-explorer":
      return "max-w-[1680px]";
    case "detail":
      return "max-w-[1920px]";
    case "workspace":
      return "max-w-[1600px]";
    case "reading":
    case "focused-task":
      return "max-w-[1180px]";
    case "core":
      return "max-w-[1440px]";
  }
}
