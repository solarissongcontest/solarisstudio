import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/editions", label: "Editions" },
  { to: "/countries", label: "Countries" },
  { to: "/analysis", label: "Analysis" },
  { to: "/records", label: "Records" },
  { to: "/admin", label: "Studio" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setEmail(session?.user?.email ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-4 px-5 py-3">
          <Link to="/" className="flex items-center gap-3">
            <span className="bg-aurora grid h-9 w-9 place-items-center rounded-xl font-display text-sm font-bold text-primary-foreground">
              SS
            </span>
            <span className="leading-tight">
              <span className="block font-display text-sm font-semibold">Solaris Scoreboard Studio</span>
              <span className="block text-[11px] text-muted-foreground">Terra Solaris · SSC</span>
            </span>
          </Link>

          <nav className="ml-auto flex flex-wrap items-center gap-1">
            {NAV.map((item) => {
              const active =
                item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
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
              <span className="ml-2 hidden items-center gap-2 sm:inline-flex">
                <span className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground">
                  {email}
                </span>
                <button
                  onClick={async () => {
                    await supabase.auth.signOut();
                    window.location.href = "/";
                  }}
                  className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Sign out
                </button>
              </span>
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
      <main className="mx-auto max-w-[1400px] px-5 py-8">{children}</main>
      <footer className="mx-auto max-w-[1400px] px-5 pb-10 pt-4 text-xs text-muted-foreground">
        Solaris Scoreboard Studio — an unofficial fan platform for the Terra Solaris universe.
      </footer>
    </div>
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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        )}
        <h1 className="font-display text-3xl font-bold sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
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
    <section className={cn("glass p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-display text-lg font-semibold">{title}</h2>}
            {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="glass p-4">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="numeric mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
