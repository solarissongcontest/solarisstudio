import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  Bookmark,
  CircleUserRound,
  ClipboardCheck,
  Flag,
  History,
  Home,
  ListChecks,
  MoreHorizontal,
  PanelsTopLeft,
  Sparkles,
  Vote,
  type LucideIcon,
} from "lucide-react";

import { useMySolaris } from "@/components/mysolaris/MySolarisContext";
import {
  MY_SOLARIS_MOBILE_PRIMARY_IDS,
  MY_SOLARIS_NAVIGATION,
  mySolarisItemIsActive,
  mySolarisMoreItems,
  mySolarisNavigationItems,
  type MySolarisNavigationItem,
  type MySolarisSectionId,
} from "@/lib/my-solaris-navigation";
import { cn } from "@/lib/utils";

const ICONS: Record<MySolarisSectionId, LucideIcon> = {
  home: Home,
  tasks: ListChecks,
  entry: ClipboardCheck,
  voting: Vote,
  notices: Bell,
  country: Flag,
  "page-media": PanelsTopLeft,
  history: History,
  activity: Activity,
  predictions: Sparkles,
  saved: Bookmark,
  account: CircleUserRound,
};

export function MySolarisWorkspaceNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const workspace = useMySolaris();
  const primaryIds = new Set<MySolarisSectionId>(MY_SOLARIS_MOBILE_PRIMARY_IDS);
  const primaryItems = mySolarisNavigationItems().filter((item) => primaryIds.has(item.id));
  const moreItems = mySolarisMoreItems();
  const moreActive = moreItems.some((item) => mySolarisItemIsActive(item, pathname));
  const country = workspace.countryAccount?.country;

  return (
    <>
      <aside
        className="hidden self-start rounded-2xl border border-border/70 bg-surface/70 p-3 lg:sticky lg:top-24 lg:block"
        aria-label="MySolaris sections"
      >
        <WorkspaceIdentity
          countryName={country?.name}
          countryCode={country?.short_code}
          flagUrl={country?.flag_image}
          editionNumber={workspace.currentEdition?.edition_number}
        />

        <nav className="mt-4 space-y-4">
          {MY_SOLARIS_NAVIGATION.map((group, index) => (
            <div key={group.label ?? "home"}>
              {group.label ? (
                <p className="mb-1.5 px-2 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                  {group.label}
                </p>
              ) : null}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <WorkspaceLink
                    key={item.id}
                    item={item}
                    pathname={pathname}
                    badge={badgeFor(
                      item.id,
                      workspace.taskCounts.needsAction,
                      workspace.unreadNoticeCount,
                    )}
                  />
                ))}
              </div>
              {index === 0 ? <div className="mt-3 border-t border-border/55" /> : null}
            </div>
          ))}
        </nav>
      </aside>

      <section
        className="mb-4 rounded-2xl border border-border/70 bg-surface/75 p-1.5 lg:hidden"
        data-mysolaris-mobile-nav
      >
        <nav className="grid grid-cols-5 gap-1" aria-label="MySolaris mobile sections">
          {primaryItems.map((item) => (
            <MobileLink
              key={item.id}
              item={item}
              pathname={pathname}
              badge={badgeFor(
                item.id,
                workspace.taskCounts.needsAction,
                workspace.unreadNoticeCount,
              )}
            />
          ))}
          <details className="group relative">
            <summary
              className={cn(
                "flex min-h-12 cursor-pointer list-none flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold [&::-webkit-details-marker]:hidden",
                moreActive ? "bg-primary/10 text-primary" : "text-muted-foreground",
              )}
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
              More
            </summary>
            <div className="absolute right-0 top-[calc(100%+.5rem)] z-30 grid w-[min(88vw,22rem)] grid-cols-2 gap-1 rounded-2xl border border-border bg-background p-2 shadow-2xl">
              {moreItems.map((item) => (
                <WorkspaceLink
                  key={item.id}
                  item={item}
                  pathname={pathname}
                  badge={badgeFor(
                    item.id,
                    workspace.taskCounts.needsAction,
                    workspace.unreadNoticeCount,
                  )}
                  compact
                />
              ))}
            </div>
          </details>
        </nav>
      </section>
    </>
  );
}

function WorkspaceIdentity({
  countryName,
  countryCode,
  flagUrl,
  editionNumber,
  compact = false,
}: {
  countryName?: string;
  countryCode?: string;
  flagUrl?: string | null;
  editionNumber?: number | null;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {flagUrl ? (
        <img src={flagUrl} alt="" className="aspect-[3/2] h-8 w-12 shrink-0 rounded-lg bg-background/45 object-contain" />
      ) : (
        <span className="grid h-8 w-11 shrink-0 place-items-center rounded-lg border border-border bg-background text-[10px] font-black">
          {countryCode ?? "SSC"}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-primary">
          MySolaris
        </span>
        <span className="block truncate text-xs font-semibold">
          {countryName ?? "Country account"}
        </span>
        {!compact ? (
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            {editionNumber ? `SSC ${editionNumber}` : "No current edition"}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function WorkspaceLink({
  item,
  pathname,
  badge,
  compact = false,
}: {
  item: MySolarisNavigationItem;
  pathname: string;
  badge?: number;
  compact?: boolean;
}) {
  const Icon = ICONS[item.id];
  const active = mySolarisItemIsActive(item, pathname);
  return (
    <Link
      to={item.to as any}
      aria-current={active ? "page" : undefined}
      title={item.description}
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-xl px-2.5 text-xs font-semibold transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-surface-strong hover:text-foreground",
        compact && "min-h-11 border border-transparent",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {badge ? (
        <span className="grid min-w-5 place-items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-black text-primary">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

function MobileLink({
  item,
  pathname,
  badge,
}: {
  item: MySolarisNavigationItem;
  pathname: string;
  badge?: number;
}) {
  const Icon = ICONS[item.id];
  const active = mySolarisItemIsActive(item, pathname);
  return (
    <Link
      to={item.to as any}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground",
      )}
    >
      <span className="relative">
        <Icon className="size-4" aria-hidden="true" />
        {badge ? (
          <span
            className="absolute -right-2.5 -top-2 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[8px] font-black leading-4 text-primary-foreground"
            aria-label={`${badge} new`}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>
      {item.label}
    </Link>
  );
}

function badgeFor(id: MySolarisSectionId, taskCount: number, noticeCount: number) {
  if (id === "tasks") return taskCount;
  if (id === "notices") return noticeCount;
  return 0;
}
