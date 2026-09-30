import { Link } from "@tanstack/react-router";
import { Compass, Home, Trophy, User, Vote } from "lucide-react";
import type { ReactNode } from "react";

const FALLBACK_TABS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/participate", label: "Participate", icon: Vote },
  { to: "/results", label: "Results", icon: Trophy },
  { to: "/me", label: "Me", icon: User },
] as const;

export function AppFallbackScreen({
  kind,
  title,
  description,
  actions,
  busy = false,
}: {
  kind: "pending" | "error" | "not-found";
  title: string;
  description: string;
  actions?: ReactNode;
  busy?: boolean;
}) {
  return (
    <div className="solaris-app-fallback" data-fallback-kind={kind}>
      <header className="solaris-app-fallback-toolbar">
        <span className="solaris-app-fallback-toolbar-title">Solaris Studio</span>
      </header>

      <main
        id="main-content"
        className="solaris-app-fallback-content"
        aria-busy={busy || undefined}
      >
        {busy ? (
          <div className="solaris-app-fallback-skeleton" aria-hidden="true">
            <span className="is-kicker" />
            <span className="is-title" />
            <span className="is-line" />
            <span className="is-card" />
            <span className="is-card is-short" />
          </div>
        ) : null}

        <div className={busy ? "sr-only" : undefined}>
          <p className="solaris-app-fallback-eyebrow">
            {kind === "not-found" ? "Not found" : kind === "error" ? "Recovery" : "Solaris Studio"}
          </p>
          <h1 className="solaris-app-fallback-title">{title}</h1>
          <p className="solaris-app-fallback-description">{description}</p>
          {actions ? <div className="solaris-app-fallback-actions">{actions}</div> : null}
        </div>
      </main>

      <nav className="solaris-app-fallback-nav" aria-label="Primary navigation">
        {FALLBACK_TABS.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to as any} className="solaris-app-fallback-tab">
            <Icon className="size-4" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
