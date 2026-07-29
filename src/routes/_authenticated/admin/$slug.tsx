import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { CountryPicker } from "@/components/CountryPicker";
import { FlagChip } from "@/components/FlagChip";
import { ScoreboardStage } from "@/components/ScoreboardStage";
import { Field, Select, TextInput } from "@/components/studio/Controls";
import { ThemeEditor } from "@/components/studio/ThemeEditor";
import { VotingEditor } from "@/components/studio/VotingEditor";
import { BroadcastEditor } from "@/components/studio/BroadcastEditor";
import { FastJuryEntry, TelevoteEntry } from "@/components/studio/FastEntry";
import { computeStandings } from "@/lib/analysis";
import { supabase } from "@/integrations/supabase/client";
import {
  SHOW_KINDS,
  useCountries,
  useEdition,
  useJuryVotes,
  useShowParticipants,
  useShows,
  useTelevotes,
  useThemes,
  type Show,
} from "@/lib/data";
import { backgroundStyle, resolveTheme, type ThemeConfig } from "@/lib/theme";
import { resolveVoting, type VotingConfig } from "@/lib/voting";
import { resolveBroadcast, type BroadcastConfig } from "@/lib/broadcast";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/$slug")({
  head: () => ({
    meta: [
      { title: "Edition studio — Solaris Spectacle Suite" },
      {
        name: "description",
        content:
          "Build shows, line-ups, voting systems, scoreboard themes and broadcast settings for a Solaris Song Contest edition.",
      },
      { property: "og:title", content: "Edition studio — Solaris Spectacle Suite" },
      { property: "og:description", content: "Shows, voting systems, themes and fast vote entry." },
    ],
  }),
  component: AdminEdition,
});

const TABS = ["Shows", "Line-up", "Jury", "Televote", "Voting", "Theme", "Broadcast", "Publish"] as const;
type Tab = (typeof TABS)[number];

