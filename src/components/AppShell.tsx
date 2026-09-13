import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronDown,
  Compass,
  Home,
  Menu,
  Trophy,
  User,
  Vote,
  X,
  type LucideIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { getCurrentAccountAccess, type AccountAccess } from "@/lib/country-account";
import { cn } from "@/lib/utils";
import {
  PublicDrawerNavigation,
  PublicSiteSidebar,
  publicGroup,
  type PublicNavigationItem,
} from "@/components/public/PublicSiteNavigation";

const LazyHomeAnniversaryTakeover = lazy(() =>
  import("@/components/HomeAnniversaryTakeover").then((module) => ({
    default: module.HomeAnniversaryTakeover,
  })),
);

const LazyEditionHostingExtension = lazy(() =>
  import("@/components/EditionHostingExtension").then((module) => ({
    default: module.EditionHostingExtension,
  })),
);

const EXPLORE_NAV = publicGroup("explore").items;
const REFERENCE_NAV = publicGroup("reference").items;
const INSIGHTS_NAV = publicGroup("insights").items;
const PARTICIPATE_NAV = publicGroup("participate").items;
const TOOL_NAV = publicGroup("tools").items;
const ACCOUNT_NAV = publicGroup("account").items;

const INSIGHT_ROUTES = [...INSIGHTS_NAV, ...TOOL_NAV].map((item) => item.to);
const EXPLORE_ROUTES = EXPLORE_NAV.map((item) => item.to);
const RESULT_ROUTES = [
  "/results",
  "/scorecharts",
  "/analysis",
  "/records",
  "/relationships",
  "/compare",
  "/result-lab",
  "/taste-dna",
  "/broadcast-intelligence",
] as const;
const PARTICIPATE_ROUTES = PARTICIPATE_NAV.map((item) => item.to);
const REFERENCE_ROUTES = REFERENCE_NAV.map((item) => item.to);
const ACCOUNT_ROUTES = ["/me", "/auth", ...ACCOUNT_NAV.map((item) => item.to)];

type PublicLayout = "home" | "reading" | "directory" | "detail" | "data" | "workspace" | "core";

const PUBLIC_CANVAS_CLASS: Record<PublicLayout, string> = {
  home: "max-w-[1680px]",
  reading: "max-w-[1180px]",
  directory: "max-w-[1680px]",
  detail: "max-w-[1920px]",
  data: "max-w-[1680px]",
  workspace: "max-w-[1600px]",
  core: "max-w-[1440px]",
};

function publicLayoutForPath(pathname: string): PublicLayout {
  if (pathname === "/") return "home";

  if (/^\/(guide|auth|reset|recover)(\/|$)/.test(pathname)) return "reading";

  if (
    /^\/(analysis|relationships|records|scorecharts|pulse|broadcast-intelligence)(\/|$)/.test(
      pathname,
    )
  ) {
    return "data";
  }

  if (
    /^\/(predictions|compare|result-lab|taste-dna|archive-games|participate|confirmations|jury-voting|televoting|next-in-line|my-solaris|country-hub)(\/|$)/.test(
      pathname,
    )
  ) {
    return "workspace";
  }

  const directory = pathname.match(/^\/(countries|wiki|editions|shows|results|tools)\/?$/);
  if (directory) return "directory";

  if (/^\/(countries|wiki|editions|shows|results)\/.+/.test(pathname)) return "detail";

  return "core";
}

