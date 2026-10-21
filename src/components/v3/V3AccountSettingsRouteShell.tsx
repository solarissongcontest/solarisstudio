import { Link } from "@tanstack/react-router";
import { CircleHelp, LogOut, Settings, UserRound } from "lucide-react";
import type { ReactNode } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { MySolarisProvider } from "@/components/mysolaris/MySolarisContext";
import { signOutSolarisAccount } from "@/lib/account-session";
import { useFanSession } from "@/lib/prediction-data";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { cn } from "@/lib/utils";
import { V3AppShell } from "./V3AppShell";
import { V3Screen, V3ScreenHeader } from "./V3Foundation";

export type V3AccountSettingsSection = "account" | "settings";

type V3AccountSettingsRouteShellProps = {
  section: V3AccountSettingsSection;
  title: string;
  description: string;
  children: ReactNode;
  v3Children?: ReactNode;
};

function ResolvingAccountSettingsRoute({ title }: { title: string }) {
  return (
    <main
      className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
      data-v3-account-settings-route-boot=""
    >
      <header className="border-b border-border/70 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Me</p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
          {title}
        </h1>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        Checking the current account and settings experience.
      </p>
    </main>
  );
}

/**
 * Reversible installed-app cutover shared by Account and App Settings.
 *
 * The routes keep their canonical account/auth/preferences mutation engines.
 * Only the installed-app presentation changes when both the global V3 flag and
 * this slice flag are server-authoritatively enabled. Public web, rollout errors
 * and disabled rollout all keep the proven AppShell presentation.
 */
export function V3AccountSettingsRouteShell({
  section,
  title,
  description,
  children,
  v3Children,
}: V3AccountSettingsRouteShellProps) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const session = useFanSession();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return <ResolvingAccountSettingsRoute title={title} />;
  }

  if (!isAppMode || rollout.isError || rollout.data?.accountSettingsEnabled !== true) {
    return (
      <AppShell>
        <PageHeader
          eyebrow={section === "account" ? "MySolaris" : "Solaris Studio"}
          title={title}
          description={description}
        />
        {children}
      </AppShell>
    );
  }

  const signOut = async () => {
    await signOutSolarisAccount();
    window.location.href = "/";
  };

  const selectedContent = v3Children ?? children;

  // The compatibility Account route normally receives this provider from
  // AppShell's MySolaris workspace. Installed-app V3 bypasses that shell, so
  // native Account content must retain the same caller-scoped context boundary.
  // Settings does not consume MySolaris context and deliberately stays outside
  // the provider to avoid unrelated participant/task query fan-out.
  const routeContent =
    section === "account" ? <MySolarisProvider>{selectedContent}</MySolarisProvider> : selectedContent;

  return (
    <V3AppShell
      editionLabel="Solaris Studio"
      phaseLabel="Me"
      topActions={
        <>
          <Link
            to="/guide"
            className="v3-icon-button"
            aria-label="Open Solaris guide"
            title="Guide"
          >
            <CircleHelp className="size-4" />
          </Link>
          {session.data ? (
            <button
              type="button"
              className="v3-icon-button"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => void signOut()}
            >
              <LogOut className="size-4" />
            </button>
          ) : null}
        </>
      }
    >
      <V3Screen className="pb-8">
        <div data-v3-account-settings-route="" data-v3-account-settings-screen={section}>
          <V3ScreenHeader kicker="Me" title={title} description={description} />

          <nav
            className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-[var(--v3-border-subtle)] bg-white/[0.018] p-1.5"
            aria-label="Account and settings"
          >
            <Link
              to="/my-solaris/account"
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition",
                section === "account"
                  ? "bg-white/[0.09] text-[var(--v3-text-primary)] shadow-[var(--v3-shadow-raised)]"
                  : "text-[var(--v3-text-secondary)] hover:bg-white/[0.045]",
              )}
              aria-current={section === "account" ? "page" : undefined}
            >
              <UserRound className="size-4" aria-hidden="true" />
              Account
            </Link>
            <Link
              to="/settings"
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition",
                section === "settings"
                  ? "bg-white/[0.09] text-[var(--v3-text-primary)] shadow-[var(--v3-shadow-raised)]"
                  : "text-[var(--v3-text-secondary)] hover:bg-white/[0.045]",
              )}
              aria-current={section === "settings" ? "page" : undefined}
            >
              <Settings className="size-4" aria-hidden="true" />
              App settings
            </Link>
          </nav>

          <div data-v3-account-settings-content="">{routeContent}</div>
        </div>
      </V3Screen>
    </V3AppShell>
  );
}
