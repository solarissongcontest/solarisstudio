import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, LoaderCircle, Music2, ShieldCheck } from "lucide-react";

import { Panel } from "@/components/AppShell";
import { ParticipationRouteChrome, ParticipationServiceShell } from "@/components/ParticipationServiceShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getNextInLineCountries,
  getNextInLineCountry,
  submitNextInLine,
  type NextInLineEdition,
  type NextInLineExistingSubmission,
  type NextInLineNfEntry,
} from "@/lib/confirmation-next-in-line.functions";
import { checkEntryDuplicate } from "@/lib/public.functions";
import { formatEventWallTime } from "@/lib/public-time";
import { isValidUrl, offsetTimestamp, parseTimestamp } from "@/lib/ssc";
import { cn } from "@/lib/utils";

type DuplicateType = "song" | "artist" | null;

type SubmitEvidence = {
  revision: number | null;
  receiptId: string | null;
  replayed: boolean;
  reconciled: boolean;
};

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
        "w-full rounded-xl border px-4 py-3 text-left text-sm transition",
        selected
          ? "border-primary/45 bg-primary/12 text-foreground"
          : "border-border bg-surface text-muted-foreground hover:border-primary/25 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function formatSavedAt(value: string | null) {
  if (!value) return "time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "time unavailable";
  return formatEventWallTime(date, { locale: "en-GB" });
}

function initialLoadError(reason: string | undefined, hasEdition: boolean) {
  if (reason === "authentication") {
    return "Your Solaris session expired while Next in Line was loading. Sign in again before continuing.";
  }
  if (reason === "forbidden" || reason === "ineligible") {
    return "Your current account does not have an eligible delegation for this Next in Line competition.";
  }
  if (!hasEdition) {
    return "There is no active Next in Line competition at the moment.";
  }
  return "Next in Line could not be loaded. Try again after Solaris reconnects.";
}

