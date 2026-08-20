import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ChevronDown,
  CircleHelp,
  Compass,
  Home,
  Menu,
  Sparkles,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { CountryProfileExtension } from "@/components/CountryProfileExtension";
import { EditionHostingExtension } from "@/components/EditionHostingExtension";
import { HomeAnniversaryTakeover } from "@/components/HomeAnniversaryTakeover";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAccountAccess, type AccountAccess } from "@/lib/country-account";
import { cn } from "@/lib/utils";

type PublicNavItem = {
  to: string;
  label: string;
  description?: string;
};

const EXPLORE_NAV: PublicNavItem[] = [
  { to: "/editions", label: "Editions", description: "See every Solaris Song Contest edition" },
  { to: "/countries", label: "Countries", description: "See countries, entries and results" },
  { to: "/shows", label: "Shows", description: "Open semi-finals, finals and results" },
  { to: "/wiki", label: "Wiki", description: "Read detailed country pages" },
];

const INSIGHTS_NAV: PublicNavItem[] = [
  { to: "/analysis", label: "Analysis", description: "See what the results and votes show" },
  { to: "/pulse", label: "Pulse", description: "See what has changed recently" },
  { to: "/relationships", label: "Relationships", description: "See which countries often vote alike" },
  { to: "/records", label: "Records", description: "See all-time records and milestones" },
];

const TOOL_ROUTES = [
  "/tools",
  "/result-lab",
  "/taste-dna",
  "/broadcast-intelligence",
  "/archive-games",
  "/compare",
] as const;

const INSIGHT_ROUTES = [
  ...INSIGHTS_NAV.map((item) => item.to),
  ...TOOL_ROUTES,
] as string[];

