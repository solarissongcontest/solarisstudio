import { Link } from "@tanstack/react-router";
import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";

import { useMySolaris } from "@/components/mysolaris/MySolarisContext";
import { signOutSolarisAccount } from "@/lib/account-session";
import { V3Section, V3StatusChip, V3Surface } from "./V3Foundation";
import { V3AccountSecurityPanel } from "./V3AccountSecurityPanel";
import { V3AccountSessionsPanel } from "./V3AccountSessionsPanel";

export function V3AccountSections() {
  const workspace = useMySolaris();
  const country = workspace.countryAccount?.country;
  const viewerKey = workspace.user?.id ?? "signed-out";
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);

  const signOutEverywhere = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(false);
    try {
      // The canonical account transition revokes the authenticated Solaris
      // session globally, clears private cache state, then leaves the app.
      await signOutSolarisAccount();
    } catch {
      setSignOutError(true);
      setSigningOut(false);
    }
  };

  return (
    <div className="grid gap-6" data-v3-account-sections="">
      <V3Section title="Security">
        <V3AccountSecurityPanel key={`security:${viewerKey}`} />
      </V3Section>

      <V3Section title="Devices & sessions">
        <V3AccountSessionsPanel key={`sessions:${viewerKey}`} />
      </V3Section>

      <V3Section title="Privacy">
        <V3Surface level="raised">
          <div className="flex items-start gap-3">
            <UserRound className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Public fan identity</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Manage your fan display name, visibility and leaderboard opt-in in your country workspace. Account recovery and delegation identity remain separate.
              </p>
              <Link
                to="/my-solaris/country"
                className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-[var(--v3-border-subtle)] px-3 text-xs font-semibold"
              >
                Manage public fan identity
              </Link>
            </div>
          </div>
        </V3Surface>
      </V3Section>

      <V3Section title="Access">
        <V3Surface level="raised">
          <div className="flex items-start gap-3" data-v3-account-access="">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">Connected delegation</p>
                <V3StatusChip
                  tone={workspace.permissions.countryStatus === "active" ? "success" : workspace.permissions.countryStatus === "suspended" ? "danger" : "neutral"}
                >
                  {workspace.permissions.countryStatus === "active"
                    ? "Active"
                    : workspace.permissions.countryStatus === "suspended"
                      ? "Suspended"
                      : "Not connected"}
                </V3StatusChip>
              </div>
              <p className="mt-2 text-sm font-semibold">{country?.name ?? "No country connected"}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                {workspace.permissions.countryStatus === "suspended"
                  ? "Your delegation access is suspended. Participant actions remain governed by current server permissions."
                  : country
                    ? "Your available participant actions are derived from the current server-authoritative delegation access."
                    : "No active country delegation is attached to this account."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  to="/participate"
                  className="inline-flex min-h-10 items-center rounded-xl border border-[var(--v3-border-subtle)] px-3 text-xs font-semibold"
                >
                  Open Participate
                </Link>
                {country?.short_code ? (
                  <Link
                    to="/countries/$code"
                    params={{ code: country.short_code }}
                    className="inline-flex min-h-10 items-center rounded-xl border border-[var(--v3-border-subtle)] px-3 text-xs font-semibold"
                  >
                    View public country
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </V3Surface>
      </V3Section>

      <V3Section title="Account actions">
        <V3Surface>
          <div className="flex items-start gap-3">
            <LogOut className="mt-0.5 size-5 shrink-0 text-[var(--v3-text-secondary)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Sign out everywhere</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                Sign out of every authenticated Solaris session for this account. To remove only another device, revoke that session above.
              </p>
              {signOutError ? (
                <p role="alert" className="mt-3 rounded-xl border border-red-300/25 bg-red-400/10 px-3 py-2 text-xs leading-5">
                  Solaris could not confirm global sign-out. This screen will not pretend your sessions were revoked.
                </p>
              ) : null}
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void signOutEverywhere()}
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.035] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                <LogOut className="size-4" aria-hidden="true" />
                {signingOut ? "Signing out…" : "Sign out everywhere"}
              </button>
            </div>
          </div>
        </V3Surface>
      </V3Section>
    </div>
  );
}
