import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { Scoreboard } from "@/components/Scoreboard";
import { computeStandings } from "@/lib/analysis";
import { supabase } from "@/integrations/supabase/client";
import {
  POINT_SET,
  SHOW_KINDS,
  useCountries,
  useEdition,
  useJuryVotes,
  useParticipants,
  useShows,
  useTelevotes,
  type Show,
} from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/$slug")({
  head: () => ({
    meta: [
      { title: "Edition management — Solaris Scoreboard Studio" },
      {
        name: "description",
        content:
          "Manage sub-events, participants, jury points and televote totals for a Solaris Song Contest edition.",
      },
      { property: "og:title", content: "Edition management — Solaris Scoreboard Studio" },
      { property: "og:description", content: "Sub-events, jury and televote entry for an SSC edition." },
    ],
  }),
  component: AdminEdition,
});

type Tab = "shows" | "participants" | "jury" | "televote" | "publish";

function AdminEdition() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const { data: edition } = useEdition(slug);
  const { data: countries } = useCountries();
  const { data: shows } = useShows(edition?.id);
  const { data: allParticipants } = useParticipants(edition?.id);
  const { data: allJury } = useJuryVotes(edition?.id);
  const { data: allTele } = useTelevotes(edition?.id);

  const [tab, setTab] = useState<Tab>("shows");
  const [showId, setShowId] = useState<string>("");
  const [voter, setVoter] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState({ name: "", kind: "semi-final", sort_order: 1 });
  const [entry, setEntry] = useState({ country_id: "", artist: "", song: "" });

  const cMap = useMemo(() => new Map((countries ?? []).map((c) => [c.id, c])), [countries]);

  const activeShow = (shows ?? []).find((s) => s.id === showId) ?? (shows ?? [])[0] ?? null;
  const activeShowId = activeShow?.id ?? null;

  const participants = (allParticipants ?? []).filter((p) => p.show_id === activeShowId);
  const jury = (allJury ?? []).filter((v) => v.show_id === activeShowId);
  const tele = (allTele ?? []).filter((t) => t.show_id === activeShowId);

  const order = participants.map((p) => p.country_id);
  const standings = computeStandings(order, jury, tele);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["shows"] });
    qc.invalidateQueries({ queryKey: ["jury_votes"] });
    qc.invalidateQueries({ queryKey: ["televote_votes"] });
    qc.invalidateQueries({ queryKey: ["participants"] });
    qc.invalidateQueries({ queryKey: ["results"] });
  };

  const activeVoter = voter && order.includes(voter) ? voter : order[0] || "";
  const voterVotes = jury.filter((v) => v.voter_country_id === activeVoter);
  const usedPoints = new Set(voterVotes.map((v) => v.points));

  const createShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edition) return;
    setMsg(null);
    const { error } = await supabase.from("shows").insert({
      edition_id: edition.id,
      name: showForm.name,
      kind: showForm.kind,
      sort_order: showForm.sort_order,
      published: false,
    });
    if (error) setMsg(error.message);
    else setShowForm({ name: "", kind: "semi-final", sort_order: showForm.sort_order + 1 });
    refresh();
  };

  const toggleShow = async (s: Show) => {
    setMsg(null);
    const { error } = await supabase.from("shows").update({ published: !s.published }).eq("id", s.id);
    if (error) setMsg(error.message);
    refresh();
  };

  const deleteShow = async (s: Show) => {
    if (!window.confirm(`Delete “${s.name}” with all of its participants and votes?`)) return;
    setMsg(null);
    const { error } = await supabase.from("shows").delete().eq("id", s.id);
    if (error) setMsg(error.message);
    if (showId === s.id) setShowId("");
    refresh();
  };

  const addParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edition || !activeShowId || !entry.country_id) return;
    setMsg(null);
    const { error } = await supabase.from("participants").insert({
      edition_id: edition.id,
      show_id: activeShowId,
      country_id: entry.country_id,
      artist: entry.artist,
      song: entry.song,
      running_order: participants.length + 1,
      semi_final: activeShow?.kind ?? "final",
    });
    if (error) setMsg(error.message);
    else setEntry({ country_id: "", artist: "", song: "" });
    refresh();
  };

  const removeParticipant = async (id: string) => {
    setMsg(null);
    const { error } = await supabase.from("participants").delete().eq("id", id);
    if (error) setMsg(error.message);
    refresh();
  };

  const assign = async (receiver: string, points: number) => {
    if (!edition || !activeShowId) return;
    setMsg(null);
    await supabase
      .from("jury_votes")
      .delete()
      .eq("edition_id", edition.id)
      .eq("show_id", activeShowId)
      .eq("voter_country_id", activeVoter)
      .or(`points.eq.${points},receiving_country_id.eq.${receiver}`);
    const { error } = await supabase.from("jury_votes").insert({
      edition_id: edition.id,
      show_id: activeShowId,
      voter_country_id: activeVoter,
      receiving_country_id: receiver,
      points,
    });
    if (error) setMsg(error.message);
    refresh();
  };

  const setTele = async (countryId: string, points: number) => {
    if (!edition || !activeShowId) return;
    setMsg(null);
    const existing = tele.find((t) => t.country_id === countryId);
    const { error } = existing
      ? await supabase.from("televote_votes").update({ points }).eq("id", existing.id)
      : await supabase
          .from("televote_votes")
          .insert({ edition_id: edition.id, show_id: activeShowId, country_id: countryId, points });
    if (error) setMsg(error.message);
    refresh();
  };

  const publish = async () => {
    if (!edition || !activeShowId) return;
    setMsg(null);
    await supabase.from("results").delete().eq("edition_id", edition.id).eq("show_id", activeShowId);
    const rows = standings.map((s) => ({
      edition_id: edition.id,
      show_id: activeShowId,
      country_id: s.countryId,
      jury_points: s.jury,
      televote_points: s.televote,
      total_points: s.total,
      final_rank: s.rank,
    }));
    const { error } = await supabase.from("results").insert(rows);
    if (!error && activeShow?.kind === "grand-final") {
      await supabase.from("editions").update({ status: "completed" }).eq("id", edition.id);
    }
    setMsg(error ? error.message : "Scoreboard saved. Publish the show to make it public.");
    refresh();
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Organizer studio"
        title={edition?.name ?? "Edition"}
        description="Build sub-events, enter votes per show, and keep each scoreboard private until you publish it."
        actions={
          <>
            <Link to="/admin" className="rounded-lg border border-border px-3 py-2 text-sm">
              ← Studio
            </Link>
            <Link
              to="/broadcast/$slug"
              params={{ slug }}
              className="bg-aurora rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Broadcast
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Sub-event</span>
        <select
          value={activeShowId ?? ""}
          onChange={(e) => setShowId(e.target.value)}
          className="rounded-xl bg-surface px-3 py-2 text-sm"
        >
          {(shows ?? []).length === 0 && <option value="">No sub-events yet</option>}
          {(shows ?? []).map((s) => (
            <option key={s.id} value={s.id} className="bg-background">
              {s.name} {s.published ? "(public)" : "(private)"}
            </option>
          ))}
        </select>
        {activeShow && (
          <button
            onClick={() => toggleShow(activeShow)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm"
          >
            {activeShow.published ? "Make private" : "Publish scoreboard"}
          </button>
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-1">
        {(["shows", "participants", "jury", "televote", "publish"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm capitalize",
              tab === t ? "bg-surface-strong" : "text-muted-foreground hover:bg-surface",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {msg && <p className="mb-4 text-sm text-primary">{msg}</p>}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {tab === "shows" && (
            <>
              <Panel title="Sub-events" description="Semi-finals, grand final and any other show">
                <ul className="space-y-2">
                  {(shows ?? []).map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface px-3 py-2">
                      <span className="numeric w-6 text-sm text-muted-foreground">{s.sort_order}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.kind} · {s.published ? "public scoreboard" : "private scoreboard"}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleShow(s)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs"
                      >
                        {s.published ? "Make private" : "Publish"}
                      </button>
                      <button
                        onClick={() => deleteShow(s)}
                        className="rounded-lg border border-destructive/50 px-3 py-1.5 text-xs text-destructive"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                  {(shows ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No sub-events yet — add a semi-final or grand final below.
                    </p>
                  )}
                </ul>
              </Panel>

              <Panel title="New sub-event" description="Add a semi-final, grand final or special show">
                <form onSubmit={createShow} className="grid gap-3 sm:grid-cols-2">
                  <input
                    required
                    value={showForm.name}
                    onChange={(e) => setShowForm({ ...showForm, name: e.target.value })}
                    placeholder="Semi-Final 1"
                    className="rounded-xl bg-surface px-3 py-2 text-sm"
                  />
                  <select
                    value={showForm.kind}
                    onChange={(e) => setShowForm({ ...showForm, kind: e.target.value })}
                    className="rounded-xl bg-surface px-3 py-2 text-sm"
                  >
                    {SHOW_KINDS.map((k) => (
                      <option key={k} value={k} className="bg-background">
                        {k}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={showForm.sort_order}
                    onChange={(e) => setShowForm({ ...showForm, sort_order: Number(e.target.value) })}
                    className="numeric rounded-xl bg-surface px-3 py-2 text-sm"
                  />
                  <button className="bg-aurora rounded-xl px-4 py-2.5 text-sm font-semibold text-primary-foreground">
                    Add sub-event
                  </button>
                </form>
              </Panel>
            </>
          )}

          {tab === "participants" && (
            <>
              <Panel title="Running order" description={`Participants in ${activeShow?.name ?? "this show"}`}>
                <ul className="space-y-2">
                  {participants.map((p) => {
                    const c = cMap.get(p.country_id);
                    return (
                      <li key={p.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                        <span className="numeric w-6 text-sm text-muted-foreground">{p.running_order}</span>
                        {c && <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c?.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {p.artist} — “{p.song}”
                          </p>
                        </div>
                        <button
                          onClick={() => removeParticipant(p.id)}
                          className="rounded-lg border border-destructive/50 px-2 py-1 text-xs text-destructive"
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                  {participants.length === 0 && (
                    <p className="text-sm text-muted-foreground">No participants in this sub-event yet.</p>
                  )}
                </ul>
              </Panel>

              <Panel title="Add participant" description="Country, artist and song for this sub-event">
                <form onSubmit={addParticipant} className="grid gap-3 sm:grid-cols-2">
                  <select
                    required
                    value={entry.country_id}
                    onChange={(e) => setEntry({ ...entry, country_id: e.target.value })}
                    className="rounded-xl bg-surface px-3 py-2 text-sm"
                  >
                    <option value="">Select country…</option>
                    {(countries ?? [])
                      .filter((c) => !order.includes(c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id} className="bg-background">
                          {c.name}
                          {c.native_name ? ` (${c.native_name})` : ""}
                        </option>
                      ))}
                  </select>
                  <input
                    required
                    value={entry.artist}
                    onChange={(e) => setEntry({ ...entry, artist: e.target.value })}
                    placeholder="Artist"
                    className="rounded-xl bg-surface px-3 py-2 text-sm"
                  />
                  <input
                    required
                    value={entry.song}
                    onChange={(e) => setEntry({ ...entry, song: e.target.value })}
                    placeholder="Song"
                    className="rounded-xl bg-surface px-3 py-2 text-sm"
                  />
                  <button
                    disabled={!activeShowId}
                    className="bg-aurora rounded-xl px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    Add participant
                  </button>
                </form>
              </Panel>
            </>
          )}

          {tab === "jury" && (
            <Panel title="Jury entry" description="Pick the awarding jury, then assign each point value">
              <select
                value={activeVoter}
                onChange={(e) => setVoter(e.target.value)}
                className="mb-4 w-full rounded-xl bg-surface px-3 py-2 text-sm"
              >
                {order.map((id) => (
                  <option key={id} value={id} className="bg-background">
                    {cMap.get(id)?.name}
                  </option>
                ))}
              </select>

              <div className="mb-4 flex flex-wrap gap-1.5">
                {POINT_SET.map((p) => (
                  <span
                    key={p}
                    className={cn(
                      "numeric grid h-8 w-8 place-items-center rounded-lg text-xs font-semibold",
                      usedPoints.has(p) ? "bg-aurora text-primary-foreground" : "bg-surface text-muted-foreground",
                    )}
                  >
                    {p}
                  </span>
                ))}
              </div>

              <div className="space-y-2">
                {order
                  .filter((id) => id !== activeVoter)
                  .map((id) => {
                    const c = cMap.get(id);
                    const given = voterVotes.find((v) => v.receiving_country_id === id)?.points;
                    return (
                      <div key={id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2">
                        {c && <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />}
                        <span className="min-w-[8rem] flex-1 text-sm">{c?.name}</span>
                        <div className="flex flex-wrap gap-1">
                          {POINT_SET.map((p) => (
                            <button
                              key={p}
                              onClick={() => assign(id, p)}
                              className={cn(
                                "numeric h-7 w-7 rounded-md text-[11px] font-semibold transition-colors",
                                given === p
                                  ? "bg-aurora text-primary-foreground"
                                  : "bg-background/60 text-muted-foreground hover:bg-surface-strong",
                              )}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </Panel>
          )}

          {tab === "televote" && (
            <Panel title="Televote entry" description="Total public points per country">
              <div className="space-y-2">
                {order.map((id) => {
                  const c = cMap.get(id);
                  const current = tele.find((t) => t.country_id === id)?.points ?? 0;
                  return (
                    <div key={id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                      {c && <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />}
                      <span className="flex-1 text-sm">{c?.name}</span>
                      <input
                        type="number"
                        min={0}
                        defaultValue={current}
                        onBlur={(e) => setTele(id, Number(e.target.value))}
                        className="numeric w-24 rounded-lg bg-background/60 px-2 py-1.5 text-right text-sm"
                      />
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}

          {tab === "publish" && (
            <Panel title="Save & publish" description="Freeze the standings, then decide who can see them">
              <p className="mb-4 text-sm text-muted-foreground">
                Saving recalculates jury, televote and total points for the {order.length} participants of{" "}
                {activeShow?.name ?? "this sub-event"} and stores the final ranking. The scoreboard stays
                private until the sub-event is published.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={publish}
                  disabled={!activeShowId}
                  className="bg-aurora rounded-xl px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Save scoreboard
                </button>
                {activeShow && (
                  <button
                    onClick={() => toggleShow(activeShow)}
                    className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
                  >
                    {activeShow.published ? "Make private" : "Publish to public"}
                  </button>
                )}
              </div>
            </Panel>
          )}
        </div>

        <Panel title="Live preview" description="Standings from currently entered votes">
          <Scoreboard standings={standings} countries={cMap} compact showSplit />
        </Panel>
      </div>
    </AppShell>
  );
}
