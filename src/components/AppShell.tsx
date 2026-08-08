import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { to: "/", label: "Overview", short: "Home" },
  { to: "/editions", label: "Editions", short: "Editions" },
  { to: "/countries", label: "Countries", short: "Countries" },
  { to: "/admin", label: "Studio", short: "Studio" },
] as const;

const SECONDARY_NAV = [
  { to: "/relationships", label: "Relationships" },
  { to: "/compare", label: "Compare" },
  { to: "/analysis", label: "Analysis" },
  { to: "/records", label: "Records" },
] as const;

const DESKTOP_NAV = [
  { to: "/", label: "Overview" },
  { to: "/editions", label: "Editions" },
  { to: "/countries", label: "Countries" },
  { to: "/relationships", label: "Relationships" },
  { to: "/compare", label: "Compare" },
  { to: "/analysis", label: "Analysis" },
  { to: "/records", label: "Records" },
  { to: "/admin", label: "Studio" },
] as const;

function routeActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, [menuOpen]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen overflow-x-clip">
      {/* Desktop header */}
      <header className="sticky top-0 z-40 hidden border-b border-border/60 bg-background/75 backdrop-blur-xl lg:block">
        <div className="mx-auto flex max-w-[1400px] items-center gap-5 px-6 py-3">
          <Brand />

          <nav className="ml-auto flex items-center gap-1">
            {DESKTOP_NAV.map((item) => {
              const active = routeActive(pathname, item.to);

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm transition-colors",
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
              <div className="ml-2 flex items-center gap-2">
                <span
                  className="max-w-48 truncate rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground"
                  title={email}
                >
                  {email}
                </span>
                <button
                  type="button"
                  onClick={signOut}
                  className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                to="/auth"
                className="bg-aurora ml-2 rounded-lg px-3 py-1.5 text-sm font-medium text-primary-foreground"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Mobile header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-xl lg:hidden">
        <div className="flex h-16 items-center gap-3 px-3">
          <Link to="/" className="min-w-0 flex-1">
            <Brand compact />
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-lg"
            aria-label="Open navigation"
          >
            ☰
          </button>
        </div>
      </header>

      {/* Mobile menu drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
          />

          <aside className="absolute bottom-0 right-0 top-0 flex w-[min(88vw,360px)] flex-col border-l border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b border-border p-4">
              <Brand compact />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface"
                aria-label="Close navigation"
              >
                ✕
              </button>
            </div>

            <nav className="scroll-slim flex-1 overflow-y-auto p-3">
              <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Navigate
              </p>

              <div className="space-y-1">
                {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => {
                  const active = routeActive(pathname, item.to);

                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={cn(
                        "flex min-h-12 items-center rounded-xl px-3 text-sm font-medium",
                        active
                          ? "bg-surface-strong text-foreground"
                          : "text-muted-foreground hover:bg-surface hover:text-foreground",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div
              className="border-t border-border p-4"
              style={{
                paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
              }}
            >
              {email ? (
                <div className="space-y-3">
                  <p className="truncate text-xs text-muted-foreground">{email}</p>
                  <button
                    type="button"
                    onClick={signOut}
                    className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  to="/auth"
                  className="bg-aurora flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold text-primary-foreground"
                >
                  Sign in
                </Link>
              )}
            </div>
          </aside>
        </div>
      )}

      <main
        className="app-main mx-auto min-w-0 max-w-[1400px] px-3 py-5 sm:px-5 sm:py-7 lg:px-6 lg:py-8"
      >
        {children}
      </main>

      <footer className="mx-auto hidden max-w-[1400px] px-6 pb-10 pt-4 text-xs text-muted-foreground lg:block">
        Solaris Scoreboard Studio — an unofficial fan platform for the Terra Solaris universe.
      </footer>

      {/* Bottom mobile navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-background/95 px-2 pt-2 backdrop-blur-xl lg:hidden"
        style={{
          paddingBottom: "max(.45rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          {PRIMARY_NAV.map((item) => {
            const active = routeActive(pathname, item.to);

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center rounded-xl px-1 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-surface-strong text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "mb-1 h-1.5 w-1.5 rounded-full",
                    active ? "bg-primary" : "bg-transparent",
                  )}
                />
                {item.short}
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
    <span className="flex min-w-0 items-center gap-3">
      <span
        className={cn(
          "bg-aurora grid shrink-0 place-items-center rounded-xl font-display font-bold text-primary-foreground",
          compact ? "h-9 w-9 text-xs" : "h-9 w-9 text-sm",
        )}
      >
        SS
      </span>

      <span className="min-w-0 leading-tight">
        <span className="block truncate font-display text-sm font-semibold">
          Solaris Scoreboard Studio
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          Terra Solaris · SSC
        </span>
      </span>
    </span>
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
  return (
    <div className="mb-5 min-w-0 sm:mb-7 lg:mb-8">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary sm:mb-2 sm:text-xs sm:tracking-[0.2em]">
              {eyebrow}
            </p>
          )}

          <h1 className="break-words font-display text-2xl font-bold leading-tight sm:text-3xl lg:text-4xl">
            {title}
          </h1>

          {description && (
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex w-full flex-wrap gap-2 [&>*]:flex-1 sm:w-auto sm:justify-end sm:[&>*]:flex-none">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
  className,
  actions,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={cn("glass min-w-0 p-3 sm:p-4 lg:p-5", className)}>
      {(title || actions) && (
        <div className="mb-3 flex min-w-0 items-start justify-between gap-3 sm:mb-4">
          <div className="min-w-0">
            {title && (
              <h2 className="break-words font-display text-base font-semibold sm:text-lg">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
                {description}
              </p>
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
    <div className="glass min-w-0 p-3 sm:p-4">
      <p className="text-[9px] uppercase leading-tight tracking-[0.14em] text-muted-foreground sm:text-[11px] sm:tracking-widest">
        {label}
      </p>
      <p className="numeric mt-1 break-words text-lg font-semibold leading-tight sm:text-2xl">
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground sm:text-xs">
          {hint}
        </p>
      )}
    </div>
  );
}
