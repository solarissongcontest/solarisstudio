import "@/confirmations.css";

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getNextInLineCountries,
  getNextInLineCountry,
  submitNextInLine,
  type NextInLineEdition,
  type NextInLineNfEntry,
} from "@/lib/confirmation-next-in-line.functions";
import { checkEntryDuplicate } from "@/lib/public.functions";
import { isValidUrl, offsetTimestamp, parseTimestamp } from "@/lib/ssc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/confirmations/next-in-line")({
  head: () => ({
    meta: [
      { title: "Next in Line — Solaris Studio" },
      { name: "description", content: "Submit a Next in Line response for Solaris Song Contest." },
    ],
  }),
  component: NextInLinePage,
});

type DuplicateType = "song" | "artist" | null;

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border px-4 py-3 text-left text-sm transition",
        selected
          ? "border-sky-200/35 bg-sky-200/10 text-white shadow-[0_0_25px_rgba(125,211,252,0.08)]"
          : "border-white/10 bg-white/[0.035] text-white/58 hover:border-white/20 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function NextInLinePage() {
  const loadCountries = useServerFn(getNextInLineCountries);
  const loadCountry = useServerFn(getNextInLineCountry);
  const submit = useServerFn(submitNextInLine);
  const checkDuplicate = useServerFn(checkEntryDuplicate);

  const [loading, setLoading] = useState(true);
  const [loadingCountry, setLoadingCountry] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [edition, setEdition] = useState<NextInLineEdition | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [country, setCountry] = useState("");
  const [sourceSubmissionId, setSourceSubmissionId] = useState("");
  const [originalMethod, setOriginalMethod] = useState<"internal" | "national_final" | "unknown" | null>(null);
  const [nfEntries, setNfEntries] = useState<NextInLineNfEntry[]>([]);

  const [participating, setParticipating] = useState<boolean | null>(null);
  const [entryUnknown, setEntryUnknown] = useState(false);
  const [selectedNfEntry, setSelectedNfEntry] = useState("");
  const [artist, setArtist] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [songUrl, setSongUrl] = useState("");
  const [previewStart, setPreviewStart] = useState("");
  const previewEnd = useMemo(() => offsetTimestamp(previewStart, 25), [previewStart]);
  const [duplicate, setDuplicate] = useState<DuplicateType>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await loadCountries();
        if (cancelled) return;
        if (!result.ok || !result.edition) {
          setError("There is no active Next in Line selection at the moment.");
          return;
        }
        setEdition(result.edition);
        setCountries((result.countries ?? []).map((item) => item.country));
      } catch {
        if (!cancelled) setError("The Next in Line form could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCountries]);

  async function chooseCountry(value: string) {
    setCountry(value);
    setSourceSubmissionId("");
    setOriginalMethod(null);
    setNfEntries([]);
    setParticipating(null);
    setEntryUnknown(false);
    setSelectedNfEntry("");
    setArtist("");
    setSongTitle("");
    setSongUrl("");
    setPreviewStart("");
    setDuplicate(null);
    setError(null);

    if (!edition || !value) return;

    setLoadingCountry(true);
    try {
      const result = await loadCountry({ data: { edition_id: edition.id, country: value } });
      if (!result.ok || !result.submission_id) {
        setError("That country could not be loaded.");
        return;
      }
      setSourceSubmissionId(result.submission_id);
      setOriginalMethod(result.selection_method ?? "unknown");
      setNfEntries(result.entries ?? []);
    } catch {
      setError("That country's entry information could not be loaded.");
    } finally {
      setLoadingCountry(false);
    }
  }

  useEffect(() => {
    if (
      participating !== true ||
      entryUnknown ||
      originalMethod === "national_final" ||
      !edition
    ) {
      setDuplicate(null);
      return;
    }

    const cleanArtist = artist.trim();
    const cleanSong = songTitle.trim();
    const cleanUrl = songUrl.trim();
    if (cleanArtist.length < 2 && cleanSong.length < 2 && cleanUrl.length < 4) {
      setDuplicate(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setCheckingDuplicate(true);
        try {
          const result = await checkDuplicate({
            data: {
              edition_id: edition.id,
              submission_id: null,
              artist: cleanArtist,
              song_title: cleanSong,
              song_url: cleanUrl,
            },
          });
          if (!cancelled) setDuplicate(result.ok && result.duplicate ? result.type : null);
        } finally {
          if (!cancelled) setCheckingDuplicate(false);
        }
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [artist, checkDuplicate, edition, entryUnknown, originalMethod, participating, songTitle, songUrl]);

  async function send() {
    setError(null);
    if (!edition || !country || !sourceSubmissionId) return setError("Choose your country first.");
    if (participating === null) return setError("Choose whether you would participate as Next in Line.");

    let selectionType: "none" | "unknown" | "internal" | "national_final" = "none";
    let nationalFinalEntryId: string | null = null;
    let finalArtist = "";
    let finalSong = "";
    let finalUrl = "";
    let finalPreviewStart = "";
    let finalPreviewEnd = "";

    if (participating) {
      if (entryUnknown) {
        selectionType = "unknown";
      } else if (originalMethod === "national_final") {
        const selected = nfEntries.find((entry) => entry.id === selectedNfEntry);
        if (!selected) return setError("Choose one of your National Final entries.");
        selectionType = "national_final";
        nationalFinalEntryId = selected.id;
        finalArtist = selected.artist ?? "";
        finalSong = selected.song_title ?? "";
        finalUrl = selected.song_url ?? "";
      } else {
        if (!artist.trim() || !songTitle.trim() || !songUrl.trim()) {
          return setError("Enter the artist, song title and song link.");
        }
        if (!isValidUrl(songUrl)) return setError("Enter a valid song link beginning with http:// or https://.");
        if (duplicate === "song") return setError("This song has already been used and cannot be submitted again.");
        if (duplicate === "artist") return setError("This artist has already been submitted for another country in this edition.");
        if (previewStart.trim() && parseTimestamp(previewStart) === null) {
          return setError("Preview start must use MM:SS, for example 01:20.");
        }
        selectionType = "internal";
        finalArtist = artist.trim();
        finalSong = songTitle.trim();
        finalUrl = songUrl.trim();
        finalPreviewStart = previewStart.trim();
        finalPreviewEnd = previewStart.trim() ? previewEnd : "";
      }
    }

    setSubmitting(true);
    try {
      const result = await submit({
        data: {
          edition_id: edition.id,
          source_submission_id: sourceSubmissionId,
          country,
          participating,
          entry_unknown: participating ? entryUnknown : true,
          selection_type: selectionType,
          national_final_entry_id: nationalFinalEntryId,
          artist: finalArtist,
          song_title: finalSong,
          song_url: finalUrl,
          preview_start: finalPreviewStart,
          preview_end: finalPreviewEnd,
        },
      });

      if (result.ok) {
        setDone(true);
        return;
      }
      if (result.error === "duplicate_song") setError("This song has already been used and cannot be submitted again.");
      else if (result.error === "duplicate_artist") setError("This artist is already used by another country in this edition.");
      else setError("The Next in Line response could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="confirmations-theme min-h-screen">
      <div className="confirmations-backdrop" aria-hidden="true" />
      <main className="relative z-10 mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          to="/confirmations"
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3.5 py-2 text-xs text-white/65 backdrop-blur-xl transition hover:border-white/20 hover:text-white"
        >
          <ArrowLeft className="size-3.5" /> Confirmations
        </Link>

        <header className="my-8 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/65">Participation portal</p>
          <h1 className="confirmations-display mt-3 text-5xl font-normal uppercase leading-none sm:text-6xl">Next in line</h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-white/55">
            Respond if your country is offered a remaining place in the current Solaris Song Contest edition.
          </p>
        </header>

        {loading ? (
          <div className="confirmations-surface p-8 text-center text-sm text-white/55">
            <LoaderCircle className="mx-auto mb-3 size-5 animate-spin" /> Loading Next in Line…
          </div>
        ) : done ? (
          <section className="confirmations-surface p-8 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/10 text-emerald-100">
              <Check className="size-6" />
            </div>
            <h2 className="mt-5 text-2xl font-medium text-white">Response submitted</h2>
            <p className="mt-2 text-sm text-white/52">Your Next in Line response is saved in the same Confirmations system used by the original site.</p>
          </section>
        ) : (
          <section className="confirmations-surface space-y-6 p-5 sm:p-7">
            {edition ? (
              <div className="rounded-xl border border-white/8 bg-black/10 p-3">
                <p className="text-[9px] uppercase tracking-[0.18em] text-white/35">Active edition</p>
                <p className="mt-1 text-sm font-medium text-white">SSC {edition.edition_number} · {edition.name}</p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="next-country">Country</Label>
              <select
                id="next-country"
                value={country}
                onChange={(event) => void chooseCountry(event.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select country</option>
                {countries.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              {loadingCountry ? <p className="text-xs text-white/40">Loading entry information…</p> : null}
            </div>

            {sourceSubmissionId ? (
              <>
                <div className="space-y-2">
                  <Label>Would you participate if offered a place?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Choice selected={participating === true} onClick={() => setParticipating(true)}>Yes, participate</Choice>
                    <Choice selected={participating === false} onClick={() => setParticipating(false)}>No, decline</Choice>
                  </div>
                </div>

                {participating === true ? (
                  <>
                    <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3 text-sm text-white/70">
                      <input
                        type="checkbox"
                        checked={entryUnknown}
                        onChange={(event) => setEntryUnknown(event.target.checked)}
                      />
                      My entry is not known yet
                    </label>

                    {!entryUnknown && originalMethod === "national_final" ? (
                      <div className="space-y-2">
                        <Label>Choose your National Final entry</Label>
                        {nfEntries.length ? nfEntries.map((entry) => (
                          <Choice key={entry.id} selected={selectedNfEntry === entry.id} onClick={() => setSelectedNfEntry(entry.id)}>
                            <span className="font-medium text-white">{entry.artist ?? "Unknown artist"}</span>
                            <span className="text-white/45"> — {entry.song_title ?? "Unknown song"}</span>
                          </Choice>
                        )) : <p className="text-sm text-white/45">No National Final entries are available.</p>}
                      </div>
                    ) : !entryUnknown ? (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="next-artist">Artist</Label>
                          <Input id="next-artist" value={artist} onChange={(event) => setArtist(event.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="next-song">Song title</Label>
                          <Input id="next-song" value={songTitle} onChange={(event) => setSongTitle(event.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="next-url">Song link</Label>
                          <Input id="next-url" value={songUrl} onChange={(event) => setSongUrl(event.target.value)} placeholder="https://…" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="next-preview">Preview start (MM:SS)</Label>
                          <Input id="next-preview" value={previewStart} onChange={(event) => setPreviewStart(event.target.value)} placeholder="01:20" />
                          {previewEnd ? <p className="text-xs text-white/40">Preview end: {previewEnd}</p> : null}
                        </div>
                        {checkingDuplicate ? <p className="text-xs text-white/40">Checking entry…</p> : null}
                        {duplicate ? (
                          <div className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">
                            {duplicate === "song"
                              ? "This song has already been used in Solaris Song Contest."
                              : "This artist has already been submitted for another country in this edition."}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}

                {error ? <div className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">{error}</div> : null}

                {participating !== null ? (
                  <Button className="w-full" disabled={submitting || checkingDuplicate} onClick={() => void send()}>
                    {submitting ? "Submitting…" : "Submit Next in Line response"}
                  </Button>
                ) : null}
              </>
            ) : error ? (
              <div className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">{error}</div>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}
