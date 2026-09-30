import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Flag,
  RadioTower,
  Sparkles,
  Table2,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { FlagChip } from "@/components/FlagChip";
import {
  editionLabel,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import { isShowPublic, resolveShowPublication } from "@/lib/publication";
import { publicAreaForPath } from "@/lib/public-navigation";
import { cn } from "@/lib/utils";

type AdaptiveKind = "explore" | "countries" | "editions" | "results";

type MasterLinkProps = {
  to: string;
  label: string;
  description?: string;
  pathname: string;
  icon?: LucideIcon;
  leading?: ReactNode;
};

function activePath(pathname: string, target: string) {
  return target === "/"
    ? pathname === "/"
    : pathname === target || pathname.startsWith(target + "/");
}

function MasterLink({
  to,
  label,
  description,
  pathname,
  icon: Icon,
  leading,
}: MasterLinkProps) {
  const active = activePath(pathname, to.split("?")[0] || to);
  return (
    <Link
      to={to as any}
      aria-current={active ? "page" : undefined}
      className={cn(
        "solaris-app-master-link",
        active && "is-active",
      )}
    >
      <span className="solaris-app-master-link-icon" aria-hidden="true">
        {leading ?? (Icon ? <Icon className="size-4" /> : null)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{label}</span>
        {description ? (
          <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function adaptiveKind(pathname: string, searchStr: string): AdaptiveKind | null {
  if (pathname.startsWith("/countries")) return "countries";
  if (pathname.startsWith("/editions")) return "editions";
  if (
    publicAreaForPath(pathname) === "results" ||
    (pathname.startsWith("/shows/") && searchStr.includes("from=results"))
  ) {
    return "results";
  }
  if (publicAreaForPath(pathname) === "explore") return "explore";
  return null;
}

export function AppAdaptiveWorkspace({
  pathname,
  searchStr,
  children,
}: {
  pathname: string;
  searchStr: string;
  children: ReactNode;
}) {
  const kind = adaptiveKind(pathname, searchStr);
  if (!kind) return <>{children}</>;

  return (
    <div className="solaris-app-adaptive-workspace" data-adaptive-kind={kind}>
      <aside className="solaris-app-master-pane" aria-label="Browse this section">
        {kind === "countries" ? (
          <CountriesMasterPane pathname={pathname} />
        ) : kind === "editions" ? (
          <EditionsMasterPane pathname={pathname} />
        ) : kind === "results" ? (
          <ResultsMasterPane pathname={pathname} />
        ) : (
          <ExploreMasterPane pathname={pathname} />
        )}
      </aside>
      <section className="solaris-app-detail-pane min-w-0">
        {children}
      </section>
    </div>
  );
}

function MasterHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="solaris-app-master-heading">
      <p>{eyebrow}</p>
      <h2>{title}</h2>
      <span>{description}</span>
    </div>
  );
}

function ExploreMasterPane({ pathname }: { pathname: string }) {
  const links: Array<{
    to: string;
    label: string;
    description: string;
    icon: LucideIcon;
  }> = [
    {
      to: "/countries",
      label: "Countries",
      description: "Delegations, entries and histories",
      icon: Flag,
    },
    {
      to: "/editions",
      label: "Editions",
      description: "Every SSC contest cycle",
      icon: CalendarDays,
    },
    {
      to: "/shows",
      label: "Shows",
      description: "Semi-finals, finals and broadcasts",
      icon: RadioTower,
    },
    {
      to: "/stories",
      label: "Stories",
      description: "Published contest stories",
      icon: Sparkles,
    },
    {
      to: "/wiki",
      label: "Wiki",
      description: "Detailed reference articles",
      icon: BookOpen,
    },
  ];

  return (
    <>
      <MasterHeading
        eyebrow="Explore"
        title="Solaris archive"
        description="Keep the archive visible while opening detail pages."
      />
      <nav className="solaris-app-master-list" aria-label="Explore Solaris">
        {links.map((item) => (
          <MasterLink key={item.to} pathname={pathname} {...item} />
        ))}
      </nav>
    </>
  );
}

function CountriesMasterPane({ pathname }: { pathname: string }) {
  const { data: countries = [], isLoading } = useCountries();
  const rows = useMemo(
    () => [...countries].sort((a, b) => a.name.localeCompare(b.name)),
    [countries],
  );

  return (
    <>
      <MasterHeading
        eyebrow="Explore"
        title="Countries"
        description="Choose a delegation without leaving the current workspace."
      />
      <nav className="solaris-app-master-list" aria-label="Countries">
        <MasterLink
          to="/countries"
          label="All countries"
          description="Directory and filters"
          pathname={pathname}
          icon={Flag}
        />
        {isLoading ? (
          <p className="solaris-app-master-note">Loading delegations…</p>
        ) : (
          rows.map((country) => (
            <MasterLink
              key={country.id}
              to={"/countries/" + country.short_code.toLowerCase()}
              label={country.name}
              pathname={pathname}
              leading={
                <FlagChip
                  code={country.short_code}
                  color={country.accent_color}
                  image={country.flag_image}
                  size="sm"
                />
              }
            />
          ))
        )}
      </nav>
    </>
  );
}

function EditionsMasterPane({ pathname }: { pathname: string }) {
  const { data: editions = [], isLoading } = useEditions();
  const rows = useMemo(
    () =>
      [...editions]
        .filter((edition) => edition.published)
        .sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1)),
    [editions],
  );

  return (
    <>
      <MasterHeading
        eyebrow="Explore"
        title="Editions"
        description="Move through contest cycles while the selected edition stays in detail."
      />
      <nav className="solaris-app-master-list" aria-label="Editions">
        <MasterLink
          to="/editions"
          label="All editions"
          description="Contest archive"
          pathname={pathname}
          icon={CalendarDays}
        />
        {isLoading ? (
          <p className="solaris-app-master-note">Loading editions…</p>
        ) : (
          rows.map((edition) => (
            <MasterLink
              key={edition.id}
              to={"/editions/" + edition.slug}
              label={editionLabel(edition)}
              description={edition.host_city ?? edition.name ?? undefined}
              pathname={pathname}
              icon={CalendarDays}
            />
          ))
        )}
      </nav>
    </>
  );
}

function ResultsMasterPane({ pathname }: { pathname: string }) {
  const { data: editions = [] } = useEditions();
  const { data: shows = [], isLoading } = useAllShows();
  const editionMap = useMemo(
    () => new Map(editions.map((edition) => [edition.id, edition])),
    [editions],
  );
  const rows = useMemo(
    () =>
      shows
        .filter(
          (show) =>
            isShowPublic(show) &&
            resolveShowPublication(show).results,
        )
        .sort((a, b) => {
          const aEdition = editionMap.get(a.edition_id)?.edition_number ?? -1;
          const bEdition = editionMap.get(b.edition_id)?.edition_number ?? -1;
          if (aEdition !== bEdition) return bEdition - aEdition;
          const aFinal = a.kind === "grand-final" || a.kind === "final";
          const bFinal = b.kind === "grand-final" || b.kind === "final";
          if (aFinal !== bFinal) return aFinal ? -1 : 1;
          return a.sort_order - b.sort_order;
        }),
    [editionMap, shows],
  );

  return (
    <>
      <MasterHeading
        eyebrow="Results"
        title="Result workspace"
        description="Keep result views and published shows within reach."
      />
      <nav className="solaris-app-master-list" aria-label="Results">
        <MasterLink
          to="/results"
          label="Overview"
          description="Latest published result"
          pathname={pathname}
          icon={Trophy}
        />
        <MasterLink
          to="/scorecharts"
          label="Scorecharts"
          description="Detailed published voting"
          pathname={pathname}
          icon={Table2}
        />
        <MasterLink
          to="/analysis"
          label="Analysis"
          description="Voting and result patterns"
          pathname={pathname}
          icon={BarChart3}
        />
        <div className="solaris-app-master-divider" />
        <p className="solaris-app-master-section-label">Published shows</p>
        {isLoading ? (
          <p className="solaris-app-master-note">Loading published results…</p>
        ) : (
          rows.slice(0, 30).map((show) => {
            const edition = editionMap.get(show.edition_id);
            return (
              <MasterLink
                key={show.id}
                to={"/shows/" + show.id + "?from=results"}
                label={show.name}
                description={edition ? editionLabel(edition) : undefined}
                pathname={pathname}
                icon={Trophy}
              />
            );
          })
        )}
      </nav>
    </>
  );
}
