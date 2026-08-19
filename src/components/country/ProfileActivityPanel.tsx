import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { Panel } from "@/components/AppShell";
import { editionLabel, useAllShows, useEditions } from "@/lib/data";
import {
  useEnablePredictionShare,
  useFanProfile,
  useFanSession,
  useMyPredictionHistory,
  usePredictionRounds,
  useSaveFanProfile,
} from "@/lib/prediction-data";

export function ProfileActivityPanel() {
  const { data: user, isLoading: sessionLoading } = useFanSession();
  const { data: profile } = useFanProfile(user?.id);
  const { data: history } = useMyPredictionHistory(user?.id);
  const { data: roundData } = usePredictionRounds();
  const { data: shows } = useAllShows();
  const { data: editions } = useEditions();
  const saveProfile = useSaveFanProfile(user?.id);
  const enableShare = useEnablePredictionShare();

  const [displayName, setDisplayName] = useState("Solaris fan");
  const [visibility, setVisibility] = useState<"private" | "unlisted" | "public">("private");
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name);
    setVisibility(profile.visibility);
    setLeaderboardOptIn(profile.leaderboard_opt_in);
  }, [profile]);

  const roundMap = useMemo(
    () => new Map((roundData?.rounds ?? []).map((round) => [round.id, round])),
    [roundData],
  );
  const showMap = useMemo(() => new Map((shows ?? []).map((show) => [show.id, show])), [shows]);
  const editionMap = useMemo(
    () => new Map((editions ?? []).map((edition) => [edition.id, edition])),
    [editions],
  );

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await saveProfile.mutateAsync({
        display_name: displayName.trim(),
        visibility,
        leaderboard_opt_in: leaderboardOptIn,
      });
      setMessage("Profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Profile could not be saved.");
    }
  };

  const copyShareLink = async (entryId: string, existingToken: string | null) => {
    setMessage(null);
    try {
      const token = existingToken ?? (await enableShare.mutateAsync(entryId));
      await navigator.clipboard.writeText(`${window.location.origin}/predictions/share/${token}`);
      setMessage("Prediction result link copied.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Share link could not be created.");
    }
  };

  if (sessionLoading) {
    return <Panel title="Profile & activity"><p className="text-sm text-muted-foreground">Loading your Solaris activity…</p></Panel>;
  }
  if (!user) return null;

  if (roundData?.schemaReady === false) {
    return <Panel title="Profile & activity"><p className="text-sm text-muted-foreground">Account profile and prediction history are temporarily unavailable.</p></Panel>;
  }

  return (
    <section className="space-y-4" aria-label="Profile and activity">
      <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
        <Panel title="Profile & privacy" description="Your personal Solaris account settings now live beside your country tools.">
          <form onSubmit={save} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Display name</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={1} maxLength={40} required className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:ring-2 focus:ring-primary/50" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Profile visibility</span>
              <select value={visibility} onChange={(event) => setVisibility(event.target.value as "private" | "unlisted" | "public")} className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm">
                <option value="private">Private</option>
                <option value="unlisted">Name visible on links you share</option>
                <option value="public">Public profile name</option>
              </select>
            </label>
            <label className="flex items-start gap-3 rounded-xl bg-surface p-3">
              <input type="checkbox" checked={leaderboardOptIn} onChange={(event) => setLeaderboardOptIn(event.target.checked)} className="mt-1 size-4" />
              <span><span className="block text-sm font-semibold">Appear on future leaderboards</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">Off by default. Your email and individual picks are never shown.</span></span>
            </label>
            <button type="submit" disabled={saveProfile.isPending} className="min-h-11 w-full rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saveProfile.isPending ? "Saving…" : "Save profile"}</button>
          </form>
        </Panel>

        <Panel title="Activity" description={`${history?.length ?? 0} saved prediction round${history?.length === 1 ? "" : "s"}`}>
          {history?.length ? (
            <div className="divide-y divide-border/60">
              {history.slice(0, 8).map((entry) => {
                const round = roundMap.get(entry.round_id);
                const show = round ? showMap.get(round.show_id) : null;
                const edition = show ? editionMap.get(show.edition_id) : null;
                return (
                  <div key={entry.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-primary">{edition ? editionLabel(edition) : entry.state}</p>
                        <p className="mt-1 truncate text-sm font-semibold">{show?.name ?? "Prediction round"}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Version {entry.version} · {entry.state}</p>
                      </div>
                      {entry.prediction_score && <div className="shrink-0 text-right"><p className="numeric text-xl font-black text-primary">{entry.prediction_score.score.toFixed(1)}</p><p className="text-[9px] uppercase text-muted-foreground">score</p></div>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {round && <Link to="/predictions/$showId" params={{ showId: round.show_id }} className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold">View prediction</Link>}
                      {entry.prediction_score && <button type="button" onClick={() => void copyShareLink(entry.id, entry.share_token)} disabled={enableShare.isPending} className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold">Copy result link</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-5 text-center"><p className="text-sm text-muted-foreground">No predictions saved yet.</p><Link to="/predictions" className="mt-3 inline-block text-sm font-semibold text-primary">Open Prediction Arena →</Link></div>
          )}
        </Panel>
      </div>
      {message && <p className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted-foreground">{message}</p>}
    </section>
  );
}