const EXPLORE_ROUTES = EXPLORE_NAV.map((item) => item.to);
const PARTICIPATE_ROUTES = ["/participate", "/confirmations", "/televoting"];
const ACCOUNT_ROUTES = ["/me", "/auth", "/country-hub"];

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

    void supabase.auth.getUser().then(({ data }) =>
      refresh(data.user?.id ?? null, data.user?.email ?? null),
    );

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

  /*
   * Admin routes own their shell in src/components/admin/AdminShell.tsx.
   * Keeping AppShell as a pass-through here prevents nested public/admin
   * navigation when an organizer moves between workspaces.
   */
  if (pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  const roleItems: Array<{ to: string; label: string }> = [];

  if (access.isOrganizer) {
    roleItems.push({ to: "/admin/operations", label: "Organizer workspace" });
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  // Profile, activity, country ownership and country editing are one workspace.
  // /me stays as a backwards-compatible redirect, but the navigation no longer
  // advertises it as a separate product from My Solaris.
  const accountHref = email ? "/country-hub" : "/auth";
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
      to: "/analysis",
      label: "Insights",
      icon: BarChart3,
      active: anyPathMatches(pathname, INSIGHT_ROUTES),
    },
    {
      to: "/predictions",
      label: "Predict",
      icon: Sparkles,
      active: pathMatches(pathname, "/predictions"),
    },
    {
      to: accountHref,
      label: "Me",
      icon: User,
      active: anyPathMatches(pathname, ACCOUNT_ROUTES),
    },
  ];

  const isCountryPage = /^\/countries\/[^/]+\/?$/i.test(pathname);
  const isEditionPage = /^\/editions\/[^/]+\/?$/i.test(pathname);
  const isHomePage = pathname === "/";
  const exploreActive = anyPathMatches(pathname, EXPLORE_ROUTES);
  const insightsActive = anyPathMatches(pathname, INSIGHT_ROUTES);
  const participateActive = anyPathMatches(pathname, PARTICIPATE_ROUTES);
  const guideActive = pathMatches(pathname, "/guide");
  const accountActive = anyPathMatches(pathname, ACCOUNT_ROUTES) || pathname.startsWith("/admin");

  return (
    <div className="relative isolate min-h-screen overflow-x-clip">
      <div aria-hidden="true" className="app-background" />

      <header className="site-nav sticky top-0 z-40 border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4 px-3 sm:px-5 lg:px-6">
          <Brand />

          <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            <Link
              to="/"
              aria-current={pathname === "/" ? "page" : undefined}
              className={desktopNavClass(pathname === "/")}
            >
              Home
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
              to="/predictions"
              aria-current={pathMatches(pathname, "/predictions") ? "page" : undefined}
              className={desktopNavClass(pathMatches(pathname, "/predictions"))}
            >
              Predict
            </Link>

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

            <Link
              to="/guide"
              aria-current={guideActive ? "page" : undefined}
              className={desktopNavClass(guideActive)}
            >
              Guide
            </Link>

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
                    <p className="truncate text-xs font-semibold text-foreground">My Solaris</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{email}</p>
                  </div>
                  <Link to="/country-hub" className="nav-menu-item mt-1">
                    <span className="font-semibold">Open My Solaris</span>
                    <span className="text-[10px] text-muted-foreground">
                      Profile, activity{access.countryId ? " & country" : " & country setup"}
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
              <MobileNavSection title="Explore" items={EXPLORE_NAV} pathname={pathname} />
              <MobileNavSection title="Insights" items={INSIGHTS_NAV} pathname={pathname} />

              <div className="mb-5">
                <p className="mb-1.5 px-2 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">
                  Do something
                </p>
                <Link
                  to="/predictions"
                  className={mobileDrawerLink(pathMatches(pathname, "/predictions"))}
                >
                  Predictions
                </Link>
                <Link to="/tools" className={mobileDrawerLink(anyPathMatches(pathname, TOOL_ROUTES))}>
                  Tools
                </Link>
                <Link to="/participate" className={mobileDrawerLink(participateActive)}>
                  Participate
                </Link>
                <Link to="/guide" className={mobileDrawerLink(guideActive)}>
                  <CircleHelp className="mr-2 h-4 w-4" /> Guide
                </Link>
              </div>

              {email && (
                <div className="mb-5 border-t border-border/55 pt-4">
                  <p className="mb-1.5 px-2 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">
                    My Solaris
                  </p>
                  <Link
                    to="/country-hub"
                    className={mobileDrawerLink(
                      pathMatches(pathname, "/country-hub") || pathMatches(pathname, "/me"),
                    )}
                  >
                    My Solaris
                  </Link>
                  {roleItems.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to as any}
                      className={mobileDrawerLink(pathMatches(pathname, item.to))}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </nav>

            <div
              className="border-t border-border p-4"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            >
              {email ? (
                <div className="space-y-3">
                  <p className="truncate text-[10px] text-muted-foreground">{email}</p>
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

      <main className="app-main relative z-10 mx-auto min-w-0 max-w-[1320px] px-3 py-4 sm:px-5 sm:py-6 lg:px-6 lg:py-8">
        {isHomePage && <HomeAnniversaryTakeover />}
        {children}
        {isEditionPage && <EditionHostingExtension pathname={pathname} />}
        {isCountryPage && <CountryProfileExtension pathname={pathname} />}
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

function mobileDrawerLink(active: boolean) {
  return cn(
    "mb-1 flex min-h-11 items-center rounded-xl border px-3 text-sm font-semibold transition-colors",
    active
      ? "border-primary/15 bg-surface-strong text-foreground"
      : "border-transparent text-muted-foreground hover:bg-surface hover:text-foreground",
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
  items: PublicNavItem[];
  footer?: PublicNavItem;
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

function MobileNavSection({
  title,
  items,
  pathname,
}: {
  title: string;
  items: PublicNavItem[];
  pathname: string;
}) {
  return (
    <div className="mb-5">
      <p className="mb-1.5 px-2 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">
        {title}
      </p>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to as any}
          className={mobileDrawerLink(pathMatches(pathname, item.to))}
        >
          <span className="min-w-0">
            <span className="block truncate">{item.label}</span>
            {item.description && (
              <span className="mt-0.5 block text-[10px] font-normal leading-relaxed text-muted-foreground/70">
                {item.description}
              </span>
            )}
          </span>
        </Link>
      ))}
    </div>
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
          src="/IMG_9177.png"
          alt=""
          aria-hidden="true"
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
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const visibleEyebrow = productEyebrow(eyebrow);

  return (
    <header className="page-header mb-5 min-w-0 border-b border-border/60 pb-4 sm:mb-6 sm:pb-5 lg:mb-7">
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
        {actions && <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">{actions}</div>}
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
      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="numeric mt-1 break-words text-2xl font-semibold leading-none sm:text-3xl">{value}</p>
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}
