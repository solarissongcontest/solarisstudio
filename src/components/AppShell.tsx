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

import { AppAdaptiveWorkspace } from "@/components/app/AppAdaptiveWorkspace";
import { AppMoreNavigation } from "@/components/app/AppMoreNavigation";
import { SolarisDraggableSheetContent } from "@/components/interaction/SolarisDraggableSheet";
import { AppTabBar } from "@/components/app/AppTabBar";
import { AppToolbar } from "@/components/app/AppToolbar";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { MySolarisWorkspaceShell } from "@/components/mysolaris/MySolarisWorkspaceShell";
import { PublicBreadcrumbs } from "@/components/public/PublicBreadcrumbs";
import { PublicCommandPalette } from "@/components/public/PublicCommandPalette";
import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicDrawerNavigation } from "@/components/public/PublicSiteNavigation";
import { PublicMobileSectionNav } from "@/components/public/PublicMobileSectionNav";
import { PublicSectionNav } from "@/components/public/PublicSectionNav";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { getSolarisAnniversary } from "@/lib/anniversary";
import { getAnniversaryPreviewPhase } from "@/lib/anniversary-preview";
import { getCurrentAccountAccess, type AccountAccess } from "@/lib/country-account";
import {
  consumeAppNavigationRestore,
  rememberAppLocation,
  updateAppScrollPosition,
} from "@/lib/app-navigation";
import { useAppAttentionSummary } from "@/lib/app-attention";
import { resolveAppRouteChrome } from "@/lib/app-route-chrome";
import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";
import { PUBLIC_GLOBAL_AREAS, publicAreaForPath } from "@/lib/public-navigation";
import {
  publicCanvasForArchetype,
  publicLayoutTokenForArchetype,
  publicRouteArchetype,
} from "@/lib/public-route-archetypes";
import { rememberPublicRecent } from "@/lib/public-recents";
import { trackPublicUxEvent } from "@/lib/public-ux-events";
import {
  CONFIRMATION_SUBMITTED_EVENT,
  TELEVOTE_SUBMITTED_EVENT,
} from "@/lib/submission-receipts";
import {
  buildPublicUserContext,
  publicGlobalAreasForContext,
} from "@/lib/public-user-context";
import { cn } from "@/lib/utils";

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

const GLOBAL_ICON_BY_AREA: Record<(typeof PUBLIC_GLOBAL_AREAS)[number]["id"], LucideIcon> = {
  home: Home,
  explore: Compass,
  participate: Vote,
  results: Trophy,
  me: User,
};

