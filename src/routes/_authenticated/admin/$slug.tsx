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
  VOTER_KINDS,
  resolveShowVoters,
  voterKey,
  useCountries,
  useEdition,
  useJuryVotes,
  useParticipants,
  useShowParticipants,
  useShows,
  useShowVoters,
  useTelevotes,
  useThemes,
  type Show,
  type Voter,
  type VoterKind,
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

const TABS = ["Shows", "Line-up", "Juries", "Jury", "Televote", "Voting", "Theme", "Broadcast", "Publish"] as const;
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
  const { data: allParticipants } = useParticipants(edition?.id);
  const { data: jury } = useJuryVotes(activeShowId);
  const { data: tele } = useTelevotes(activeShowId);
  const { data: showVoters } = useShowVoters(activeShowId);
  const [voterForm, setVoterForm] = useState<{ kind: VoterKind; countryId: string | null; name: string; flag_image: string; accent_color: string }>({
    kind: "country",
    countryId: null,
    name: "",
    flag_image: "",
    accent_color: "#8888aa",
  });

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
  const voterOptions = useMemo(
    () => resolveShowVoters(showVoters, order, cList),
    [showVoters, order, cList],
  );
  const activeVoter = voter && voterOptions.some((v) => v.key === voter) ? voter : voterOptions[0]?.key || "";

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
    run((supabase.from("shows") as any).update(values).eq("id", s.id), ok);

  const deleteShow = async (s: Show) => {
    if (!window.confirm(`Delete “${s.name}” with all of its participants and votes?`)) return;
    if (showId === s.id) setShowId("");
    await run(supabase.from("shows").delete().eq("id", s.id), `Deleted ${s.name}.`);
  };

  /* -------- line-up -------- */
  const addParticipant = async (countryId: string) => {
    if (!edition || !activeShowId) return;
    // Carry artist & song over from the most recent entry for this country in the edition.
    const prior = (allParticipants ?? [])
      .filter((p) => p.country_id === countryId && p.show_id !== activeShowId && (p.artist || p.song))
      .slice(-1)[0];
    await run(
      supabase.from("participants").insert({
        edition_id: edition.id,
        show_id: activeShowId,
        country_id: countryId,
        running_order: order.length + 1,
        semi_final: activeShow?.kind ?? "final",
        artist: prior?.artist ?? null,
        song: prior?.song ?? null,
      }),
    );
    setPickCountry(null);
  };

  const syncArtistSong = async () => {
    if (!edition) return;
    const byCountry = new Map<string, { artist: string | null; song: string | null }>();
    (allParticipants ?? []).forEach((p) => {
      if (p.artist || p.song) byCountry.set(p.country_id, { artist: p.artist, song: p.song });
    });
    const targets = (allParticipants ?? []).filter((p) => !p.artist && !p.song && byCountry.has(p.country_id));
    if (!targets.length) {
      setMsg("Nothing to sync — every entry already has an artist or song.");
      return;
    }
    await Promise.all(
      targets.map((p) => {
        const src = byCountry.get(p.country_id)!;
        return supabase.from("participants").update({ artist: src.artist, song: src.song }).eq("id", p.id);
      }),
    );
    setMsg(`Synced artist & song for ${targets.length} entr${targets.length === 1 ? "y" : "ies"}.`);
    refresh();
  };

  const updateParticipant = (id: string, values: Record<string, unknown>) =>
    run((supabase.from("participants") as any).update(values).eq("id", id));

  const removeParticipant = (id: string) => run(supabase.from("participants").delete().eq("id", id));

  /* -------- votes -------- */
  const decodeVoterKey = (key: string) => {
    const opt = voterOptions.find((o) => o.key === key);
    return { voterId: opt?.voterId ?? null, countryId: opt?.countryId ?? null };
  };

  const assign = async (v: string, receiver: string, points: number) => {
    if (!edition || !activeShowId) return;
    const { voterId, countryId } = decodeVoterKey(v);
    let del: any = (supabase as any)
      .from("jury_votes")
      .delete()
      .eq("show_id", activeShowId);
    del = voterId ? del.eq("voter_id", voterId) : del.eq("voter_country_id", countryId);
    await del.or(`points.eq.${points},receiving_country_id.eq.${receiver}`);
    await run(
      supabase.from("jury_votes").insert({
        edition_id: edition.id,
        show_id: activeShowId,
        voter_id: voterId,
        voter_country_id: countryId,
        receiving_country_id: receiver,
        points,
      }),
    );
  };

  const clearPoint = (v: string, points: number) => {
    const { voterId, countryId } = decodeVoterKey(v);
    let del: any = (supabase as any)
      .from("jury_votes")
      .delete()
      .eq("show_id", activeShowId!)
      .eq("points", points);
    del = voterId ? del.eq("voter_id", voterId) : del.eq("voter_country_id", countryId);
    return run(del);
  };

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
              <div className="mb-4 flex flex-wrap items-end gap-2">
                <CountryPicker
                  className="min-w-[220px] flex-1"
                  countries={cList}
                  value={pickCountry}
                  exclude={new Set(order)}
                  onChange={(id) => id && addParticipant(id)}
                  placeholder="Search the 66 Terra Solaris nations…"
                />
                <button
                  type="button"
                  onClick={syncArtistSong}
                  className="rounded-xl border border-border bg-surface px-3 py-2 text-sm hover:bg-surface/70"
                  title="Copy artist & song from other shows in this edition into any blank entries"
                >
                  Sync artist &amp; song across shows
                </button>
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

          {tab === "Juries" && activeShow && (
            <Panel
              title="Juries"
              description="Custom voting entities for this show — countries, external juries, organisations or people"
              actions={
                <button
                  onClick={async () => {
                    if (!edition || !activeShowId) return;
                    const existingCountryIds = new Set((showVoters ?? []).map((v) => v.country_id));
                    const rows = order
                      .filter((id) => !existingCountryIds.has(id))
                      .map((id, i) => {
                        const c = cMap.get(id);
                        return {
                          edition_id: edition.id,
                          show_id: activeShowId,
                          country_id: id,
                          name: c?.name ?? "Country",
                          kind: "country",
                          flag_image: c?.flag_image ?? null,
                          accent_color: c?.accent_color ?? "#8888aa",
                          sort_order: (showVoters?.length ?? 0) + i + 1,
                        };
                      });
                    if (!rows.length) {
                      setMsg("All participating countries are already juries.");
                      return;
                    }
                    await run(supabase.from("voters").insert(rows), `Added ${rows.length} country juries.`);
                    qc.invalidateQueries({ queryKey: ["voters"] });
                  }}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm"
                >
                  Add all participating countries
                </button>
              }
            >
              <ul className="mb-4 space-y-1.5">
                {(showVoters ?? []).map((v, i) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-2 py-1.5">
                    <input
                      type="number"
                      defaultValue={v.sort_order ?? i + 1}
                      onBlur={(e) =>
                        run(
                          (supabase.from("voters") as any)
                            .update({ sort_order: Number(e.target.value) || 1 })
                            .eq("id", v.id),
                        ).then(() => qc.invalidateQueries({ queryKey: ["voters"] }))
                      }
                      className="numeric w-12 rounded-lg bg-background px-2 py-1 text-center text-sm"
                    />
                    <FlagChip
                      code={cMap.get(v.country_id ?? "")?.short_code ?? "?"}
                      color={v.accent_color}
                      image={v.flag_image ?? cMap.get(v.country_id ?? "")?.flag_image ?? null}
                      size="sm"
                    />
                    <input
                      defaultValue={v.name}
                      onBlur={(e) =>
                        run((supabase.from("voters") as any).update({ name: e.target.value }).eq("id", v.id)).then(() =>
                          qc.invalidateQueries({ queryKey: ["voters"] }),
                        )
                      }
                      className="min-w-0 flex-1 rounded-lg bg-background px-2 py-1 text-sm"
                    />
                    <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {v.kind.replace("-", " ")}
                    </span>
                    <button
                      onClick={() =>
                        run(supabase.from("voters").delete().eq("id", v.id)).then(() =>
                          qc.invalidateQueries({ queryKey: ["voters"] }),
                        )
                      }
                      className="rounded-lg border border-destructive/40 px-2 py-1 text-xs text-destructive"
                    >
                      ✕
                    </button>
                  </li>
                ))}
                {!(showVoters ?? []).length && (
                  <p className="text-sm text-muted-foreground">
                    No custom juries yet — participating countries will be used as the default voting entities.
                  </p>
                )}
              </ul>

              <div className="space-y-3 rounded-xl border border-border p-3">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Add voter</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Kind">
                    <Select
                      value={voterForm.kind}
                      onChange={(e) => setVoterForm({ ...voterForm, kind: e.target.value as VoterKind, countryId: null, name: "" })}
                    >
                      {VOTER_KINDS.map((k) => (
                        <option key={k} value={k} className="bg-background">
                          {k.replace("-", " ")}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {voterForm.kind === "country" || voterForm.kind === "external-country" ? (
                    <Field label="Country">
                      <CountryPicker
                        countries={voterForm.kind === "country" ? cList.filter((c) => order.includes(c.id)) : cList}
                        value={voterForm.countryId}
                        onChange={(id) => {
                          const c = cList.find((x) => x.id === id);
                          setVoterForm({
                            ...voterForm,
                            countryId: id,
                            name: c?.name ?? "",
                            flag_image: c?.flag_image ?? "",
                            accent_color: c?.accent_color ?? voterForm.accent_color,
                          });
                        }}
                      />
                    </Field>
                  ) : (
                    <Field label="Name">
                      <TextInput
                        value={voterForm.name}
                        onChange={(e) => setVoterForm({ ...voterForm, name: e.target.value })}
                        placeholder="International Jury"
                      />
                    </Field>
                  )}
                  <Field label="Flag / logo URL (optional)">
                    <TextInput
                      value={voterForm.flag_image}
                      onChange={(e) => setVoterForm({ ...voterForm, flag_image: e.target.value })}
                      placeholder="https://…"
                    />
                  </Field>
                  <Field label="Accent colour">
                    <TextInput
                      value={voterForm.accent_color}
                      onChange={(e) => setVoterForm({ ...voterForm, accent_color: e.target.value })}
                    />
                  </Field>
                </div>
                <button
                  onClick={async () => {
                    if (!edition || !activeShowId || !voterForm.name) return;
                    await run(
                      supabase.from("voters").insert({
                        edition_id: edition.id,
                        show_id: activeShowId,
                        country_id: voterForm.countryId,
                        name: voterForm.name,
                        kind: voterForm.kind,
                        flag_image: voterForm.flag_image || null,
                        accent_color: voterForm.accent_color || "#8888aa",
                        sort_order: (showVoters?.length ?? 0) + 1,
                      }),
                      "Voter added.",
                    );
                    qc.invalidateQueries({ queryKey: ["voters"] });
                    setVoterForm({ kind: voterForm.kind, countryId: null, name: "", flag_image: "", accent_color: "#8888aa" });
                  }}
                  className="bg-aurora rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  Add voter
                </button>
              </div>
            </Panel>
          )}

          {tab === "Jury" && activeShow && (
            <Panel title="Fast jury entry" description="Pick a voting country, then type-ahead each award">
              <FastJuryEntry
                voters={voterOptions}
                receivers={cList.filter((c) => order.includes(c.id))}
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
