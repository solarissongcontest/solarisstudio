import {
  PUBLIC_DESTINATIONS,
  PUBLIC_GLOBAL_AREAS,
  publicAreaForPath,
  publicPathMatches,
} from "./public-navigation";

export type PublicBreadcrumb = {
  label: string;
  to?: string;
};

export function publicBreadcrumbsForPath(pathname: string): PublicBreadcrumb[] {
  const area = publicAreaForPath(pathname);

  const globalArea = PUBLIC_GLOBAL_AREAS.find((item) => item.id === area);
  const areaRoot =
    area === "help"
      ? { label: "Rules & help", to: "/guide" }
      : globalArea
        ? { label: globalArea.label, to: globalArea.to }
        : null;

  if (!areaRoot) return [];
  if (pathname === areaRoot.to || pathname === `${areaRoot.to}/`) return [];

  const matched = PUBLIC_DESTINATIONS.filter(
    (item) => item.area === area && publicPathMatches(pathname, item.to),
  ).sort((a, b) => b.to.length - a.to.length)[0];

  if (!matched || matched.to === areaRoot.to) return [];

  if (pathname === matched.to || pathname === `${matched.to}/`) {
    return [{ label: areaRoot.label, to: areaRoot.to }, { label: matched.label }];
  }

  return [
    { label: areaRoot.label, to: areaRoot.to },
    { label: matched.label, to: matched.to },
  ];
}
