import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff, Trophy } from "lucide-react";

import { useFanProfile, useFanSession, useSaveFanProfile } from "@/lib/prediction-data";
import { V3StatusChip, V3Surface } from "./V3Foundation";

type ProfileVisibility = "private" | "unlisted" | "public";

function visibilityCopy(value: ProfileVisibility) {
  if (value === "public") {
    return "Your display name may appear on public Solaris community surfaces where that feature is enabled.";
  }
  if (value === "unlisted") {
    return "Your display name is only exposed through explicit share links and is not intended for discovery.";
  }
  return "Your fan identity stays private outside your authenticated account.";
}

function PrivacyState({ state, children }: { state: "loading" | "unavailable" | "ready"; children: ReactNode }) {
  return <div data-v3-account-privacy-state={state}>{children}</div>;
}

export function V3AccountPrivacyPanel() {
  const session = useFanSession();
  const profile = useFanProfile(session.data?.id);
  const saveProfile = useSaveFanProfile(session.data?.id);
  const [displayName, setDisplayName] = useState("Solaris fan");
  const [visibility, setVisibility] = useState<ProfileVisibility>("private");
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!profile.data) return;
    setDisplayName(profile.data.display_name);
    setVisibility(profile.data.visibility);
    setLeaderboardOptIn(profile.data.leaderboard_opt_in);
  }, [profile.data]);

  if (session.isLoading || profile.isLoading) {
    return (
      <PrivacyState state="loading">
        <V3Surface>
          <p className="text-sm text-[var(--v3-text-secondary)]" role="status" aria-live="polite">
            Loading privacy settings…
          </p>
        </V3Surface>
      </PrivacyState>
    );
  }

  if (!session.data || profile.isError) {
    return (
      <PrivacyState state="unavailable">
        <V3Surface>
          <p className="text-sm font-semibold">Privacy settings unavailable</p>
          <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
            Solaris could not verify the current private profile projection, so no visibility setting is being guessed locally.
          </p>
        </V3Surface>
      </PrivacyState>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(false);
    try {
      await saveProfile.mutateAsync({
        display_name: displayName.trim() || "Solaris fan",
        visibility,
        leaderboard_opt_in: leaderboardOptIn,
      });
      setSaved(true);
    } catch {
      // React Query keeps the authoritative mutation error. No optimistic success is applied.
    }
  };

  return (
    <PrivacyState state="ready">
      <V3Surface level="raised">
        <form onSubmit={(event) => void submit(event)} className="grid gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Public fan identity</p>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                This controls your personal community identity only. It does not change your delegation, entries or official contest records.
              </p>
            </div>
            <V3StatusChip tone={visibility === "private" ? "locked" : "neutral"}>
              {visibility === "private" ? "Private" : visibility === "unlisted" ? "Unlisted" : "Public"}
            </V3StatusChip>
          </div>

          <label className="grid gap-1.5 text-xs font-semibold text-[var(--v3-text-secondary)]">
            Display name
            <input
              value={displayName}
              minLength={1}
              maxLength={40}
              required
              autoComplete="nickname"
              onChange={(event) => {
                setDisplayName(event.target.value);
                setSaved(false);
              }}
              className="min-h-11 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.025] px-3 text-base text-[var(--v3-text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-white/45"
            />
          </label>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-xs font-semibold text-[var(--v3-text-secondary)]">Profile visibility</legend>
            {(["private", "unlisted", "public"] as const).map((value) => (
              <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.02] px-3 text-sm">
                <input
                  type="radio"
                  name="fan-profile-visibility"
                  value={value}
                  checked={visibility === value}
                  onChange={() => {
                    setVisibility(value);
                    setSaved(false);
                  }}
                />
                {value === "private" ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                <span className="font-semibold capitalize">{value}</span>
              </label>
            ))}
          </fieldset>

          <p className="text-xs leading-5 text-[var(--v3-text-tertiary)]">{visibilityCopy(visibility)}</p>

          <label className="flex min-h-12 items-start gap-3 rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.02] p-3">
            <input
              type="checkbox"
              checked={leaderboardOptIn}
              onChange={(event) => {
                setLeaderboardOptIn(event.target.checked);
                setSaved(false);
              }}
              className="mt-1 size-4"
            />
            <Trophy className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold">Appear on future leaderboards</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--v3-text-secondary)]">
                Off by default. Recovery email and individual prediction picks are never made public by this setting.
              </span>
            </span>
          </label>

          {saveProfile.isError ? (
            <p role="alert" className="rounded-xl border border-red-300/25 bg-red-400/10 px-3 py-2 text-xs leading-5">
              Solaris could not save the privacy change. The server remains authoritative; no local success state was kept.
            </p>
          ) : null}
          {saved ? (
            <p role="status" aria-live="polite" className="text-xs text-[var(--v3-text-secondary)]">
              Privacy settings saved.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saveProfile.isPending || !displayName.trim()}
            className="min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveProfile.isPending ? "Saving…" : "Save privacy settings"}
          </button>
        </form>
      </V3Surface>
    </PrivacyState>
  );
}
