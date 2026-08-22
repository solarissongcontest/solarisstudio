import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import { useMyCountryAccount } from "@/lib/country-account";
import { editionLabel, useCountries, useEditions } from "@/lib/data";
import {
  useCountryHistoricalNationalFinals,
  useDeleteCountryHistoricalNationalFinal,
  useSaveCountryHistoricalNationalFinal,
  useSetCountryNationalFinalPublication,
  type HistoricalNationalFinalEntryInput,
} from "@/lib/historical-national-finals";

const EMPTY_ENTRY: HistoricalNationalFinalEntryInput = {
  artist: "",
  song_title: "",
  song_url: "",
  next_in_line: false,
  result_position: null,
};

export function HistoricalNationalFinalManager() {
  const [target, setTarget] = useState<Element | null>(null);
  const { data: accountData } = useMyCountryAccount();
  const { data: countries } = useCountries();
  const params = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const overrideId = params?.get("country") ?? null;
  const country =
    accountData?.access?.isOrganizer && overrideId
      ? (countries ?? []).find((item) => item.id === overrideId) ?? accountData?.country
      : accountData?.country;

  useEffect(() => {
    const locate = () => {
      const root = document.querySelector(".app-main");
      if (!root) {
        setTarget(null);
        return;
      }

      const headings = Array.from(root.querySelectorAll("h1,h2,h3"));
      const heading = headings.find((node) => node.textContent?.trim() === "SSC entries");
      const panel = heading?.closest("section") ?? null;
      if (!panel) {
        setTarget(null);
        return;
      }

      let host = panel.querySelector(":scope > [data-historical-nf-host]");
      if (!host) {
        host = document.createElement("div");
        host.setAttribute("data-historical-nf-host", "true");
        panel.appendChild(host);
      }
      setTarget(host);
    };

    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (!target || !country) return null;
  return createPortal(<HistoricalNationalFinalEditor countryId={country.id} />, target);
}

function HistoricalNationalFinalEditor({ countryId }: { countryId: string }) {
  const { data: editions } = useEditions();
  const finalsQuery = useCountryHistoricalNationalFinals(countryId);
  const save = useSaveCountryHistoricalNationalFinal(countryId);
  const remove = useDeleteCountryHistoricalNationalFinal(countryId);
  const publication = useSetCountryNationalFinalPublication(countryId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editionId, setEditionId] = useState("");
  const [name, setName] = useState("");
  const [nfDate, setNfDate] = useState("");
  const [resultDate, setResultDate] = useState("");
  const [entries, setEntries] = useState<HistoricalNationalFinalEntryInput[]>([
    { ...EMPTY_ENTRY },
    { ...EMPTY_ENTRY },
  ]);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [nextInLineIndex, setNextInLineIndex] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const editionMap = useMemo(
    () => new Map((editions ?? []).map((edition) => [edition.id, edition])),
    [editions],
  );

  const reset = () => {
    setEditingId(null);
    setEditionId("");
    setName("");
    setNfDate("");
    setResultDate("");
    setEntries([{ ...EMPTY_ENTRY }, { ...EMPTY_ENTRY }]);
    setWinnerIndex(null);
    setNextInLineIndex(null);
  };

  const startEdit = (nf: NonNullable<typeof finalsQuery.data>[number]) => {
    if (nf.source !== "manual") return;
    setEditingId(nf.id);
    setEditionId(nf.edition_id ?? "");
    setName(nf.name ?? "");
    setNfDate(nf.nf_date ?? "");
    setResultDate(nf.result_date ?? "");
    const rows = nf.entries.length
      ? nf.entries.map((entry) => ({
          artist: entry.artist ?? "",
          song_title: entry.song_title ?? "",
          song_url: entry.song_url ?? "",
          next_in_line: Boolean(entry.next_in_line),
          result_position: entry.result_position ?? null,
        }))
      : [{ ...EMPTY_ENTRY }, { ...EMPTY_ENTRY }];
    setEntries(rows);
    const winner = nf.entries.findIndex((entry) => entry.winner);
    const nextInLine = nf.entries.findIndex((entry) => entry.next_in_line);
    setWinnerIndex(winner >= 0 ? winner : null);
    setNextInLineIndex(nextInLine >= 0 ? nextInLine : null);
    setMessage(null);
  };

  const moveEntry = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= entries.length) return;
    setEntries((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    const moveSelected = (selected: number | null) => {
      if (selected === index) return target;
      if (selected === target) return index;
      return selected;
    };
    setWinnerIndex(moveSelected);
    setNextInLineIndex(moveSelected);
  };

  const saveFinal = async () => {
    setMessage(null);
    try {
      const indexed = entries
        .map((entry, index) => ({
          ...entry,
          next_in_line: nextInLineIndex === index,
          sourceIndex: index,
        }))
        .filter((entry) => entry.artist.trim() || entry.song_title.trim() || entry.song_url?.trim());

      const winningPosition =
        winnerIndex == null
          ? null
          : (() => {
              const position = indexed.findIndex((entry) => entry.sourceIndex === winnerIndex);
              return position >= 0 ? position + 1 : null;
            })();

      const cleaned = indexed.map(({ sourceIndex: _sourceIndex, ...entry }) => entry);

      const savedId = await save.mutateAsync({
        id: editingId,
        editionId,
        name: name.trim(),
        nfDate: nfDate || null,
        resultDate: resultDate || null,
        entries: cleaned,
        winningPosition,
      });
      setMessage(
        editingId
          ? "National final updated. Public line-up and result visibility were kept as they were."
          : "National final saved as private. Publish its line-up when the songs are ready.",
      );
      if (!editingId) {
        await publication.mutateAsync({
          nationalFinalId: savedId,
          lineupPublished: false,
          resultsPublished: false,
        });
      }
      reset();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The national final could not be saved.");
    }
  };

  const setPublication = async (
    nf: NonNullable<typeof finalsQuery.data>[number],
    type: "lineup" | "results",
  ) => {
    setMessage(null);
    try {
      if (type === "lineup") {
        await publication.mutateAsync({
          nationalFinalId: nf.id,
          lineupPublished: !nf.lineup_published,
        });
        setMessage(
          nf.lineup_published
            ? "National-final line-up hidden. Its results were hidden too."
            : "National-final songs and running order published.",
        );
      } else {
        await publication.mutateAsync({
          nationalFinalId: nf.id,
          resultsPublished: !nf.results_published,
        });
        setMessage(
          nf.results_published
            ? "National-final results hidden; the line-up stays public."
            : "National-final results published. The line-up is public too.",
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publication could not be changed.");
    }
  };

  return (
    <div className="mt-6 border-t border-border/70 pt-5">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-primary">National final history</p>
        <h3 className="mt-1 font-display text-lg font-semibold">National finals</h3>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
          Publish the songs and running order first, then release the result separately when it is time. New confirmation selections appear here automatically; older selections can be added below.
        </p>
      </div>

      {(finalsQuery.data ?? []).length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(finalsQuery.data ?? []).map((nf) => {
            const winner = nf.entries.find((entry) => entry.winner);
            const nextInLine = nf.entries.find((entry) => entry.next_in_line);
            return (
              <div key={nf.id} className="flex min-h-full flex-col rounded-xl border border-border bg-background/45 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-primary">
                      {nf.edition_id && editionMap.get(nf.edition_id)
                        ? editionLabel(editionMap.get(nf.edition_id)!)
                        : nf.edition_number
                          ? `SSC ${nf.edition_number}`
                          : "Edition unknown"}
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold">{nf.name || "National final"}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {nf.entries.length} entr{nf.entries.length === 1 ? "y" : "ies"}
                      {winner ? ` · Winner stored` : ""}
                    </p>
                    {nextInLine && <p className="mt-1 text-[11px] text-muted-foreground">Next in Line stored</p>}
                  </div>
                  <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[9px] font-semibold text-muted-foreground">
                    {nf.source === "manual" ? "Added here" : "Confirmation"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${nf.lineup_published ? "border-primary/25 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                    Line-up {nf.lineup_published ? "public" : "private"}
                  </span>
                  <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${nf.results_published ? "border-primary/25 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                    Results {nf.results_published ? "public" : "private"}
                  </span>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
                  <button
                    type="button"
                    disabled={publication.isPending}
                    onClick={() => void setPublication(nf, "lineup")}
                    className="min-h-9 rounded-lg border border-border px-2 text-[10px] font-semibold disabled:opacity-50"
                  >
                    {nf.lineup_published ? "Hide line-up" : "Publish line-up"}
                  </button>
                  <button
                    type="button"
                    disabled={publication.isPending}
                    onClick={() => void setPublication(nf, "results")}
                    className="min-h-9 rounded-lg border border-border px-2 text-[10px] font-semibold disabled:opacity-50"
                  >
                    {nf.results_published ? "Hide results" : "Publish results"}
                  </button>
                </div>

                {nf.source === "manual" && (
                  <div className="mt-2 flex gap-2 border-t border-border/55 pt-2">
                    <button
                      type="button"
                      onClick={() => startEdit(nf)}
                      className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold"
                    >
                      Edit details
                    </button>
                    <button
                      type="button"
                      disabled={remove.isPending}
                      onClick={async () => {
                        if (!window.confirm(`Delete ${nf.name || "this national final"}?`)) return;
                        try {
                          await remove.mutateAsync(nf.id);
                          if (editingId === nf.id) reset();
                        } catch (error) {
                          setMessage(error instanceof Error ? error.message : "The national final could not be deleted.");
                        }
                      }}
                      className="min-h-9 rounded-lg border border-destructive/30 px-3 text-xs font-semibold text-destructive disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-border bg-surface/55 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{editingId ? "Edit previous national final" : "Add previous national final"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Historical selections save privately first, so nothing is accidentally revealed while you are still filling them in.</p>
          </div>
          {editingId && (
            <button type="button" onClick={reset} className="text-xs font-semibold text-muted-foreground">
              Cancel edit
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Edition</span>
            <select
              value={editionId}
              onChange={(event) => setEditionId(event.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              <option value="">Choose edition…</option>
              {(editions ?? []).map((edition) => (
                <option key={edition.id} value={edition.id}>{editionLabel(edition)}</option>
              ))}
            </select>
          </label>
          <Field label="National final name" value={name} onChange={setName} placeholder="Tetlefest 12" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="NF date" type="date" value={nfDate} onChange={setNfDate} />
            <Field label="Result date" type="date" value={resultDate} onChange={setResultDate} />
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Competing entries</p>
              <p className="mt-1 text-[11px] text-muted-foreground">The row order is the NF running order. Result place is separate and can be filled in before results are published.</p>
            </div>
            <button
              type="button"
              onClick={() => setEntries((current) => [...current, { ...EMPTY_ENTRY }])}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold"
            >
              <Plus className="size-3.5" /> Add song
            </button>
          </div>

          {entries.map((entry, index) => (
            <div key={index} className="grid gap-2 rounded-xl border border-border/70 bg-background/45 p-3 sm:grid-cols-[84px_112px_1fr_1fr_auto] sm:items-end">
              <div className="flex gap-1 sm:flex-col">
                <button type="button" disabled={index === 0} onClick={() => moveEntry(index, -1)} aria-label="Move song up" className="grid size-9 place-items-center rounded-lg border border-border disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                <button type="button" disabled={index === entries.length - 1} onClick={() => moveEntry(index, 1)} aria-label="Move song down" className="grid size-9 place-items-center rounded-lg border border-border disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="flex min-h-9 items-center gap-2 text-xs font-semibold">
                  <input
                    type="radio"
                    name="historical-nf-winner"
                    checked={winnerIndex === index}
                    onChange={() => {
                      setWinnerIndex(index);
                      setNextInLineIndex((current) => current === index ? null : current);
                      setEntries((current) => current.map((row, i) => i === index && row.result_position == null ? { ...row, result_position: 1 } : row));
                    }}
                  />
                  Winner
                </label>
                <button
                  type="button"
                  aria-pressed={nextInLineIndex === index}
                  onClick={() => {
                    setNextInLineIndex((current) => current === index ? null : index);
                    if (winnerIndex === index) setWinnerIndex(null);
                  }}
                  className={`min-h-9 rounded-lg border px-2 text-left text-[11px] font-semibold transition-colors ${
                    nextInLineIndex === index
                      ? "border-primary/40 bg-primary/12 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Next in Line
                </button>
              </div>
              <Field
                label="Artist"
                value={entry.artist}
                onChange={(value) => setEntries((current) => current.map((row, i) => i === index ? { ...row, artist: value } : row))}
              />
              <Field
                label="Song"
                value={entry.song_title}
                onChange={(value) => setEntries((current) => current.map((row, i) => i === index ? { ...row, song_title: value } : row))}
              />
              <button
                type="button"
                aria-label="Remove song"
                disabled={entries.length <= 1}
                onClick={() => {
                  setEntries((current) => current.filter((_, i) => i !== index));
                  setWinnerIndex((current) => current == null ? null : current === index ? null : current > index ? current - 1 : current);
                  setNextInLineIndex((current) => current == null ? null : current === index ? null : current > index ? current - 1 : current);
                }}
                className="grid size-10 place-items-center rounded-lg border border-border text-muted-foreground disabled:opacity-30"
              >
                <Trash2 className="size-3.5" />
              </button>
              <label className="sm:col-start-3 sm:col-span-2">
                <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Song link (optional)</span>
                <input
                  value={entry.song_url ?? ""}
                  onChange={(event) => setEntries((current) => current.map((row, i) => i === index ? { ...row, song_url: event.target.value } : row))}
                  placeholder="https://…"
                  className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs"
                />
              </label>
              <label className="sm:col-start-2 sm:row-start-2">
                <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">Result place</span>
                <input
                  type="number"
                  min={1}
                  value={entry.result_position ?? ""}
                  onChange={(event) => setEntries((current) => current.map((row, i) => i === index ? { ...row, result_position: event.target.value ? Math.max(1, Number(event.target.value)) : null } : row))}
                  placeholder="—"
                  className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-xs"
                />
              </label>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={!editionId || !name.trim() || save.isPending}
          onClick={() => void saveFinal()}
          className="mt-4 min-h-11 w-full rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : editingId ? "Save national final changes" : "Save previous national final"}
        </button>
        {message && <p className="mt-3 text-xs text-muted-foreground">{message}</p>}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
      />
    </label>
  );
}
