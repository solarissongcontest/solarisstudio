import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Command,
  ExternalLink,
  Flag,
  Home,
  LayoutDashboard,
  Menu,
  RadioTower,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  X,
} from "lucide-react";

import { CountryProfileExtension } from "@/components/CountryProfileExtension";
import { EditionHostingExtension } from "@/components/EditionHostingExtension";
import { HomeAnniversaryTakeover } from "@/components/HomeAnniversaryTakeover";
import { supabase } from "@/integrations/supabase/client";
import {
  getCurrentAccountAccess,
  type AccountAccess,
} from "@/lib/country-account";
import {
  editionLabel,
  useAllShows,
  useEditions,
} from "@/lib/data";
import { cn } from "@/lib/utils";

const MAIN_NAV = [
  { to: "/", label: "Home" },
  { to: "/editions", label: "Editions" },
  { to: "/countries", label: "Countries" },
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

function routeActive(
  pathname: string,
  to: string,
) {
  if (
    to === "/tools" &&
    TOOL_ROUTES.some((route) =>
      pathname.startsWith(route),
    )
  ) {
    return true;
  }

  return to === "/"
    ? pathname === "/"
    : pathname.startsWith(to);
}

function productEyebrow(
  eyebrow?: string,
) {
  return eyebrow?.replace(
    /^Phase\s+\d+\s*[·:—-]\s*/i,
    "",
  );
}

const EMPTY_ACCESS: AccountAccess = {
  userId: null,
  isOrganizer: false,
  countryId: null,
  countryStatus: null,
  suspensionReason: null,
  schemaReady: true,
};

export function AppShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname =
    useRouterState({
      select:
        (state) =>
          state.location.pathname,
    });

  const [email, setEmail] =
    useState<string | null>(
      null,
    );

  const [
    access,
    setAccess,
  ] =
    useState<AccountAccess>(
      EMPTY_ACCESS,
    );

  const [
    menuOpen,
    setMenuOpen,
  ] =
    useState(false);

  useEffect(() => {
    let alive = true;

    const refresh =
      async (
        userId?:
          | string
          | null,
        userEmail?:
          | string
          | null,
      ) => {
        if (!alive) {
          return;
        }

        setEmail(
          userEmail ??
            null,
        );

        if (!userId) {
          setAccess(
            EMPTY_ACCESS,
          );
          return;
        }

        const next =
          await getCurrentAccountAccess(
            userId,
          );

        if (alive) {
          setAccess(next);
        }
      };

    void supabase.auth
      .getUser()
      .then(
        ({ data }) =>
          refresh(
            data.user?.id ??
              null,
            data.user
              ?.email ??
              null,
          ),
      );

    const {
      data:
        subscription,
    } =
      supabase.auth.onAuthStateChange(
        (
          _event,
          session,
        ) => {
          window.setTimeout(
            () =>
              void refresh(
                session
                  ?.user
                  ?.id ??
                  null,
                session
                  ?.user
                  ?.email ??
                  null,
              ),
            0,
          );
        },
      );

    return () => {
      alive = false;

      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(
    () =>
      setMenuOpen(false),
    [pathname],
  );

  useEffect(() => {
    if (
      pathname !==
        "/" &&
      !pathname.startsWith(
        "/pulse",
      ) &&
      !pathname.startsWith(
        "/auth",
      ) &&
      !pathname.startsWith(
        "/me",
      ) &&
      !pathname.startsWith(
        "/admin",
      ) &&
      !pathname.startsWith(
        "/country-hub",
      )
    ) {
      window.localStorage.setItem(
        "solaris:last-meaningful-route",
        pathname,
      );
    }
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const previous =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previous;
    };
  }, [menuOpen]);

  const roleItems =
    useMemo(() => {
      const items: Array<{
        to: string;
        label: string;
      }> = [];

      if (
        access.isOrganizer
      ) {
        items.push({
          to: "/admin/control-room",
          label:
            "Control Room",
        });
      }

      if (
        access.countryId
      ) {
        items.push({
          to: "/country-hub",
          label: "My Country",
        });
      } else if (
        email
      ) {
        items.push({
          to: "/country-hub",
          label:
            access.isOrganizer
              ? "Claim Country"
              : "Country Setup",
        });
      }

      return items;
    }, [
      access.isOrganizer,
      access.countryId,
      email,
    ]);

  const navigation =
    useMemo(
      () => [
        ...MAIN_NAV,
        ...roleItems,
        ...MORE_NAV,
      ],
      [roleItems],
    );

  const quickNavigation =
    useMemo(
      () => [
        {
          to: "/",
          label: "Home",
        },
        {
          to: "/editions",
          label:
            "Editions",
        },
        {
          to: "/countries",
          label:
            "Countries",
        },
        roleItems[0] ?? {
          to: "/tools",
          label: "Tools",
        },
      ],
      [roleItems],
    );

  const signOut =
    async () => {
      await supabase.auth.signOut();

      window.location.href =
        "/";
    };

  /*
   * ADMIN HAS ITS OWN
   * CONTROL-ROOM SHELL.
   */
  if (
    pathname.startsWith(
      "/admin",
    )
  ) {
    return (
      <AdminControlRoomShell
        pathname={
          pathname
        }
        email={email}
        onSignOut={
          signOut
        }
      >
        {children}
      </AdminControlRoomShell>
    );
  }

  const isCountryPage =
    /^\/countries\/[^/]+\/?$/i.test(
      pathname,
    );

  const isEditionPage =
    /^\/editions\/[^/]+\/?$/i.test(
      pathname,
    );

  const isHomePage =
    pathname === "/";

  return (
    <div className="relative isolate min-h-screen overflow-x-clip">
      <div
        aria-hidden="true"
        className="app-background"
      />

      <header className="site-nav sticky top-0 z-40 border-b border-border/60">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-4 px-3 sm:px-5 lg:px-6">
          <Brand />

          <nav
            className="ml-auto hidden items-center gap-1 lg:flex"
            aria-label="Main navigation"
          >
            {navigation.map(
              (item) => {
                const active =
                  routeActive(
                    pathname,
                    item.to,
                  );

                return (
                  <Link
                    key={
                      item.to
                    }
                    to={
                      item.to
                    }
                    aria-current={
                      active
                        ? "page"
                        : undefined
                    }
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-surface-strong text-foreground"
                        : "text-muted-foreground hover:bg-surface hover:text-foreground",
                    )}
                  >
                    {
                      item.label
                    }
                  </Link>
                );
              },
            )}

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
                  onClick={
                    signOut
                  }
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
            onClick={() =>
              setMenuOpen(
                true,
              )
            }
            className="ml-auto grid h-11 w-11 place-items-center rounded-lg border border-border bg-surface lg:hidden"
            aria-label="Open navigation"
            aria-expanded={
              menuOpen
            }
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
            onClick={() =>
              setMenuOpen(
                false,
              )
            }
          />

          <aside
            className="absolute bottom-0 right-0 top-0 flex w-[min(86vw,340px)] flex-col border-l border-border bg-background/88 backdrop-blur-2xl"
            aria-label="Navigation menu"
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <Brand
                compact
              />

              <button
                type="button"
                onClick={() =>
                  setMenuOpen(
                    false,
                  )
                }
                className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-surface"
                aria-label="Close navigation"
              >
                ✕
              </button>
            </div>

            <nav
              className="flex-1 overflow-y-auto p-3"
              aria-label="Mobile navigation"
            >
              {navigation.map(
                (item) => {
                  const active =
                    routeActive(
                      pathname,
                      item.to,
                    );

                  return (
                    <Link
                      key={
                        item.to
                      }
                      to={
                        item.to
                      }
                      aria-current={
                        active
                          ? "page"
                          : undefined
                      }
                      className={cn(
                        "mb-1 flex min-h-12 items-center rounded-lg px-3 text-sm font-medium",
                        active
                          ? "bg-surface-strong text-foreground"
                          : "text-muted-foreground hover:bg-surface hover:text-foreground",
                      )}
                    >
                      {
                        item.label
                      }
                    </Link>
                  );
                },
              )}
            </nav>

            <div className="border-t border-border p-4">
              {email ? (
                <div className="space-y-3">
                  <p className="truncate text-xs text-muted-foreground">
                    {email}
                  </p>

                  {roleItems.map(
                    (item) => (
                      <Link
                        key={
                          item.to
                        }
                        to={
                          item.to
                        }
                        className="flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm"
                      >
                        {
                          item.label
                        }
                      </Link>
                    ),
                  )}

                  <Link
                    to="/me"
                    className="flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-surface px-3 text-sm"
                  >
                    My Solaris
                  </Link>

                  <button
                    type="button"
                    onClick={
                      signOut
                    }
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
        {isHomePage && (
          <HomeAnniversaryTakeover />
        )}

        {children}

        {isEditionPage && (
          <EditionHostingExtension
            pathname={
              pathname
            }
          />
        )}

        {isCountryPage && (
          <CountryProfileExtension
            pathname={
              pathname
            }
          />
        )}
      </main>

      <nav
        className="mobile-quick-nav fixed inset-x-0 bottom-0 z-50 border-t border-border/70 px-2 pt-2 lg:hidden"
        style={{
          paddingBottom:
            "max(.45rem, env(safe-area-inset-bottom))",
        }}
        aria-label="Quick navigation"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          {quickNavigation.map(
            (item) => {
              const active =
                routeActive(
                  pathname,
                  item.to,
                );

              return (
                <Link
                  key={
                    item.to
                  }
                  to={
                    item.to
                  }
                  aria-current={
                    active
                      ? "page"
                      : undefined
                  }
                  className={cn(
                    "flex min-h-12 items-center justify-center rounded-lg px-1 text-[11px] font-medium",
                    active
                      ? "bg-surface-strong text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {
                    item.label
                  }
                </Link>
              );
            },
          )}
        </div>
      </nav>
    </div>
  );
}

type AdminNavItem = {
  label: string;
  href: string;
  icon: typeof Home;
  active?: (
    pathname: string,
  ) => boolean;
};

function AdminControlRoomShell({
  pathname,
  email,
  onSignOut,
  children,
}: {
  pathname: string;
  email: string | null;
  onSignOut: () => Promise<void>;
  children: ReactNode;
}) {
  const {
    data: editions,
  } =
    useEditions();

  const {
    data: shows,
  } =
    useAllShows();

  const [
    collapsed,
    setCollapsed,
  ] =
    useState(false);

  const [
    mobileOpen,
    setMobileOpen,
  ] =
    useState(false);

  const [
    commandOpen,
    setCommandOpen,
  ] =
    useState(false);

  const [
    commandQuery,
    setCommandQuery,
  ] =
    useState("");

  const latestEdition =
    useMemo(
      () =>
        [
          ...(editions ??
            []),
        ].sort(
          (a, b) =>
            (b.edition_number ??
              -1) -
            (a.edition_number ??
              -1),
        )[0] ?? null,
      [editions],
    );

  const pathSlug =
    pathname.match(
      /^\/admin\/(ssc-[^/]+)$/,
    )?.[1] ?? null;

  const storedSlug =
    typeof window !==
    "undefined"
      ? window.localStorage.getItem(
          "solaris:admin:edition",
        )
      : null;

  const activeEdition =
    (
      editions ?? []
    ).find(
      (edition) =>
        edition.slug ===
        pathSlug,
    ) ??
    (
      editions ?? []
    ).find(
      (edition) =>
        edition.slug ===
        storedSlug,
    ) ??
    latestEdition;

  const editionShows =
    (
      shows ?? []
    )
      .filter(
        (show) =>
          show.edition_id ===
          activeEdition?.id,
      )
      .sort(
        (a, b) =>
          a.sort_order -
          b.sort_order,
      );

  const [
    showId,
    setShowId,
  ] =
    useState("");

  useEffect(() => {
    setCollapsed(
      window.localStorage.getItem(
        "solaris:admin:sidebar-collapsed",
      ) === "1",
   
