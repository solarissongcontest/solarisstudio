import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const MAIN_NAV = [
  { to: "/", label: "Home" },
  { to: "/editions", label: "Editions" },
  { to: "/countries", label: "Countries" },
  { to: "/analysis", label: "Analysis" },
  { to: "/admin", label: "Studio" },
] as const;

const MORE_NAV = [
  { to: "/relationships", label: "Relationships" },
  { to: "/compare", label: "Compare" },
  { to: "/records", label: "Records" },
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

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, [menuOpen]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/55 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-4 px-3 sm:px-5 lg:px-6">
          <Brand />

          <nav className="ml-auto hidden items-center gap-1 lg:flex">
            {[...MAIN_NAV, ...MORE_NAV].map((item) => {
              const active = routeActive(pathname, item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm transition-colors",
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
              <button
                type="button"
                onClick={signOut}
                className="ml-2 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Sign out
              </button>
            ) : (
              <Link
                to="/auth"
                className="bg-aurora ml-2 rounded-xl px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Sign in
              </Link>
            )}
          </nav>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="ml-auto grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface lg:hidden"
            aria-label="Open navigation"
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
          <aside className="absolute bottom-0 right-0 top-0 flex w-[min(86vw,340px)] flex-col border-l border-border bg-background/80 backdrop-blur-2xl">
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

            <nav className="flex-1 overflow-y-auto p-3">
              {[...MAIN_NAV, ...MORE_NAV].map((item) => {
                const active = routeActive(pathname, item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "mb-1 flex min-h-12 items-center rounded-xl px-3 text-sm font-medium",
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

      <main className="app-main mx-auto min-w-0 max-w-[1280px] px-3 py-5 sm:px-5 sm:py-7 lg:px-6 lg:py-8">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-background/75 px-2 pt-2 backdrop-blur-2xl lg:hidden"
        style={{ paddingBottom: "max(.45rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
          {[
            { to: "/", label: "Home" },
            { to: "/editions", label: "Editions" },
            { to: "/countries", label: "Countries" },
            { to: "/admin", label: "Studio" },
          ].map((item) => {
            const active = routeActive(pathname, item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-h-12 items-center justify-center rounded-xl px-1 text-[11px] font-medium",
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
    <Link to="/" className="flex min-w-0 items-center gap-3">
      <span
        className={cn(
          "bg-aurora grid shrink-0 place-items-center rounded-xl font-display font-bold text-primary-foreground",
          compact ? "h-9 w-9 text-xs" : "h-10 w-10 text-sm",
        )}
      >
        SS
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-display text-sm font-semibold">Solaris Studio</span>
        <span className="hidden truncate text-[11px] text-muted-foreground sm:block">Terra Solaris · SSC</span>
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
  return (
    <div className="mb-6 min-w-0 sm:mb-8">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary sm:text-xs">
              {eyebrow}
            </p>
          )}
          <h1 className="break-words font-display text-2xl font-bold leading-tight sm:text-3xl lg:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>

        {actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}
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
    <section className={cn("glass min-w-0 p-4 sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="break-words font-display text-base font-semibold sm:text-lg">{title}</h2>}
            {description && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>}
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
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="numeric mt-1 break-words text-xl font-semibold leading-tight sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}
