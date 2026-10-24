import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useFanProfile, useSaveFanProfile } from "@/lib/prediction-data";
import { V3Screen, V3ScreenHeader, V3Section, V3Surface } from "./V3Foundation";

type FanVisibility = "private" | "unlisted" | "public";

export function V3FanIdentityScreen({ viewerId }: { viewerId: string }) {
  const profile = useFanProfile(viewerId);
  const saveProfile = useSaveFanProfile(viewerId);
  const [displayName, setDisplayName] = useState("Solaris fan");
  const [visibility, setVisibility] = useState<FanVisibility>("private");
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(false);

  useEffect(() => {
    setDisplayName("Solaris fan");
    setVisibility("private");
    setLeaderboardOptIn(false);
  }, [viewerId]);

  useEffect(() => {
    if (!profile.data) return;
    setDisplayName(profile.data.display_name);
    setVisibility(profile.data.visibility);
    setLeaderboardOptIn(profile.data.leaderboard_opt_in);
  }, [viewerId, profile.data]);

  if (profile.isPending) {
    return (
      <p role="status" aria-live="polite" className="p-6 text-sm text-white/60">
        Loading your fan identity…
      </p>
    );
  }

  if (profile.isError) {
    return (
      <div role="alert" className="p-6 text-sm text-white/60">
        <p>Your fan identity could not be loaded. Nothing was changed.</p>
        <button
          type="button"
          onClick={() => void profile.refetch()}
          disabled={profile.isFetching}
          className="mt-4 min-h-11 rounded-xl border border-white/15 bg-white/[0.055] px-4 font-semibold text-white disabled:opacity-50"
        >
          {profile.isFetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
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
      error: (error) =>
        error instanceof Error ? error.message : "Fan identity could not be saved.",
    });

    try {
      await promise;
    } catch {
      // The toast owns transient mutation feedback. Server state stays authoritative.
    }
  };

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Me"
        title="Public fan identity"
        description="Choose how you appear in fan-facing Solaris features. Your private account identity and delegation identity stay separate."
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
                <span className="block text-sm font-semibold">
                  Appear on eligible fan leaderboards
                </span>
                <span className="mt-1 block text-xs leading-5 text-white/50">
                  Off by default. This setting does not publish private account details,
                  delegation membership or individual prediction picks.
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
            Fan visibility controls the identity used in fan-facing features only. Account
            security information and official delegation identity are governed separately.
          </p>
        </V3Surface>
      </V3Section>
    </V3Screen>
  );
}
