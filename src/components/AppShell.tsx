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
    );

    setShowId(
      window.localStorage.getItem(
        "solaris:admin:show",
      ) ?? "",
    );
  }, []);

  useEffect(() => {
    if (
      activeEdition?.slug
    ) {
      window.localStorage.setItem(
        "solaris:admin:edition",
        activeEdition.slug,
      );
    }
  }, [
    activeEdition?.slug,
  ]);

  useEffect(() => {
    const onKeyDown =
      (
        event: KeyboardEvent,
      ) => {
        if (
          (
            event.metaKey ||
            event.ctrlKey
          ) &&
          event.key.toLowerCase() ===
            "k"
        ) {
          event.preventDefault();

          setCommandOpen(
            (value) =>
              !value,
          );
        }

        if (
          event.key ===
          "Escape"
        ) {
          setCommandOpen(
            false,
          );
          setMobileOpen(
            false,
          );
        }
      };

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    return () =>
      window.removeEventListener(
        "keydown",
        onKeyDown,
      );
  }, []);

  const editionHref =
    activeEdition
      ? `/admin/${activeEdition.slug}`
      : "/admin";

  const navSections: Array<{
    label: string;
    items: AdminNavItem[];
  }> = [
    {
      label: "Overview",
      items: [
        {
          label:
            "Dashboard",
          href: "/admin/control-room",
          icon: LayoutDashboard,
        },
        {
          label:
            "Action Centre",
          href: "/admin/action-centre",
          icon: Bell,
        },
        {
          label:
            "Manage editions",
          href: "/admin",
          icon: Trophy,
          active: (
            path,
          ) =>
            path ===
              "/admin" ||
            path ===
              "/admin/",
        },
        {
          label:
            "Current edition",
          href: editionHref,
          icon: RadioTower,
          active: (
            path,
          ) =>
            !!activeEdition &&
            path ===
              `/admin/${activeEdition.slug}`,
        },
      ],
    },
    {
      label:
        "Contest operations",
      items: [
        {
          label:
            "Hosting",
          href: "/admin/hosts",
          icon: Flag,
        },
        {
          label:
            "Predictions",
          href: "/admin/predictions",
          icon: Sparkles,
        },
      ],
    },
    {
      label:
        "Terra Solaris",
      items: [
        {
          label:
            "Country accounts",
          href: "/admin/country-accounts",
          icon: Users,
        },
        {
          label:
            "Countries",
          href: "/countries",
          icon: BookOpen,
        },
      ],
    },
    {
      label: "System",
      items: [
        {
          label:
            "Deadlines & audit",
          href: "/admin/system",
          icon: Settings,
        },
      ],
    },
  ];

  const commands = [
    ...navSections.flatMap(
      (section) =>
        section.items.map(
          (item) => ({
            ...item,
            group:
              section.label,
          }),
        ),
    ),
    ...(
      editions ?? []
    ).map(
      (edition) => ({
        label:
          `${editionLabel(
            edition,
          )} · ${edition.name}`,
        href:
          `/admin/${edition.slug}`,
        icon: Trophy,
        group: "Editions",
      }),
    ),
    {
      label:
        "View public homepage",
      href: "/",
      icon: ExternalLink,
      group:
        "Public site",
    },
  ];

  const filteredCommands =
    commands.filter(
      (item) =>
        item.label
          .toLowerCase()
          .includes(
            commandQuery
              .trim()
              .toLowerCase(),
          ),
    );

  const navigate =
    (href: string) => {
      setCommandOpen(
        false,
      );

      setMobileOpen(
        false,
      );

      window.location.href =
        href;
    };

  const sidebar = (
    <div className="flex h-full flex-col bg-[#050914]">
      <div className="flex h-16 items-center gap-3 border-b border-white/8 px-3">
        <img
          src="/IMG_9177.png"
          alt=""
          className="h-9 w-9 shrink-0 object-contain"
        />

        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-black tracking-[-0.02em] text-white">
              Solaris
              Control Room
            </p>

            <p className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-white/35">
              Organizer
              workspace
            </p>
          </div>
        )}
      </div>

      <div className="border-b border-white/8 p-3">
        {!collapsed ? (
          <div className="space-y-2">
            <label className="block text-[9px] font-black uppercase tracking-[0.16em] text-white/35">
              Edition
            </label>

            <select
              value={
                activeEdition?.slug ??
                ""
              }
              onChange={(
                event,
              ) =>
                navigate(
                  `/admin/${event.target.value}`,
                )
              }
              className="min-h-10 w-full rounded-lg border border-white/10 bg-white/[0.055] px-2.5 text-xs font-semibold text-white outline-none"
            >
              {(
                editions ??
                []
              ).map(
                (
                  edition,
                ) => (
                  <option
                    key={
                      edition.id
                    }
                    value={
                      edition.slug
                    }
                    className="bg-[#091020]"
                  >
                    {editionLabel(
                      edition,
                    )}
                  </option>
                ),
              )}
            </select>

            <label className="block text-[9px] font-black uppercase tracking-[0.16em] text-white/35">
              Show
              context
            </label>

            <select
              value={
                showId
              }
              onChange={(
                event,
              ) => {
                setShowId(
                  event
                    .target
                    .value,
                );

                window.localStorage.setItem(
                  "solaris:admin:show",
                  event
                    .target
                    .value,
                );
              }}
              className="min-h-10 w-full rounded-lg border border-white/10 bg-white/[0.055] px-2.5 text-xs font-semibold text-white outline-none"
            >
              <option
                value=""
                className="bg-[#091020]"
              >
                All shows
              </option>

              {editionShows.map(
                (show) => (
                  <option
                    key={
                      show.id
                    }
                    value={
                      show.id
                    }
                    className="bg-[#091020]"
                  >
                    {
                      show.name
                    }
                  </option>
                ),
              )}
            </select>
          </div>
        ) : (
          <div className="grid h-10 place-items-center rounded-lg bg-primary/10 text-xs font-black text-primary">
            {activeEdition?.edition_number ??
              "—"}
          </div>
        )}
      </div>

      <nav
        className="flex-1 overflow-y-auto p-2.5"
        aria-label="Organizer navigation"
      >
        {navSections.map(
          (section) => (
            <div
              key={
                section.label
              }
              className="mb-5"
            >
              {!collapsed && (
                <p className="mb-1.5 px-2 text-[9px] font-black uppercase tracking-[0.18em] text-white/25">
                  {
                    section.label
                  }
                </p>
              )}

              <div className="space-y-1">
                {section.items.map(
                  (
                    item,
                  ) => {
                    const Icon =
                      item.icon;

                    const active =
                      item.active
                        ? item.active(
                            pathname,
                          )
                        : pathname.startsWith(
                            item.href,
                          );

                    return (
                      <button
                        key={`${section.label}-${item.label}`}
                        type="button"
                        onClick={() =>
                          navigate(
                            item.href,
                          )
                        }
                        title={
                          collapsed
                            ? item.label
                            : undefined
                        }
                        className={cn(
                          "flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-xs font-semibold transition-colors",
                          active
                            ? "bg-primary/14 text-primary"
                            : "text-white/55 hover:bg-white/[0.055] hover:text-white",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />

                        {!collapsed && (
                          <span className="truncate">
                            {
                              item.label
                            }
                          </span>
                        )}
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          ),
        )}
      </nav>

      <div className="space-y-1 border-t border-white/8 p-2.5">
        <button
          type="button"
          onClick={() =>
            setCommandOpen(
              true,
            )
          }
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-xs font-semibold text-white/55 hover:bg-white/[0.055] hover:text-white"
        >
          <Command className="h-4 w-4 shrink-0" />

          {!collapsed && (
            <>
              <span className="flex-1 text-left">
                Command
                palette
              </span>

              <kbd className="rounded bg-white/8 px-1.5 py-0.5 text-[9px] text-white/35">
                ⌘K
              </kbd>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() =>
            navigate("/")
          }
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-xs font-semibold text-white/55 hover:bg-white/[0.055] hover:text-white"
        >
          <ExternalLink className="h-4 w-4 shrink-0" />

          {!collapsed && (
            <span>
              View public
              site
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            const next =
              !collapsed;

            setCollapsed(
              next,
            );

            window.localStorage.setItem(
              "solaris:admin:sidebar-collapsed",
              next
                ? "1"
                : "0",
            );
          }}
          className="hidden min-h-10 w-full items-center gap-3 rounded-lg px-2.5 text-xs font-semibold text-white/45 hover:bg-white/[0.055] hover:text-white lg:flex"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}

          {!collapsed && (
            <span>
              Collapse
              sidebar
            </span>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#070b14] text-foreground">
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 hidden border-r border-white/8 lg:block",
          collapsed
            ? "w-[68px]"
            : "w-[238px]",
        )}
      >
        {sidebar}
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close organizer navigation"
            onClick={() =>
              setMobileOpen(
                false,
              )
            }
          />

          <div className="absolute inset-y-0 left-0 w-[min(86vw,310px)] border-r border-white/10">
            {sidebar}
          </div>
        </div>
      )}

      <div
        className={cn(
          "min-h-screen transition-[padding]",
          collapsed
            ? "lg:pl-[68px]"
            : "lg:pl-[238px]",
        )}
      >
        <header className="sticky top-0 z-40 border-b border-white/8 bg-[#070b14]/92 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-3 sm:px-5">
            <button
              type="button"
              onClick={() =>
                setMobileOpen(
                  true,
                )
              }
              className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04] lg:hidden"
              aria-label="Open organizer navigation"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />

                <p className="truncate text-xs font-black uppercase tracking-[0.16em] text-white/48">
                  Control
                  Room
                </p>
              </div>

              <p className="mt-0.5 truncate text-sm font-semibold text-white">
                {activeEdition
                  ? `${editionLabel(
                      activeEdition,
                    )} · ${activeEdition.name}`
                  : "Organizer dashboard"}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setCommandOpen(
                  true,
                )
              }
              className="hidden min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs text-white/55 hover:text-white sm:flex"
            >
              <Search className="h-3.5 w-3.5" />
              Search

              <kbd className="ml-2 rounded bg-white/8 px-1.5 py-0.5 text-[9px]">
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/admin/action-centre",
                )
              }
              className="relative grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/[0.04]"
              title="Operational notifications"
            >
              <Bell className="h-4 w-4" />
            </button>

            <div className="hidden text-right md:block">
              <p className="max-w-48 truncate text-xs font-semibold text-white/70">
                {email ??
                  "Organizer"}
              </p>

              <button
                type="button"
                onClick={() =>
                  void onSignOut()
                }
                className="text-[10px] text-white/35 hover:text-white/70"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="min-w-0 px-3 pb-24 pt-4 sm:px-5 sm:pt-5 lg:px-7 lg:pb-8 lg:pt-6">
          {children}
        </main>

        <nav
          className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#070b14]/95 px-2 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden"
          aria-label="Organizer quick navigation"
        >
          <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
            {[
              {
                label:
                  "Dashboard",
                href:
                  "/admin/control-room",
                icon:
                  LayoutDashboard,
              },
              {
                label:
                  "Contest",
                href:
                  editionHref,
                icon:
                  Trophy,
              },
              {
                label:
                  "Actions",
                href:
                  "/admin/action-centre",
                icon:
                  Bell,
              },
              {
                label:
                  "More",
                href:
                  "/admin/system",
                icon:
                  Settings,
              },
            ].map(
              (item) => {
                const Icon =
                  item.icon;

                const active =
                  pathname ===
                    item.href ||
                  (
                    item.href !==
                      "/admin" &&
                    pathname.startsWith(
                      item.href,
                    )
                  );

                return (
                  <button
                    key={
                      item.label
                    }
                    type="button"
                    onClick={() =>
                      navigate(
                        item.href,
                      )
                    }
                    className={cn(
                      "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-semibold",
                      active
                        ? "bg-primary/12 text-primary"
                        : "text-white/45",
                    )}
                  >
                    <Icon className="h-4 w-4" />

                    {
                      item.label
                    }
                  </button>
                );
              },
            )}
          </div>
        </nav>
      </div>

      {commandOpen && (
        <div
          className="fixed inset-0 z-[150] flex items-start justify-center bg-black/70 px-3 pt-[12vh] backdrop-blur-sm"
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setCommandOpen(
                false,
              );
            }
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/12 bg-[#0b1120] shadow-2xl">
            <div className="flex items-center gap-3 border-b border-white/8 px-4">
              <Search className="h-4 w-4 text-white/35" />

              <input
                autoFocus
                value={
                  commandQuery
                }
                onChange={(
                  event,
                ) =>
                  setCommandQuery(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="Search admin tools or editions…"
                className="min-h-14 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25"
              />

              <button
                type="button"
                onClick={() =>
                  setCommandOpen(
                    false,
                  )
                }
                className="grid h-8 w-8 place-items-center rounded-lg text-white/35 hover:bg-white/8 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-2">
              {filteredCommands
                .slice(
                  0,
                  18,
                )
                .map(
                  (
                    item,
                  ) => {
                    const Icon =
                      item.icon;

                    return (
                      <button
                        key={`${item.group}-${item.href}-${item.label}`}
                        type="button"
                        onClick={() =>
                          navigate(
                            item.href,
                          )
                        }
                        className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-white/[0.055]"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.055] text-primary">
                          <Icon className="h-4 w-4" />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-white/80">
                            {
                              item.label
                            }
                          </span>

                          <span className="block truncate text-[10px] uppercase tracking-[0.12em] text-white/28">
                            {
                              item.group
                            }
                          </span>
                        </span>
                      </button>
                    );
                  },
                )}

              {!filteredCommands.length && (
                <p className="p-6 text-center text-sm text-white/35">
                  No admin
                  destination
                  matches that
                  search.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Brand({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <Link
      to="/"
      className="flex min-w-0 items-center gap-3"
      aria-label="Solaris Studio home"
    >
      <div
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden rounded-full",
          compact
            ? "h-9 w-9"
            : "h-10 w-10",
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
        <span className="block truncate font-display text-sm font-semibold">
          Solaris Studio
        </span>

        <span className="hidden truncate text-[11px] text-muted-foreground sm:block">
          Terra Solaris ·
          SSC
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
  const visibleEyebrow =
    productEyebrow(
      eyebrow,
    );

  return (
    <header className="page-header mb-5 min-w-0 border-b border-border/60 pb-4 sm:mb-6 sm:pb-5">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {visibleEyebrow && (
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-primary sm:text-[11px]">
              {
                visibleEyebrow
              }
            </p>
          )}

          <h1 className="break-words font-display text-3xl font-black leading-[1.02] tracking-[-0.04em] sm:text-4xl lg:text-5xl">
            {title}
          </h1>

          {description && (
            <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {
                description
              }
            </p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

type PanelVariant =
  | "data"
  | "editorial"
  | "glass"
  | "plain";

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
        variant ===
          "data" &&
          "data-panel p-4 sm:p-5",
        variant ===
          "editorial" &&
          "editorial-section py-1",
        variant ===
          "glass" &&
          "glass p-4 sm:p-5",
        variant ===
          "plain" &&
          "py-1",
        className,
      )}
    >
      {(title ||
        actions) && (
        <div
          className={cn(
            "flex min-w-0 items-start justify-between gap-3",
            variant ===
              "editorial" ||
              variant ===
                "plain"
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
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {
                  description
                }
              </p>
            )}
          </div>

          {actions && (
            <div className="shrink-0">
              {actions}
            </div>
          )}
        </div>
      )}

      <div className="min-w-0">
        {children}
      </div>
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

      {hint && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
