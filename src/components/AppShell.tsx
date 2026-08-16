import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { CountryProfileExtension } from "@/components/CountryProfileExtension";
import { EditionHostingExtension } from "@/components/EditionHostingExtension";
import { HomeAnniversaryTakeover } from "@/components/HomeAnniversaryTakeover";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAccountAccess, type AccountAccess } from "@/lib/country-account";
import { cn } from "@/lib/utils";

const MAIN_NAV = [
  { to: "/", label: "Home" },
  { to: "/editions", label: "Editions" },
  { to: "/countries", label: "Countries" },
  { to: "/participate", label: "Participate" },
  { to: "/analysis", label: "Analysis" },
  { to: "/tools", label: "Tools" },
] as const;

const MORE_NAV = [
  { to: "/pulse", label: "Pulse" },
  { to: "/predictions", label: "Predictions" },
  { to: "/records", label: "Records" },
] as const;

const TOOL_ROUTES = [
  "/result-lab",
  "/taste-dna",
  "/broadcast-intelligence",
  "/archive-games",
  "/relationships",
  "/compare",
] as const;

function routeActive(pathname: string, to: string) {
  if (to === "/tools" && TOOL_ROUTES.some((route) => pathname.startsWith(route))) return true;
  if (to === "/participate" && (pathname.startsWith("/confirmations") || pathname.startsWith("/televoting"))) return true;
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
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
   * Admin routes already live inside src/components/admin/AdminShell.tsx via
   * the /_authenticated/admin route layout. AppShell is intentionally a
   * pass-through here so an admin page cannot accidentally render a second
   * navigation shell inside the real Control Room.
   */
  if (pathname.startsWith("/admin")) {
    return <>{children}</>;
  }

  const roleItems = useMemo(() => {
    const items: Array<{ to: string; label: string }> = [];

    if (access.isOrganizer) {
      items.push({ to: "/admin/control-room", label: "Control Room" });
    }

    if (access.countryId) {
      items.push({ to: "/country-hub", label: "My Country" });
    } else if (email) {
      items.push({
        to: "/country-hub",
        label: access.isOrganizer ? "Claim Country" : "Country Setup",
      });
    }

    return items;
  }, [access.isOrganizer, access.countryId, email]);

  const navigation = useMemo(
    () => [...MAIN_NAV, ...roleItems, ...MORE_NAV],
    [roleItems],
  );

  const quickNavigation = useMemo(
    () => [
      { to: "/", label: "Home" },
      { to: "/editions", label: "Editions" },
      { to: "/participate", label: "Participate" },
      roleItems[0] ?? { to: "/tools", label: "Tools" },
    ],
    [roleItems],
  );

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const isCountryPage = /^\/countries\/[^/]+\/?$/i.test(pathname);
  const isEditionPage = /^\/editions\/[^/]+\/?$/i.test(pathname);
  const isHomePage = pathname === "/";

  return (
    <div className="relative isolate min-h-screen overflow-x-clip">
      <div aria-hidden="true" className="app-background" />

      <header className="site-nav sticky top-0 z-40 border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-4 px-3 sm:px-5 lg:px-6">
          <Brand />

          <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            {navigation.map((item) => {
              const active = routeActive(pathname, item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-surface-strong text-foreground"
                      : "text-muted-foreground hover:bg-surface hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}

            {email ? (
              <>
                <Link
                  to="/me"
                  className="ml-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  My Solaris
                </Link>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className="bg-aurora ml-2 rounded-lg px-3 py-2 text-sm font-semibold text-primary-foreground"
              >
                Sign in
              </Link>
            )}
          </nav>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="ml-auto grid h-11 w-11 place-items-center rounded-lg border border-border bg-surface lg:hidden"
            aria-label="Open navigation"
            aria-expanded={menuOpen}
          >
            ☰
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />

          <aside
            className="absolute bottom-0 right-0 top-0 flex w-[min(86vw,340px)] flex-col border-l border-border bg-background/88 backdrop-blur-2xl"
            aria-label="Navigation menu"
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <Brand compact />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface"
                aria-label="Close navigation"
              >
                ✕
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3" aria-label="Mobile navigation">
              {navigation.map((item) => {
                const active = routeActive(pathname, item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "mb-1 flex min-h-12 items-center rounded-lg px-3 text-sm font-medium",
                      active
                        ? "bg-surface-strong text-foreground"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-border p-4">
              {email ? (
                <div className="space-y-3">
                  <p className="truncate text-xs text-muted-foreground">{email}</p>
                  {roleItems.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm"
                    >
                      {item.label}
                    </Link>
                  ))}
                  <Link
                    to="/me"
                    className="flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm"
                  >
                    My Solaris
                  </Link>
                  <button
                    type="button"
                    onClick={signOut}
                    className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  to="/auth"
                  className="bg-aurora flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold text-primary-foreground"
                >
                  Sign in
                </Link>
              )}
            </div>
          </aside>
        </div>
      )}

      <main className="app-main relative z-10 mx-auto min-w-0 max-w-[1280px] px-3 py-4 sm:px-5 sm:py-6 lg:px-6 lg:py-7">
        {isHomePage && <HomeAnniversaryTakeover />}
        {children}
        {isEditionPage && <EditionHostingExtension pathname={pathname} />}
        {isCountryPage && <CountryProfileExtension pathname={pathname} />}
      </main>

      <nav
        className="mobile-quick-nav fixed inset-x-0 bottom-0 z-50 border-t border-border/70 px-2 pt-2 lg:hidden"
        style={{ paddingBottom: "max(.45rem, env(safe-area-inset-bottom))" }}
        aria-label="Quick navigation"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          {quickNavigation.map((item) => {
            const active = routeActive(pathname, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center justify-center rounded-lg px-1 text-[11px] font-medium",
                  active ? "bg-surface-strong text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
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
    <header className="page-header mb-5 min-w-0 border-b border-border/60 pb-4 sm:mb-6 sm:pb-5">
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
            <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}
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
            "flex min-w-0 items-start justify-between gap-3",
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
          {actions && <div className="shrink-0">{actions}</div>}
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