function pathMatches(pathname: string, route: string) {
  return route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`);
}

function anyPathMatches(pathname: string, routes: readonly string[]) {
  return routes.some((route) => pathMatches(pathname, route));
}

function productEyebrow(eyebrow?: string) {
  return eyebrow?.replace(/^Phase\s+\d+\s*[·:—-]\s*/i, "");
}

const EMPTY_ACCESS: AccountAccess = {
  userId: null,
  isOrganizer: false,
  countryId: null,
  countryStatus: null,
  suspensionReason: null,
  schemaReady: true,
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [email, setEmail] = useState<string | null>(null);
  const [access, setAccess] = useState<AccountAccess>(EMPTY_ACCESS);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let alive = true;

    const refresh = async (userId?: string | null, userEmail?: string | null) => {
      if (!alive) return;
      setEmail(userEmail ?? null);

      if (!userId) {
        setAccess(EMPTY_ACCESS);
        return;
      }

      const next = await getCurrentAccountAccess(userId);
      if (alive) setAccess(next);
    };

    void supabase.auth
      .getUser()
      .then(({ data }) => refresh(data.user?.id ?? null, data.user?.email ?? null));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(
        () => void refresh(session?.user?.id ?? null, session?.user?.email ?? null),
        0,
      );
    });

    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (
      pathname !== "/" &&
      !pathname.startsWith("/pulse") &&
      !pathname.startsWith("/auth") &&
      !pathname.startsWith("/me") &&
      !pathname.startsWith("/my-solaris") &&
      !pathname.startsWith("/admin") &&
      !pathname.startsWith("/country-hub")
    ) {
      window.localStorage.setItem("solaris:last-meaningful-route", pathname);
    }
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  if (pathname.startsWith("/admin")) return <>{children}</>;

  const roleItems: Array<{ to: string; label: string }> = [];
  if (access.isOrganizer) roleItems.push({ to: "/admin/operations", label: "Organizer workspace" });

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const accountHref = email ? "/my-solaris" : "/auth";
  const publicLayout = publicLayoutForPath(pathname);
  const showPublicSidebar =
    !pathname.startsWith("/auth") &&
    !pathname.startsWith("/reset") &&
    !pathname.startsWith("/recover") &&
    !pathname.startsWith("/broadcast/");
  const visibleAccountEmail =
    email && !email.toLowerCase().endsWith("@country.solaris.invalid") ? email : null;
  const resultsActive = pathMatches(pathname, "/results");
  const quickNavigation: Array<{
    to: string;
    label: string;
    icon: LucideIcon;
    active: boolean;
  }> = [
    { to: "/", label: "Home", icon: Home, active: pathname === "/" },
    {
      to: "/editions",
      label: "Explore",
      icon: Compass,
      active: anyPathMatches(pathname, EXPLORE_ROUTES),
    },
    {
      to: "/participate",
      label: "Participate",
      icon: Vote,
      active: anyPathMatches(pathname, PARTICIPATE_ROUTES),
    },
    {
      to: "/results",
      label: "Results",
      icon: Trophy,
      active: anyPathMatches(pathname, RESULT_ROUTES),
    },
    {
      to: accountHref,
      label: "Me",
      icon: User,
      active: anyPathMatches(pathname, ACCOUNT_ROUTES),
    },
  ];

  const isEditionPage = /^\/editions\/[^/]+\/?$/i.test(pathname);
  const isHomePage = pathname === "/";
  const exploreActive = anyPathMatches(pathname, EXPLORE_ROUTES);
  const insightsActive = anyPathMatches(pathname, INSIGHT_ROUTES);
  const participateActive = anyPathMatches(pathname, PARTICIPATE_ROUTES);
  const referenceActive = anyPathMatches(pathname, REFERENCE_ROUTES);
  const accountActive = anyPathMatches(pathname, ACCOUNT_ROUTES) || pathname.startsWith("/admin");

  return (
    <div className="relative isolate min-h-screen overflow-x-clip">
      <div aria-hidden="true" className="app-background" />

      <header className="site-nav sticky top-0 z-40 border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-[1680px] items-center gap-4 px-3 sm:px-5 lg:px-8 2xl:px-10">
          <Brand />

          <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            <Link
              to="/"
              aria-current={pathname === "/" ? "page" : undefined}
              className={desktopNavClass(pathname === "/")}
            >
              Home
            </Link>

            <Link
              to="/results"
              aria-current={resultsActive ? "page" : undefined}
              className={desktopNavClass(resultsActive)}
            >
              Results
            </Link>

            <DesktopNavMenu
              key={`explore-${pathname}`}
              label="Explore"
              active={exploreActive}
              items={EXPLORE_NAV}
            />

            <DesktopNavMenu
              key={`insights-${pathname}`}
              label="Insights"
              active={insightsActive}
              items={INSIGHTS_NAV}
              footer={{
                to: "/tools",
                label: "Open tools",
                description: "Try Result Lab, Taste DNA, comparisons and archive games",
              }}
            />

            <Link
              to="/participate"
              aria-current={participateActive ? "page" : undefined}
              className={cn(
                "ml-1 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors",
                participateActive
                  ? "border-primary/35 bg-primary/12 text-foreground"
                  : "border-border/75 bg-surface/55 text-foreground hover:border-primary/30 hover:bg-surface-strong",
              )}
            >
              Participate
            </Link>

            <DesktopNavMenu
              key={`reference-${pathname}`}
              label="Rules & help"
              active={referenceActive}
              items={REFERENCE_NAV}
            />

            {email ? (
              <details key={`account-${pathname}`} className="group relative ml-1">
                <summary
                  className={cn(
                    desktopNavClass(accountActive),
                    "flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden",
                  )}
                >
                  Me
                  <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                </summary>
                <div className="nav-menu-panel absolute right-0 top-[calc(100%+.6rem)] w-64 overflow-hidden rounded-2xl border border-border/70 p-2 shadow-2xl">
                  <div className="border-b border-border/55 px-3 py-2.5">
                    <p className="truncate text-xs font-semibold text-foreground">MySolaris</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {visibleAccountEmail ?? "Country account"}
                    </p>
                  </div>
                  <Link to="/my-solaris" className="nav-menu-item mt-1">
                    <span className="font-semibold">Open MySolaris</span>
                    <span className="text-[10px] text-muted-foreground">
                      Dashboard, participation
                      {access.countryId ? " & country tools" : " & country setup"}
                    </span>
                  </Link>
                  <Link to="/country-hub" className="nav-menu-item">
                    <span className="font-semibold">Country workspace</span>
                    <span className="text-[10px] text-muted-foreground">
                      Edit country, entries, page and media
                    </span>
                  </Link>
                  {roleItems.map((item) => (
                    <Link key={item.to} to={item.to as any} className="nav-menu-item">
                      <span className="font-semibold">{item.label}</span>
                    </Link>
                  ))}
                  <button
                    type="button"
                    onClick={signOut}
                    className="mt-1 flex min-h-11 w-full items-center rounded-xl px-3 text-left text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                  >
                    Sign out
                  </button>
                </div>
              </details>
            ) : (
              <Link to="/auth" className={cn(desktopNavClass(accountActive), "ml-1")}>
                Me
              </Link>
            )}
          </nav>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="ml-auto grid h-11 w-11 place-items-center rounded-xl border border-border/75 bg-surface/70 lg:hidden"
            aria-label="Open navigation"
            aria-expanded={menuOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />

          <aside
            className="public-drawer absolute bottom-0 right-0 top-0 flex w-[min(90vw,360px)] flex-col border-l border-border bg-background/96"
            aria-label="Navigation menu"
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <Brand compact />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface"
                aria-label="Close navigation"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <nav className="scroll-slim flex-1 overflow-y-auto p-3" aria-label="Mobile navigation">
              <PublicDrawerNavigation pathname={pathname} isOrganizer={access.isOrganizer} />
            </nav>

            <div
              className="border-t border-border p-4"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            >
              {email ? (
                <div className="space-y-3">
                  <p className="truncate text-[10px] text-muted-foreground">
                    {visibleAccountEmail ?? "Country account"}
                  </p>
                  <button
                    type="button"
                    onClick={signOut}
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  to="/auth"
                  className="bg-aurora flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold text-primary-foreground"
                >
                  Sign in to Solaris
                </Link>
              )}
            </div>
          </aside>
        </div>
      )}

      <main
        data-public-layout={publicLayout}
        className={cn(
          "app-main relative z-10 mx-auto w-full min-w-0 px-3 pb-24 pt-4 sm:px-5 sm:pb-24 sm:pt-6 lg:px-8 lg:py-8 2xl:px-10",
          PUBLIC_CANVAS_CLASS[publicLayout],
        )}
      >
        {showPublicSidebar ? (
          <div className="public-site-layout">
            <PublicSiteSidebar pathname={pathname} isOrganizer={access.isOrganizer} />
            <div className="public-site-content min-w-0">
              {isHomePage && (
                <Suspense fallback={null}>
                  <LazyHomeAnniversaryTakeover />
                </Suspense>
              )}
              {children}
              {isEditionPage && (
                <Suspense fallback={null}>
                  <LazyEditionHostingExtension pathname={pathname} />
                </Suspense>
              )}
            </div>
          </div>
        ) : (
          <>
            {isHomePage && (
              <Suspense fallback={null}>
                <LazyHomeAnniversaryTakeover />
              </Suspense>
            )}
            {children}
            {isEditionPage && (
              <Suspense fallback={null}>
                <LazyEditionHostingExtension pathname={pathname} />
              </Suspense>
            )}
          </>
        )}
      </main>

      <nav
        className="mobile-quick-nav fixed inset-x-0 bottom-0 z-50 border-t border-border/70 px-2 pt-1.5 lg:hidden"
        style={{ paddingBottom: "max(.4rem, env(safe-area-inset-bottom))" }}
        aria-label="Primary navigation"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
          {quickNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                to={item.to as any}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "flex min-h-13 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[9px] font-semibold transition-colors",
                  item.active ? "bg-surface-strong text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function desktopNavClass(active: boolean) {
  return cn(
    "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
    active
      ? "bg-surface-strong text-foreground"
      : "text-muted-foreground hover:bg-surface hover:text-foreground",
  );
}

function DesktopNavMenu({
  label,
  active,
  items,
  footer,
}: {
  label: string;
  active: boolean;
  items: PublicNavigationItem[];
  footer?: PublicNavigationItem;
}) {
  return (
    <details className="group relative">
      <summary
        className={cn(
          desktopNavClass(active),
          "flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden",
        )}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="nav-menu-panel absolute left-0 top-[calc(100%+.6rem)] w-80 overflow-hidden rounded-2xl border border-border/70 p-2 shadow-2xl">
        {items.map((item) => (
          <Link key={item.to} to={item.to as any} className="nav-menu-item">
            <span className="font-semibold text-foreground">{item.label}</span>
            {item.description && (
              <span className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                {item.description}
              </span>
            )}
          </Link>
        ))}
        {footer && (
          <Link
            to={footer.to as any}
            className="mt-1 flex min-h-12 flex-col justify-center rounded-xl border border-primary/12 bg-primary/[0.055] px-3 py-2 text-xs transition-colors hover:bg-primary/[0.09]"
          >
            <span className="font-semibold text-foreground">{footer.label}</span>
            {footer.description && (
              <span className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                {footer.description}
              </span>
            )}
          </Link>
        )}
      </div>
    </details>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Solaris Studio home">
      <div
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden rounded-full",
          compact ? "h-9 w-9" : "h-10 w-10",
        )}
      >
        <img
          src="/solaris-studio-mark.png"
          alt=""
          aria-hidden="true"
          width={256}
          height={256}
          className="h-full w-full object-contain"
        />
      </div>
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-display text-sm font-semibold">Solaris Studio</span>
        <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
          Terra Solaris · SSC
        </span>
      </span>
    </Link>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const visibleEyebrow = productEyebrow(eyebrow);

  return (
    <header
      className={cn(
        "page-header mb-5 min-w-0 border-b border-border/60 pb-4 sm:mb-6 sm:pb-5 lg:mb-7",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {visibleEyebrow && (
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-primary sm:text-[11px]">
              {visibleEyebrow}
            </p>
          )}
          <h1 className="break-words font-display text-3xl font-black leading-[1.02] tracking-[-0.04em] sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">{actions}</div>
        )}
      </div>
    </header>
  );
}

type PanelVariant = "data" | "editorial" | "glass" | "plain";

export function Panel({
  title,
  description,
  children,
  className,
  actions,
  variant = "data",
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
  variant?: PanelVariant;
}) {
  return (
    <section
      className={cn(
        "min-w-0",
        variant === "data" && "data-panel p-4 sm:p-5",
        variant === "editorial" && "editorial-section py-1",
        variant === "glass" && "glass p-4 sm:p-5",
        variant === "plain" && "py-1",
        className,
      )}
    >
      {(title || actions) && (
        <div
          className={cn(
            "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
            variant === "editorial" || variant === "plain"
              ? "mb-3 border-b border-border/55 pb-3"
              : "mb-4",
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="break-words font-display text-base font-bold tracking-[-0.02em] sm:text-lg">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex min-w-0 flex-wrap gap-2 sm:shrink-0 sm:justify-end">{actions}</div>
          )}
        </div>
      )}
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="stat-line min-w-0 border-l border-border/60 pl-3 first:border-l-0 first:pl-0">
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="numeric mt-1 break-words text-2xl font-semibold leading-none sm:text-3xl">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}