export function AppShell({ children }: { children: ReactNode }) {
  const { isAppMode } = useSolarisApp();
  const attention = useAppAttentionSummary();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const [email, setEmail] = useState<string | null>(null);
  const [access, setAccess] = useState<AccountAccess>(EMPTY_ACCESS);
  const [menuOpen, setMenuOpen] = useState(false);
  const appScreen = resolveSolarisAppScreen(pathname, searchStr);

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
    if (!isAppMode) return;

    const preserveScroll = appScreen.behavior.preserveScroll;
    const restoreY = preserveScroll
      ? consumeAppNavigationRestore(pathname, searchStr)
      : null;
    rememberAppLocation(pathname, searchStr, preserveScroll ? restoreY ?? undefined : 0);

    if (preserveScroll && restoreY != null) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => window.scrollTo({ top: restoreY, behavior: "auto" }));
      });
    }

    if (!preserveScroll) {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
      return;
    }

    let frame: number | null = null;
    const persistScroll = () => {
      frame = null;
      updateAppScrollPosition(pathname, searchStr, window.scrollY);
    };
    const onScroll = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(persistScroll);
    };
    const onPageHide = () => updateAppScrollPosition(pathname, searchStr, window.scrollY);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);
      if (frame != null) window.cancelAnimationFrame(frame);
      updateAppScrollPosition(pathname, searchStr, window.scrollY);
    };
  }, [appScreen.behavior.preserveScroll, isAppMode, pathname, searchStr]);

  useEffect(() => {
    const confirmationComplete = () =>
      trackPublicUxEvent("task_completed", {
        target: "/confirmations",
        metadata: { area: "participate", task_status: "submitted" },
      });
    const televoteComplete = () =>
      trackPublicUxEvent("task_completed", {
        target: "/televoting",
        metadata: { area: "participate", task_status: "submitted" },
      });

    window.addEventListener(CONFIRMATION_SUBMITTED_EVENT, confirmationComplete);
    window.addEventListener(TELEVOTE_SUBMITTED_EVENT, televoteComplete);
    return () => {
      window.removeEventListener(CONFIRMATION_SUBMITTED_EVENT, confirmationComplete);
      window.removeEventListener(TELEVOTE_SUBMITTED_EVENT, televoteComplete);
    };
  }, []);

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

    const timer = window.setTimeout(() => {
      const title =
        document.title
          .split("—")[0]
          ?.trim()
          .replace(/\s+—\s+Solaris Studio$/i, "") || pathname;
      rememberPublicRecent(pathname, title);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (pathname.startsWith("/admin")) return <>{children}</>;

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const publicUser = buildPublicUserContext({ userId: access.userId, access });
  const globalAreas = publicGlobalAreasForContext(publicUser);
  const publicArchetype = publicRouteArchetype(pathname);
  const publicLayout = publicLayoutTokenForArchetype(publicArchetype);
  const publicArea = publicAreaForPath(pathname);
  const visibleAccountEmail =
    email && !email.toLowerCase().endsWith("@country.solaris.invalid") ? email : null;
  const isEditionPage = /^\/editions\/[^/]+\/?$/i.test(pathname);
  const isHomePage = pathname === "/";
  const appChrome = resolveAppRouteChrome(pathname, searchStr);
  const isAppRootDestination = appChrome.root;
  const showHomeAnniversaryTakeover =
    isHomePage &&
    (getSolarisAnniversary().active ||
      getAnniversaryPreviewPhase(searchStr) === "active");
  const isMySolarisWorkspace =
    pathname === "/my-solaris" ||
    pathname === "/my-solaris/" ||
    pathname.startsWith("/my-solaris/");
  const focusedParticipationTask = appScreen.behavior.criticalTask;
  const showSectionNavigation =
    !isAppMode &&
    !isMySolarisWorkspace &&
    !focusedParticipationTask &&
    !pathname.startsWith("/auth") &&
    !pathname.startsWith("/reset") &&
    !pathname.startsWith("/recover") &&
    !pathname.startsWith("/broadcast/") &&
    (publicArea === "explore" ||
      publicArea === "participate" ||
      publicArea === "results" ||
      publicArea === "help");
  const quickNavigation = globalAreas.map((item) => ({
    to: item.to,
    label: item.label,
    icon: GLOBAL_ICON_BY_AREA[item.id],
    active: !pathname.startsWith("/site-directory") && publicArea === item.id,
  }));

  return (
    <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
      <div className="relative isolate min-h-screen overflow-x-clip">
        <div aria-hidden="true" className="app-background" />

        {isAppMode && appScreen.chrome.toolbar !== "hidden" ? (
          <AppToolbar pathname={pathname} searchStr={searchStr} access={access} />
        ) : null}

        {!isAppMode ? (
          <header className="site-nav sticky top-0 z-40 border-b border-border/60">
            <div className="mx-auto flex h-16 max-w-[1680px] items-center gap-4 px-3 sm:px-5 lg:px-8 2xl:px-10">
              <Brand />

              <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Main navigation">
                <NewPublicDesktopNavigation
                  pathname={pathname}
                  publicArea={publicArea}
                  globalAreas={globalAreas}
                  access={access}
                  email={email}
                  visibleAccountEmail={visibleAccountEmail}
                  signOut={signOut}
                />
              </nav>

              <SheetTrigger asChild>
                <button
                  type="button"
                  className="ml-auto grid h-11 w-11 place-items-center rounded-xl border border-border/75 bg-surface/70 transition-[background-color,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:active:scale-100 lg:hidden"
                  aria-label="Open navigation"
                  aria-expanded={menuOpen}
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
            </div>
          </header>
        ) : null}

        {isAppMode ? (
          <SolarisDraggableSheetContent
            aria-label="More Solaris Studio options"
            className="solaris-app-more-sheet !inset-x-2 !bottom-0 !max-h-[92dvh] !gap-0 !overflow-hidden !rounded-t-[1.55rem] !border !border-b-0"
          >
            <AppMoreNavigation
              signedIn={Boolean(access.userId)}
              access={access}
              onSignOut={() => void signOut()}
            />
          </SolarisDraggableSheetContent>
        ) : (
          <SheetContent
            side="right"
            showCloseButton={false}
            aria-label="Navigation menu"
            className="public-drawer !inset-y-0 !left-auto !right-0 !h-dvh !w-[min(90vw,360px)] !max-w-none !gap-0 !overflow-hidden !rounded-none !border-l !border-t-0 !bg-background/96 !p-0"
          >
            <div
              className="flex items-center justify-between border-b border-border p-4"
              style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
            >
              <Brand compact />
              <SheetClose asChild>
                <button
                  type="button"
                  className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface transition-[background-color,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:active:scale-100"
                  aria-label="Close navigation"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </SheetClose>
            </div>

            <nav className="scroll-slim flex-1 overflow-y-auto overscroll-contain p-3" aria-label="Mobile navigation">
              <PublicDrawerNavigation pathname={pathname} user={publicUser} />
            </nav>

            <div
              className="border-t border-border p-4"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
            >
              {email ? (
                <div className="space-y-3">
                  <p className="truncate text-[11px] text-muted-foreground">
                    {visibleAccountEmail ?? "Country account"}
                  </p>
                  <button
                    type="button"
                    onClick={signOut}
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold transition-[background-color,transform] duration-150 ease-out active:scale-[0.98] motion-reduce:active:scale-100"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <SheetClose asChild>
                  <Link
                    to="/auth"
                    className="bg-aurora flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold text-primary-foreground"
                  >
                    Sign in to Solaris
                  </Link>
                </SheetClose>
              )}
            </div>
          </SheetContent>
        )}

        <main
          data-public-layout={publicLayout}
          data-solaris-app-mode={isAppMode ? "true" : undefined}
          data-solaris-app-root={isAppMode && isAppRootDestination ? "true" : undefined}
          data-solaris-screen-id={isAppMode ? appScreen.id : undefined}
          data-solaris-app-screen={isAppMode ? appChrome.archetype : undefined}
          data-solaris-app-root-tab={isAppMode ? appScreen.hierarchy.rootTab ?? "none" : undefined}
          data-solaris-app-toolbar={isAppMode ? appScreen.chrome.toolbar : undefined}
          data-solaris-app-tabbar={isAppMode ? appChrome.tabBar : undefined}
          data-solaris-app-search={isAppMode ? appScreen.chrome.search : undefined}
          data-solaris-app-offline={isAppMode ? appScreen.behavior.offline : undefined}
          data-solaris-app-critical-task={isAppMode && appScreen.behavior.criticalTask ? "true" : undefined}
          className={cn(
            "app-main relative z-10 mx-auto w-full min-w-0 px-3 pb-24 pt-4 sm:px-5 sm:pb-24 sm:pt-6 lg:px-8 lg:py-8 2xl:px-10",
            publicCanvasForArchetype(publicArchetype),
          )}
        >
          {isAppMode ? (
            <>
              {showHomeAnniversaryTakeover && (
                <Suspense fallback={null}>
                  <LazyHomeAnniversaryTakeover />
                </Suspense>
              )}
              {isMySolarisWorkspace ? (
                <MySolarisWorkspaceShell>{children}</MySolarisWorkspaceShell>
              ) : (
                <AppAdaptiveWorkspace pathname={pathname} searchStr={searchStr}>
                  {children}
                  {isEditionPage && (
                    <Suspense fallback={null}>
                      <LazyEditionHostingExtension pathname={pathname} />
                    </Suspense>
                  )}
                </AppAdaptiveWorkspace>
              )}
            </>
          ) : isMySolarisWorkspace ? (
            <MySolarisWorkspaceShell>{children}</MySolarisWorkspaceShell>
          ) : showSectionNavigation ? (
            <div className="public-site-layout">
              <PublicSectionNav
                pathname={pathname}
                collapsible={publicArchetype === "data-explorer"}
              />
              <div className="public-site-content min-w-0">
                <PublicMobileSectionNav pathname={pathname} />
                {showHomeAnniversaryTakeover && (
                  <Suspense fallback={null}>
                    <LazyHomeAnniversaryTakeover />
                  </Suspense>
                )}
                <PublicBreadcrumbs pathname={pathname} />
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
              {showHomeAnniversaryTakeover && (
                <Suspense fallback={null}>
                  <LazyHomeAnniversaryTakeover />
                </Suspense>
              )}
              <PublicBreadcrumbs pathname={pathname} />
              {children}
              {isEditionPage && (
                <Suspense fallback={null}>
                  <LazyEditionHostingExtension pathname={pathname} />
                </Suspense>
              )}
            </>
          )}

          {isAppMode && appChrome.tabBar !== "hidden" ? (
            <div
              className="solaris-app-bottom-spacer"
              aria-hidden="true"
              data-solaris-app-bottom-spacer=""
            />
          ) : null}
        </main>

        {!isAppMode && !isMySolarisWorkspace && !focusedParticipationTask ? (
          <PublicFooter />
        ) : null}

        {isAppMode && appChrome.tabBar !== "hidden" ? (
          <AppTabBar
            pathname={pathname}
            searchStr={searchStr}
            signedIn={Boolean(access.userId)}
            participateBadge={attention.participate}
            meBadge={attention.me}
          />
        ) : null}

        {!isAppMode && !isMySolarisWorkspace && (
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
                    onClick={() =>
                      trackPublicUxEvent("public_nav_clicked", {
                        target: item.to,
                        metadata: {
                          area:
                            globalAreas.find((area) => area.to === item.to)?.id ??
                            (item.to === "/auth" ? "me" : "unknown"),
                          source: "mobile_bottom",
                        },
                      })
                    }
                    className={cn(
                      "flex min-h-13 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold transition-colors",
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
        )}
      </div>
    </Sheet>
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

function NewPublicDesktopNavigation({
  pathname,
  publicArea,
  globalAreas,
  access,
  email,
  visibleAccountEmail,
  signOut,
}: {
  pathname: string;
  publicArea: ReturnType<typeof publicAreaForPath>;
  globalAreas: ReturnType<typeof publicGlobalAreasForContext>;
  access: AccountAccess;
  email: string | null;
  visibleAccountEmail: string | null;
  signOut: () => Promise<void>;
}) {
  return (
    <>
      {globalAreas.map((item) => (
        <Link
          key={item.id}
          to={item.to as any}
          aria-current={publicArea === item.id ? "page" : undefined}
          onClick={() =>
            trackPublicUxEvent("public_nav_clicked", {
              target: item.to,
              metadata: { area: item.id, source: "desktop" },
            })
          }
          className={desktopNavClass(publicArea === item.id)}
        >
          {item.label}
        </Link>
      ))}

      <span aria-hidden="true" className="mx-1 h-6 w-px bg-border/70" />

      <PublicCommandPalette access={access} />

      <Link
        to="/guide"
        className={desktopNavClass(
          pathname.startsWith("/guide") ||
            pathname.startsWith("/rules") ||
            pathname.startsWith("/integrity"),
        )}
      >
        Help
      </Link>

      {access.isOrganizer ? (
        <Link
          to="/admin/operations"
          className="ml-1 rounded-xl border border-border/75 bg-surface/55 px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-surface-strong"
        >
          Organizer
        </Link>
      ) : null}

      {email ? (
        <details key={"account-" + pathname} className="group relative ml-1">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground [&::-webkit-details-marker]:hidden">
            Account
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="nav-menu-panel absolute right-0 top-[calc(100%+.6rem)] w-64 overflow-hidden rounded-2xl border border-border/70 p-2 shadow-2xl">
            <div className="border-b border-border/55 px-3 py-2.5">
              <p className="truncate text-xs font-semibold text-foreground">MySolaris</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {visibleAccountEmail ?? "Country account"}
              </p>
            </div>
            <Link to="/my-solaris" className="nav-menu-item mt-1">
              <span className="font-semibold">Open MySolaris</span>
              <span className="text-[11px] text-muted-foreground">
                Dashboard, participation
                {access.countryId ? " & country tools" : " & country setup"}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="mt-1 flex min-h-11 w-full items-center rounded-xl px-3 text-left text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </details>
      ) : null}
    </>
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
  const { isAppMode } = useSolarisApp();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const visibleEyebrow = productEyebrow(eyebrow);
  const chrome = resolveAppRouteChrome(pathname, searchStr);
  const toolbarOwnsIdentity =
    isAppMode &&
    ["root", "directory", "workspace", "settings", "task"].includes(chrome.archetype);

  if (toolbarOwnsIdentity) {
    if (!description && !actions) return null;
    return (
      <header className={cn("solaris-app-page-context mb-4 min-w-0", className)}>
        {description ? (
          <p className="text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
        {actions ? (
          <div className="mt-3 flex min-w-0 flex-wrap gap-2">{actions}</div>
        ) : null}
      </header>
    );
  }

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
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.18em] text-primary">
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
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="numeric mt-1 break-words text-2xl font-semibold leading-none sm:text-3xl">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}