function AdminEdition() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const { data: edition } = useEdition(slug);
  const { data: countries } = useCountries();
  const { data: shows } = useShows(edition?.id);
  const { data: themes } = useThemes();

  const [tab, setTab] = useState<Tab>("Shows");
  const [showId, setShowId] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [voter, setVoter] = useState<string>("");
  const [showForm, setShowForm] = useState({ name: "", kind: "semi-final", sort_order: 1 });
  const [pickCountry, setPickCountry] = useState<string | null>(null);

  const activeShow = (shows ?? []).find((s) => s.id === showId) ?? (shows ?? [])[0] ?? null;
  const activeShowId = activeShow?.id;

  const { data: participants } = useShowParticipants(activeShowId);
  const { data: jury } = useJuryVotes(activeShowId);
  const { data: tele } = useTelevotes(activeShowId);

  const cList = countries ?? [];
  const cMap = useMemo(() => new Map(cList.map((c) => [c.id, c])), [cList]);
  const pMap = useMemo(() => new Map((participants ?? []).map((p) => [p.country_id, p])), [participants]);
  const order = (participants ?? []).map((p) => p.country_id);

  /* -------- config drafts -------- */
  const savedTheme = useMemo(
    () => resolveTheme((themes ?? []).find((t) => t.id === activeShow?.theme_id)?.config),
    [themes, activeShow?.theme_id],
  );
  const [themeDraft, setThemeDraft] = useState<ThemeConfig>(savedTheme);
  const [voting, setVoting] = useState<VotingConfig>(resolveVoting(activeShow?.voting_config));
  const [broadcast, setBroadcast] = useState<BroadcastConfig>(resolveBroadcast(activeShow?.broadcast_config));

  useEffect(() => {
    setThemeDraft(savedTheme);
  }, [savedTheme]);
  useEffect(() => {
    setVoting(resolveVoting(activeShow?.voting_config));
    setBroadcast(resolveBroadcast(activeShow?.broadcast_config));
    setVoter("");
  }, [activeShowId]); // eslint-disable-line react-hooks/exhaustive-deps

  const standings = computeStandings(order, jury ?? [], tele ?? [], voting);
  const activeVoter = voter && order.includes(voter) ? voter : order[0] || "";

  const refresh = () => {
    ["shows", "show", "participants", "jury_votes", "televote_votes", "results", "themes"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k] }),
    );
  };
  const run = async (p: PromiseLike<{ error: unknown }>, ok?: string) => {
    const { error } = await p;
    setMsg(error ? (error as { message: string }).message : (ok ?? null));
    refresh();
  };

  /* -------- shows -------- */
  const createShow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edition) return;
    await run(
      supabase.from("shows").insert({
        edition_id: edition.id,
        name: showForm.name,
        kind: showForm.kind,
        sort_order: showForm.sort_order,
        published: false,
      }),
    );
    setShowForm({ name: "", kind: showForm.kind, sort_order: showForm.sort_order + 1 });
  };

  const patchShow = (s: Show, values: Record<string, unknown>, ok?: string) =>
    run(supabase.from("shows").update(values).eq("id", s.id), ok);

  const deleteShow = async (s: Show) => {
    if (!window.confirm(`Delete “${s.name}” with all of its participants and votes?`)) return;
    if (showId === s.id) setShowId("");
    await run(supabase.from("shows").delete().eq("id", s.id), `Deleted ${s.name}.`);
  };

  /* -------- line-up -------- */
  const addParticipant = async (countryId: string) => {
    if (!edition || !activeShowId) return;
    await run(
      supabase.from("participants").insert({
        edition_id: edition.id,
        show_id: activeShowId,
        country_id: countryId,
        running_order: order.length + 1,
        semi_final: activeShow?.kind ?? "final",
      }),
    );
    setPickCountry(null);
  };

  const updateParticipant = (id: string, values: Record<string, unknown>) =>
    run(supabase.from("participants").update(values).eq("id", id));

  const removeParticipant = (id: string) => run(supabase.from("participants").delete().eq("id", id));

  /* -------- votes -------- */
  const assign = async (v: string, receiver: string, points: number) => {
    if (!edition || !activeShowId) return;
    await supabase
      .from("jury_votes")
      .delete()
      .eq("show_id", activeShowId)
      .eq("voter_country_id", v)
      .or(`points.eq.${points},receiving_country_id.eq.${receiver}`);
    await run(
      supabase.from("jury_votes").insert({
        edition_id: edition.id,
        show_id: activeShowId,
        voter_country_id: v,
        receiving_country_id: receiver,
        points,
      }),
    );
  };

  const clearPoint = (v: string, points: number) =>
    run(
      supabase
        .from("jury_votes")
        .delete()
        .eq("show_id", activeShowId!)
        .eq("voter_country_id", v)
        .eq("points", points),
    );

  const setTele = async (countryId: string, points: number) => {
    if (!edition || !activeShowId) return;
    const existing = (tele ?? []).find((t) => t.country_id === countryId);
    await run(
      existing
        ? supabase.from("televote_votes").update({ points }).eq("id", existing.id)
        : supabase
            .from("televote_votes")
            .insert({ edition_id: edition.id, show_id: activeShowId, country_id: countryId, points }),
    );
  };

  /* -------- config saves -------- */
  const saveVoting = () =>
    activeShow && patchShow(activeShow, { voting_config: voting }, "Voting system saved.");
  const saveBroadcast = () =>
    activeShow && patchShow(activeShow, { broadcast_config: broadcast }, "Broadcast settings saved.");

  const saveTheme = async () => {
    if (!activeShow) return;
    if (activeShow.theme_id) {
      await run(
        supabase.from("themes").update({ config: themeDraft }).eq("id", activeShow.theme_id),
        "Theme saved.",
      );
      return;
    }
    const { data, error } = await supabase
      .from("themes")
      .insert({ name: `${activeShow.name} theme`, config: themeDraft, is_public: true })
      .select()
      .maybeSingle();
    if (error || !data) {
      setMsg(error?.message ?? "Could not create theme.");
      return;
    }
    await run(supabase.from("shows").update({ theme_id: data.id }).eq("id", activeShow.id), "Theme created.");
  };

  const publishResults = async () => {
    if (!edition || !activeShowId) return;
    await supabase.from("results").delete().eq("show_id", activeShowId);
    const rows = standings.map((s) => ({
      edition_id: edition.id,
      show_id: activeShowId,
      country_id: s.countryId,
      jury_points: s.jury,
      televote_points: s.televote,
      total_points: s.total,
      final_rank: s.rank,
    }));
    await run(supabase.from("results").insert(rows), "Results saved to the archive.");
    if (voting.qualifiers) {
      await Promise.all(
        standings.map((s) =>
          supabase
            .from("participants")
            .update({ qualified: s.rank <= voting.qualifiers! })
            .eq("show_id", activeShowId)
            .eq("country_id", s.countryId),
        ),
      );
      refresh();
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Organizer studio"
        title={edition?.name ?? "Edition"}
        description="Shows, line-ups, voting systems, scoreboard design and broadcast production — all per show."
        actions={
          <>
            <Link to="/admin" className="rounded-lg border border-border px-3 py-2 text-sm">
              ← Studio
            </Link>
            {activeShow && (
              <Link
                to="/broadcast/$showId"
                params={{ showId: activeShow.id }}
                className="bg-aurora rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Broadcast
              </Link>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Show</span>
        <Select
          value={activeShowId ?? ""}
          onChange={(e) => setShowId(e.target.value)}
          className="w-auto min-w-[16rem]"
        >
          {(shows ?? []).length === 0 && <option value="">No shows yet</option>}
          {(shows ?? []).map((s) => (
            <option key={s.id} value={s.id} className="bg-background">
              {s.name} {s.published ? "(public)" : "(private)"}
            </option>
          ))}
        </Select>
        {activeShow && (
          <button
            onClick={() => patchShow(activeShow, { published: !activeShow.published })}
            className="rounded-lg border border-border px-3 py-1.5 text-sm"
          >
            {activeShow.published ? "Make private" : "Publish show"}
          </button>
        )}
      </div>

      <div className="mb-6 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
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
          {tab === "Shows" && (
            <>
              <Panel title="Shows" description="Semi-finals, grand final and any other broadcast">
                <ul className="space-y-2">
                  {(shows ?? []).map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface px-3 py-2">
                      <input
                        type="number"
                        defaultValue={s.sort_order}
                        onBlur={(e) => patchShow(s, { sort_order: Number(e.target.value) || 1 })}
                        className="numeric w-12 rounded-lg bg-background px-2 py-1 text-center text-sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.kind.replace("-", " ")} · {s.published ? "public" : "private"}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowId(s.id)}
                        className="rounded-lg border border-border px-3 py-1.5 text-sm"
                      >
                        Select
                      </button>
                      <button
                        onClick={() => patchShow(s, { published: !s.published })}
                        className="rounded-lg border border-border px-3 py-1.5 text-sm"
                      >
                        {s.published ? "Unpublish" : "Publish"}
                      </button>
                      <button
                        onClick={() => deleteShow(s)}
                        className="rounded-lg border border-destructive/50 px-3 py-1.5 text-sm text-destructive"
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                  {!(shows ?? []).length && (
                    <p className="text-sm text-muted-foreground">No shows yet — create the first one.</p>
                  )}
                </ul>
              </Panel>

              <Panel title="New show">
                <form onSubmit={createShow} className="grid gap-3 sm:grid-cols-3">
                  <Field label="Name" className="sm:col-span-1">
                    <TextInput
                      required
                      value={showForm.name}
                      placeholder="Semi-Final 1"
                      onChange={(e) => setShowForm({ ...showForm, name: e.target.value })}
                    />
                  </Field>
                  <Field label="Kind">
                    <Select
                      value={showForm.kind}
                      onChange={(e) => setShowForm({ ...showForm, kind: e.target.value })}
                    >
                      {SHOW_KINDS.map((k) => (
                        <option key={k} value={k} className="bg-background">
                          {k.replace("-", " ")}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Order">
                    <TextInput
                      type="number"
                      className="numeric"
                      value={showForm.sort_order}
                      onChange={(e) => setShowForm({ ...showForm, sort_order: Number(e.target.value) })}
                    />
                  </Field>
                  <button className="bg-aurora rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground sm:col-span-3">
                    Add show
                  </button>
                </form>
              </Panel>
            </>
          )}

          {tab === "Line-up" && activeShow && (
            <Panel title="Line-up" description="Add countries now, fill artist and song later">
              <div className="mb-4 flex items-end gap-2">
                <CountryPicker
                  className="flex-1"
                  countries={cList}
                  value={pickCountry}
                  exclude={new Set(order)}
                  onChange={(id) => id && addParticipant(id)}
                  placeholder="Search the 66 Terra Solaris nations…"
                />
              </div>
              <ul className="space-y-1.5">
                {(participants ?? []).map((p, i) => {
                  const c = cMap.get(p.country_id);
                  if (!c) return null;
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-2 py-1.5">
                      <input
                        type="number"
                        defaultValue={p.running_order ?? i + 1}
                        onBlur={(e) => updateParticipant(p.id, { running_order: Number(e.target.value) || null })}
                        className="numeric w-12 rounded-lg bg-background px-2 py-1 text-center text-sm"
                      />
                      <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
                      <span className="w-32 shrink-0 truncate text-sm">{c.name}</span>
                      <input
                        defaultValue={p.artist ?? ""}
                        placeholder="Artist"
                        onBlur={(e) => updateParticipant(p.id, { artist: e.target.value || null })}
                        className="min-w-0 flex-1 rounded-lg bg-background px-2 py-1 text-sm"
                      />
                      <input
                        defaultValue={p.song ?? ""}
                        placeholder="Song"
                        onBlur={(e) => updateParticipant(p.id, { song: e.target.value || null })}
                        className="min-w-0 flex-1 rounded-lg bg-background px-2 py-1 text-sm"
                      />
                      <button
                        onClick={() => removeParticipant(p.id)}
                        className="rounded-lg border border-destructive/40 px-2 py-1 text-xs text-destructive"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
                {!order.length && <p className="text-sm text-muted-foreground">No entries yet.</p>}
              </ul>
            </Panel>
          )}

          {tab === "Jury" && activeShow && (
            <Panel title="Fast jury entry" description="Pick a voting country, then type-ahead each award">
              <FastJuryEntry
                countries={cList}
                order={order}
                voting={voting}
                votes={jury ?? []}
                activeVoter={activeVoter}
                onVoterChange={setVoter}
                onAssign={assign}
                onClear={clearPoint}
              />
            </Panel>
          )}

          {tab === "Televote" && activeShow && (
            <Panel title="Televote entry" description="Enter each entry's televote total — press Enter to save">
              <TelevoteEntry countries={cList} order={order} votes={tele ?? []} onSet={setTele} />
            </Panel>
          )}

          {tab === "Voting" && activeShow && (
            <Panel
              title="Voting system"
              description="Point scale, weighting, tie-breaks and qualifiers for this show"
              actions={
                <button
                  onClick={saveVoting}
                  className="bg-aurora rounded-lg px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  Save
                </button>
              }
            >
              <VotingEditor voting={voting} onChange={setVoting} />
            </Panel>
          )}

          {tab === "Theme" && activeShow && (
            <Panel
              title="Scoreboard design"
              description="Background, palette, typography, card and flag geometry, layout"
              actions={
                <button
                  onClick={saveTheme}
                  className="bg-aurora rounded-lg px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  Save theme
                </button>
              }
            >
              <div className="mb-4">
                <Field label="Theme from library" hint="Reuse a saved design across editions">
                  <Select
                    value={activeShow.theme_id ?? ""}
                    onChange={(e) => patchShow(activeShow, { theme_id: e.target.value || null })}
                  >
                    <option value="" className="bg-background">
                      Default Solaris theme
                    </option>
                    {(themes ?? []).map((t) => (
                      <option key={t.id} value={t.id} className="bg-background">
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <ThemeEditor theme={themeDraft} onChange={setThemeDraft} />
            </Panel>
          )}

          {tab === "Broadcast" && activeShow && (
            <Panel
              title="Broadcast production"
              description="Scenes, timing, effects and the spokesperson window"
              actions={
                <button
                  onClick={saveBroadcast}
                  className="bg-aurora rounded-lg px-3 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  Save
                </button>
              }
            >
              <BroadcastEditor config={broadcast} onChange={setBroadcast} />
            </Panel>
          )}

          {tab === "Publish" && activeShow && (
            <Panel title="Publish" description="Save the computed scoreboard, then make the show public">
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">
                  {order.length} entries · {(jury ?? []).length} jury awards · {(tele ?? []).length} televote
                  totals.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={publishResults}
                    className="bg-aurora rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    Save results
                  </button>
                  <button
                    onClick={() => patchShow(activeShow, { published: !activeShow.published })}
                    className="rounded-lg border border-border px-4 py-2 text-sm"
                  >
                    {activeShow.published ? "Make private" : "Make public"}
                  </button>
                  <Link
                    to="/shows/$showId"
                    params={{ showId: activeShow.id }}
                    className="rounded-lg border border-border px-4 py-2 text-sm"
                  >
                    Open public page
                  </Link>
                </div>
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel title="Live preview" description="Exactly how this show's scoreboard renders">
            <div
              className="scroll-slim max-h-[70vh] overflow-y-auto rounded-2xl p-3"
              style={backgroundStyle(themeDraft)}
            >
              <ScoreboardStage
                theme={themeDraft}
                standings={standings}
                countries={cMap}
                participants={pMap}
                qualifiers={voting.qualifiers}
                compact
              />
              {!standings.length && (
                <p className="p-6 text-center text-sm opacity-70">Add entries to see the board.</p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
