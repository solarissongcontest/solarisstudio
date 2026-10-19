import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  useFanProfile,
  useFanSession,
  useSaveFanProfile,
} from "@/lib/prediction-data";
import { V3Screen, V3ScreenHeader, V3Section, V3Surface } from "./V3Foundation";

type FanVisibility = "private" | "unlisted" | "public";

export function V3FanIdentityScreen() {
  const session = useFanSession();
  const profile = useFanProfile(session.data?.id);
  const saveProfile = useSaveFanProfile(session.data?.id);
  const [displayName, setDisplayName] = useState("Solaris fan");
  const [visibility, setVisibility] = useState<FanVisibility>("private");
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(false);

  useEffect(() => {
    if (!profile.data) return;
    setDisplayName(profile.data.display_name);
    setVisibility(profile.data.visibility);
    setLeaderboardOptIn(profile.data.leaderboard_opt_in);
  }, [profile.data]);

  if (session.isLoading || (session.data && profile.isLoading)) {
    return <p role="status" className="p-6 text-sm text-white/60">Loading your fan identity…</p>;
  }

  if (!session.data) {
    return <p role="status" className="p-6 text-sm text-white/60">Sign in to manage your fan identity.</p>;
  }

  if (profile.isError) {
    return <p role="alert" className="p-6 text-sm text-white/60">Your fan identity could not be loaded.</p>;
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedName = displayName.trim();
    if (!normalizedName) return;

    const promise = saveProfile.mutateAsync({
      display_name: normalizedName,
      visibility,
      leaderboard_opt_in: leaderboardOptIn,
    });

    toast.promise(promise, {
      id: "v3-fan-public-identity-save",
      loading: "Saving fan identity…",
      success: "Fan identity saved.",
      error: (error) => error instanceof Error ? error.message : "Fan identity could not be saved.",
    });

    try {
      await promise;
    } catch {
      // Toast owns the transient error. Canonical server state remains unchanged.
    }
  };

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Me"
        title="Public fan identity"
        description="Choose how your fan identity appears in public Solaris features. Your private account and delegation identity stay separate."
      />

      <V3Section title="Identity">
        <V3Surface level="raised" className="p-5">
          <form onSubmit={save} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-white/60">Display name</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                minLength={1}
                maxLength={40}
                required
                autoComplete="nickname"
                className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-white/45"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-white/60">Visibility</span>
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as FanVisibility)}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm"
              >
                <option value="private">Private</option>
                <option value="unlisted">Visible on links you share</option>
                <option value="public">Public fan name</option>
              </select>
            </label>

            <label className="flex min-h-11 items-start gap-3 rounded-xl bg-white/[0.045] p-3">
              <input
                type="checkbox"
                checked={leaderboardOptIn}
                onChange={(event) => setLeaderboardOptIn(event.target.checked)}
                className="mt-1 size-4"
              />
              <span>
                <span className="block text-sm font-semibold">Appear on eligible fan leaderboards</span>
                <span className="mt-1 block text-xs leading-5 text-white/50">
                  Off by default. This does not make your email, private account data or individual prediction picks public.
                </span>
              </span>
            </label>

            <button
              type="submit"
              disabled={saveProfile.isPending || !displayName.trim()}
              className="min-h-11 w-full rounded-xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-50"
            >
              {saveProfile.isPending ? "Saving…" : "Save fan identity"}
            </button>
          </form>
        </V3Surface>
      </V3Section>

      <V3Section title="Privacy">
        <V3Surface className="p-4">
          <p className="text-sm font-semibold">Three identities stay separate</p>
          <p className="mt-1 text-xs leading-5 text-white/50">
            Fan visibility controls your public fan name only. Account security details and delegation membership are governed separately and are not published by this setting.
          </p>
        </V3Surface>
      </V3Section>
    </V3Screen>
  );
}
