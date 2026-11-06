import { Link } from "@tanstack/react-router";
import {
  V3_ORGANIZER_TAB_ORDER,
  v3OrganizerTabForPath,
  v3OrganizerTabRoot,
} from "@/lib/v3-organizer";
import "@/styles/v3-organizer-web-navigation.css";

const labels = {
  overview: "Overview",
  tasks: "Tasks",
  control: "Control",
  live: "Live",
  more: "More",
} as const;

const normalize = (path: string) => path.replace(/\/+$/, "") || "/";

/** Browser links use native history, not installed app route memory. */
export function OrganizerV3WebNavigation({ pathname }: { pathname: string }) {
  const activeTab = v3OrganizerTabForPath(pathname);
  return (
    <nav
      className="v3-organizer-web-navigation"
      aria-label="Organizer website sections"
      data-organizer-v3-web-navigation=""
    >
      {V3_ORGANIZER_TAB_ORDER.map((tab) => {
        const target = v3OrganizerTabRoot(tab);
        const active = activeTab === tab;
        const current = active
          ? normalize(pathname) === normalize(target) ? "page" : "location"
          : undefined;
        return (
          <Link
            key={tab}
            to={target as any}
            aria-current={current}
            data-active={active ? "true" : "false"}
            className="v3-organizer-web-navigation__link"
          >
            {labels[tab]}
          </Link>
        );
      })}
    </nav>
  );
}