export function NextInLineCompetition() {
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
  const [existingSubmission, setExistingSubmission] = useState<NextInLineExistingSubmission | null>(null);
  const [editingOpen, setEditingOpen] = useState(false);
  const [submitEvidence, setSubmitEvidence] = useState<SubmitEvidence | null>(null);

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
          const reason = "error" in result && typeof result.error === "string" ? result.error : undefined;
          setError(initialLoadError(reason, Boolean(result.edition)));
          return;
        }
        setEdition(result.edition);
        setCountries((result.countries ?? []).map((item) => item.country));
      } catch {
        if (!cancelled) setError("Next in Line could not be loaded. Try again after Solaris reconnects.");
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
    setExistingSubmission(null);
    setEditingOpen(false);
    setSubmitEvidence(null);
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
        setError("That country is not eligible for this Next in Line competition.");
        return;
      }
      setSourceSubmissionId(result.submission_id);
      setOriginalMethod(result.selection_method ?? "unknown");
      setNfEntries(result.entries ?? []);
      setEditingOpen(result.editing_open === true);

      const existing = result.existing_submission ?? null;
      setExistingSubmission(existing);
      if (existing) {
        setPreviewStart(existing.previewStart ?? "");
        if (existing.selectionType === "national_final") {
          setSelectedNfEntry(existing.nationalFinalEntryId ?? "");
        } else {
          setArtist(existing.artist ?? "");
          setSongTitle(existing.songTitle ?? "");
          setSongUrl(existing.songUrl ?? "");
        }
      }
    } catch {
      setError("That country's selection information could not be loaded.");
    } finally {
      setLoadingCountry(false);
    }
  }

  useEffect(() => {
    if (!sourceSubmissionId || originalMethod === "national_final" || !edition) {
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
  }, [artist, checkDuplicate, edition, originalMethod, songTitle, songUrl, sourceSubmissionId]);

  async function send() {
    setError(null);
    if (!edition || !country || !sourceSubmissionId) {
      setError("Choose your competing country first.");
      return;
    }
    if (!editingOpen) {
      setError("Editing is closed for this Next in Line round. Your saved submission remains visible above.");
      return;
    }

    if (!previewStart.trim() || parseTimestamp(previewStart) === null) {
      setError("Choose the 25-second preview start using MM:SS, for example 01:20.");
      return;
    }

    let selectionType: "internal" | "national_final";
    let nationalFinalEntryId: string | null = null;
    let finalArtist = "";
    let finalSong = "";
    let finalUrl = "";

    if (originalMethod === "national_final") {
      const selected = nfEntries.find((entry) => entry.id === selectedNfEntry);
      if (!selected) {
        setError("Choose one of the songs that did not win your National Final.");
        return;
      }
      selectionType = "national_final";
      nationalFinalEntryId = selected.id;
      finalArtist = selected.artist ?? "";
      finalSong = selected.song_title ?? "";
      finalUrl = selected.song_url ?? "";
    } else {
      if (!artist.trim() || !songTitle.trim() || !songUrl.trim()) {
        setError("Enter the unused artist, song title and song link.");
        return;
      }
      if (!isValidUrl(songUrl)) {
        setError("Enter a valid song link beginning with http:// or https://.");
        return;
      }
      if (duplicate === "song") {
        setError("That song is already an SSC entry and cannot enter Next in Line.");
        return;
      }
      if (duplicate === "artist") {
        setError("That artist is already used by another country in this edition.");
        return;
      }
      selectionType = "internal";
      finalArtist = artist.trim();
      finalSong = songTitle.trim();
      finalUrl = songUrl.trim();
    }

    setSubmitting(true);
    try {
      const result = await submit({
        data: {
          edition_id: edition.id,
          source_submission_id: sourceSubmissionId,
          country,
          participating: true,
          entry_unknown: false,
          selection_type: selectionType,
          national_final_entry_id: nationalFinalEntryId,
          artist: finalArtist,
          song_title: finalSong,
          song_url: finalUrl,
          preview_start: previewStart.trim(),
          preview_end: previewEnd,
        },
      });

      if (result.ok) {
        const evidence = result as {
          revision?: number;
          receiptId?: string;
          operationId?: string;
          replayed?: boolean;
          reconciled?: boolean;
        };
        setSubmitEvidence({
          revision: evidence.revision ?? null,
          receiptId: evidence.receiptId ?? evidence.operationId ?? null,
          replayed: evidence.replayed === true,
          reconciled: evidence.reconciled === true,
        });
        setDone(true);
        return;
      }

      if (result.error === "already_submitted") setError("Your country already submitted a Next in Line entry.");
      else if (result.error === "invalid_nf_entry") setError("That National Final song is not eligible. The winner cannot enter Next in Line.");
      else if (result.error === "duplicate_song") setError("That song is already an SSC entry and cannot enter Next in Line.");
      else if (result.error === "duplicate_artist") setError("That artist is already used by another country in this edition.");
      else if (result.error === "preview_required") setError("Choose the 25-second preview start before submitting.");
      else if (result.error === "state_changed") setError("The Next in Line round changed while you were submitting. Reload the saved state before retrying.");
      else if (result.error === "forbidden") setError("Your current account is not authorized to submit for that delegation.");
      else setError("The Next in Line entry could not be submitted.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Next in Line entry could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ParticipationRouteChrome>
      <ParticipationServiceShell
        service="next-in-line"
        title="Next in Line"
        description="A second competition for songs left behind by countries already competing in the current SSC edition. Enter a song that did not win your National Final or was not chosen in your internal selection."
        maxWidth="max-w-4xl"
      >

      <div className="mx-auto max-w-3xl space-y-4">
        <Panel>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Music2 className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">This is not a confirmation round</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Next in Line does not give countries an SSC place. Only countries already competing in the active edition can enter, and their official SSC entry cannot be submitted here.
              </p>
            </div>
          </div>
        </Panel>

        {loading ? (
          <Panel>
            <div className="py-8 text-center text-sm text-muted-foreground">
              <LoaderCircle className="mx-auto mb-3 size-5 animate-spin" /> Loading Next in Line…
            </div>
          </Panel>
        ) : done ? (
          <Panel>
            <div className="py-6 text-center" data-next-in-line-submit-receipt="">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
                <Check className="size-6" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold">Next in Line entry saved</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                {country}'s song is stored in the canonical Next in Line submission.
              </p>
              {submitEvidence ? (
                <div className="mx-auto mt-4 max-w-lg rounded-xl border border-border bg-surface p-3 text-left text-xs leading-relaxed text-muted-foreground">
                  {submitEvidence.revision ? <p>Revision {submitEvidence.revision}</p> : null}
                  {submitEvidence.receiptId ? (
                    <p className="mt-1 break-all">Receipt: <span className="font-mono text-foreground">{submitEvidence.receiptId}</span></p>
                  ) : null}
                  {submitEvidence.replayed || submitEvidence.reconciled ? (
                    <p className="mt-1">Solaris reconciled this save against the existing server operation, so no duplicate submission was created.</p>
                  ) : null}
                </div>
              ) : null}
              <Button
                variant="outline"
                className="mt-5"
                onClick={() => {
                  setDone(false);
                  void chooseCountry(country);
                }}
              >
                Review saved entry
              </Button>
            </div>
          </Panel>
        ) : (
          <Panel
            title="Enter a song"
            description={edition ? `SSC ${edition.edition_number} · ${edition.name}` : "Current edition"}
          >
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="next-country">Competing country</Label>
                <select
                  id="next-country"
                  value={country}
                  onChange={(event) => void chooseCountry(event.target.value)}
                  className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select country</option>
                  {countries.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  This list comes from your authenticated delegation scope. Selecting a country does not grant submission authority.
                </p>
                {loadingCountry ? <p className="text-xs text-muted-foreground">Loading selection information…</p> : null}
              </div>

              {existingSubmission ? (
                <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4" data-next-in-line-existing-submission="">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">Current saved submission</p>
                    <span className="rounded-full border border-emerald-300/20 px-2 py-1 text-[11px] font-semibold text-emerald-100">
                      Revision {existingSubmission.revision}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-foreground">
                    {existingSubmission.artist ?? "Unknown artist"} — {existingSubmission.songTitle ?? "Unknown song"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Saved {formatSavedAt(existingSubmission.updatedAt ?? existingSubmission.submittedAt)}
                    {existingSubmission.previewStart && existingSubmission.previewEnd
                      ? ` · Preview ${existingSubmission.previewStart}–${existingSubmission.previewEnd}`
                      : ""}
                  </p>
                  {existingSubmission.lastOperationId ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">A canonical operation receipt is linked to this revision.</p>
                  ) : null}
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {editingOpen
                      ? "Editing is open. Saving again creates or reconciles the next canonical revision."
                      : "Editing is closed. This submission remains visible, but Solaris will not offer a browser-only override."}
                  </p>
                </div>
              ) : sourceSubmissionId && !editingOpen ? (
                <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.07] p-3 text-sm text-amber-100">
                  This Next in Line round is not accepting edits right now.
                </div>
              ) : null}

              {sourceSubmissionId && originalMethod === "national_final" ? (
                <div className="space-y-2">
                  <Label>Choose a non-winning National Final song</Label>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    The winning song is excluded automatically because it is already your official SSC entry.
                  </p>
                  {nfEntries.length ? nfEntries.map((entry) => (
                    <Choice key={entry.id} selected={selectedNfEntry === entry.id} onClick={() => setSelectedNfEntry(entry.id)}>
                      <span className="font-semibold text-foreground">{entry.artist ?? "Unknown artist"}</span>
                      <span className="text-muted-foreground"> — {entry.song_title ?? "Unknown song"}</span>
                    </Choice>
                  )) : (
                    <div className="rounded-xl border border-border bg-surface p-3 text-sm text-muted-foreground">
                      No eligible non-winning National Final songs are stored for this country.
                    </div>
                  )}
                </div>
              ) : sourceSubmissionId ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-primary/15 bg-primary/[0.055] p-3 text-xs leading-relaxed text-muted-foreground">
                    Enter an alternative song that was considered but <strong className="text-foreground">not selected</strong> as {country}'s official SSC entry.
                  </div>
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
                  {checkingDuplicate ? <p className="text-xs text-muted-foreground">Checking that this is not the official/used entry…</p> : null}
                  {duplicate ? (
                    <div className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">
                      {duplicate === "song"
                        ? "This song has already been used in SSC and cannot enter Next in Line."
                        : "This artist is already submitted for another country in this edition."}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {sourceSubmissionId ? (
                <div className="space-y-2">
                  <Label htmlFor="next-preview">25-second preview start (MM:SS)</Label>
                  <Input id="next-preview" value={previewStart} onChange={(event) => setPreviewStart(event.target.value)} placeholder="01:20" />
                  {previewEnd ? <p className="text-xs text-muted-foreground">Preview: {previewStart}–{previewEnd}</p> : null}
                </div>
              ) : null}

              {sourceSubmissionId ? (
                <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Solaris checks delegation authority, the active server window and song eligibility again when you save. National Final winners and already-used SSC songs cannot be entered.
                  </p>
                </div>
              ) : null}

              {error ? <div className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">{error}</div> : null}

              {sourceSubmissionId ? (
                <Button className="w-full" disabled={submitting || checkingDuplicate || !editingOpen} onClick={() => void send()}>
                  {submitting
                    ? "Saving…"
                    : existingSubmission
                      ? "Save revised Next in Line entry"
                      : "Submit Next in Line entry"}
                </Button>
              ) : null}
            </div>
          </Panel>
        )}
      </div>
      </ParticipationServiceShell>
    </ParticipationRouteChrome>
  );
}
