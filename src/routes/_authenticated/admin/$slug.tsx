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
  useCountries,
  useEdition,
  useJuryVotes,
  useParticipants,
  useTelevotes,
} from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/$slug")({
  head: () => ({
    meta: [
      { title: "Edition management — Solaris Scoreboard Studio" },
      {
        name: "description",
        content: "Enter jury points, televote totals and participants for a Solaris Song Contest edition.",
      },
      { property: "og:title", content: "Edition management — Solaris Scoreboard Studio" },
      { property: "og:description", content: "Jury and televote entry for an SSC edition." },
    ],
  }),
  component: AdminEdition,
});

type Tab = "participants" | "jury" | "televote" | "publish";

function AdminEdition() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const { data: edition } = useEdition(slug);
  const { data: countries } = useCountries();
  const { data: participants } = useParticipants(edition?.id);
  const { data: jury } = useJuryVotes(edition?.id);
  const { data: tele } = useTelevotes(edition?.id);

  const [tab, setTab] = useState<Tab>("jury");
  const [voter, setVoter] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);

  const cMap = useMemo(() => new Map((countries ?? []).map((c) => [c.id, c])), [countries]);
  const order = (participants ?? []).map((p) => p.country_id);
  const standings = computeStandings(order, jury ?? [], tele ?? []);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["jury_votes"] });
    qc.invalidateQueries({ queryKey: ["televote_votes"] });
    qc.invalidateQueries({ queryKey: ["participants"] });
    qc.invalidateQueries({ queryKey: ["results"] });
  };

  const activeVoter = voter || order[0] || "";
  const voterVotes = (jury ?? []).filter((v) => v.voter_country_id === activeVoter);
  const usedPoints = new Set(voterVotes.map((v) => v.points));

  const assign = async (receiver: string, points: number) => {
    if (!edition) return;
    setMsg(null);
    await supabase
      .from("jury_votes")
      .delete()
      .eq("edition_id", edition.id)
      .eq("voter_country_id", activeVoter)
      .or(`points.eq.${points},receiving_country_id.eq.${receiver}`);
    const { error } = await supabase.from("jury_votes").insert({
      edition_id: edition.id,
      voter_country_id: activeVoter,
      receiving_country_id: receiver,
      points,
    });
    if (error) setMsg(error.message);
    refresh();
  };

  const setTele = async (countryId: string, points: number) => {
    if (!edition) return;
    setMsg(null);
    const existing = (tele ?? []).find((t) => t.country_id === countryId);
    const { error } = existing
      ? await supabase.from("televote_votes").update({ points }).eq("id", existing.id)
      : await supabase
          .from("televote_votes")
          .insert({ edition_id: edition.id, country_id: countryId, points });
    if (error) setMsg(error.message);
    refresh();
  };

  const publish = async () => {
    if (!edition) return;
    setMsg(null);
    await supabase.from("results").delete().eq("edition_id", edition.id);
    const rows = standings.map((s) => ({
      edition_id: edition.id,
      country_id: s.countryId,
      jury_points: s.jury,
      televote_points: s.televote,
      total_points: s.total,
      final_rank: s.rank,
    }));
    const { error } = await supabase.from("results").insert(rows);
    if (!error) await supabase.from("editions").update({ status: "completed" }).eq("id", edition.id);
    setMsg(error ? error.message : "Results published.");
    refresh();
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Organizer studio"
        title={edition?.name ?? "Edition"}
        description="Enter votes country by country. Points are validated so each jury awards each value once."
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

      <div className="mb-6 flex flex-wrap gap-1">
        {(["participants", "jury", "televote", "publish"] as Tab[]).map((t) => (
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
        <div>
          {tab === "participants" && (
            <Panel title="Running order" description="Participants competing in this edition">
              <ul className="space-y-2">
                {(participants ?? []).map((p) => {
                  const c = cMap.get(p.country_id);
                  return (
                    <li key={p.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                      <span className="numeric w-6 text-sm text-muted-foreground">{p.running_order}</span>
                      {c && <FlagChip code={c.short_code} color={c.accent_color} size="sm" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c?.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.artist} — “{p.song}”
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
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
                        {c && <FlagChip code={c.short_code} color={c.accent_color} size="sm" />}
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
                  const current = (tele ?? []).find((t) => t.country_id === id)?.points ?? 0;
                  return (
                    <div key={id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2">
                      {c && <FlagChip code={c.short_code} color={c.accent_color} size="sm" />}
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
            <Panel title="Publish results" description="Freeze the current standings into the results table">
              <p className="mb-4 text-sm text-muted-foreground">
                This recalculates jury, televote and total points for all {order.length} participants,
                stores the final ranking, and marks the edition as completed.
              </p>
              <button
                onClick={publish}
                className="bg-aurora rounded-xl px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Publish final results
              </button>
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
