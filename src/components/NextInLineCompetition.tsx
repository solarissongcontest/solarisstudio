import { useEffect, useMemo, useRef, useState } from "react";
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
  type NextInLineNfEntry,
} from "@/lib/confirmation-next-in-line.functions";
import { checkEntryDuplicate } from "@/lib/public.functions";
import { isValidUrl, offsetTimestamp } from "@/lib/ssc";
import {
  nextInLineDraftFingerprint,
  nextInLineDuplicateKey,
  nextInLineReviewReadiness,
  resolveNextInLineDuplicateCheck,
  type NextInLineDraft,
  type NextInLineDuplicateState,
} from "@/lib/next-in-line-review";
import { cn } from "@/lib/utils";

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

  const [selectedNfEntry, setSelectedNfEntry] = useState("");
  const [artist, setArtist] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [songUrl, setSongUrl] = useState("");
  const [previewStart, setPreviewStart] = useState("");
  const previewEnd = useMemo(() => offsetTimestamp(previewStart, 25), [previewStart]);
  const [duplicateCheck, setDuplicateCheck] = useState<NextInLineDuplicateState | null>(null);
  const [reviewSnapshot, setReviewSnapshot] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const countryRequestId = useRef(0);
  const submittingRef = useRef(false);

  const draft: NextInLineDraft = {
    editionId: edition?.id ?? "",
    sourceSubmissionId,
    country,
    method: originalMethod,
    nationalFinalEntryId: selectedNfEntry,
    eligibleNationalFinalEntryIds: nfEntries.map((entry) => entry.id),
    artist,
    songTitle,
    songUrl,
    previewStart,
    previewEnd,
  };
  const duplicateKey = nextInLineDuplicateKey(draft);
  const currentDuplicateCheck = duplicateCheck?.key === duplicateKey ? duplicateCheck : null;
  const readiness = nextInLineReviewReadiness(draft, currentDuplicateCheck);
  const fingerprint = nextInLineDraftFingerprint(draft);
  const isReviewing = reviewSnapshot === fingerprint;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await loadCountries();
        if (cancelled) return;
        if (!result.ok || !result.edition) {
          setError("There is no active Next in Line competition at the moment.");
          return;
        }
        setEdition(result.edition);
        setCountries((result.countries ?? []).map((item) => item.country));
      } catch {
        if (!cancelled) setError("Next in Line could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCountries, reloadVersion]);

  useEffect(() => () => {
    // Invalidate outstanding country reads if this screen unmounts.
    countryRequestId.current += 1;
  }, []);

  async function chooseCountry(value: string) {
    if (submittingRef.current) return;
    const requestId = ++countryRequestId.current;
    setCountry(value);
    setSourceSubmissionId("");
    setOriginalMethod(null);
    setNfEntries([]);
    setSelectedNfEntry("");
    setArtist("");
    setSongTitle("");
    setSongUrl("");
    setPreviewStart("");
    setDuplicateCheck(null);
    setReviewSnapshot(null);
    setError(null);
    setLoadingCountry(Boolean(edition && value));

    if (!edition || !value) return;

    try {
      const result = await loadCountry({ data: { edition_id: edition.id, country: value } });
      if (requestId !== countryRequestId.current) return;
      if (!result.ok || !result.submission_id || (result.country && result.country !== value)) {
        setError("That country's selection could not be verified. Choose it again to retry.");
        return;
      }
      setSourceSubmissionId(result.submission_id);
      setOriginalMethod(result.selection_method ?? "unknown");
      setNfEntries(result.entries ?? []);
    } catch {
      if (requestId === countryRequestId.current) {
        setError("That country's selection information could not be loaded. Choose it again to retry.");
      }
    } finally {
      if (requestId === countryRequestId.current) setLoadingCountry(false);
    }
  }

  useEffect(() => {
    if (
      !sourceSubmissionId || !edition || !country || originalMethod !== "internal" ||
      !artist.trim() || !songTitle.trim() || !isValidUrl(songUrl)
    ) {
      setDuplicateCheck(null);
      return;
    }

    let cancelled = false;
    const key = duplicateKey;
    setDuplicateCheck({ key, status: "checking" });
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await checkDuplicate({
            data: {
              edition_id: edition.id,
              submission_id: null,
              artist: artist.trim(),
              song_title: songTitle.trim(),
              song_url: songUrl.trim(),
            },
          });
          if (!cancelled) setDuplicateCheck(resolveNextInLineDuplicateCheck(key, result));
        } catch {
          // Failed duplicate checks must never be treated as "no duplicate".
          if (!cancelled) setDuplicateCheck({ key, status: "unavailable" });
        }
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [artist, checkDuplicate, country, duplicateKey, edition, originalMethod, songTitle, songUrl, sourceSubmissionId]);

  async function send() {
    if (submittingRef.current) return;
    setError(null);
    const check = nextInLineReviewReadiness(draft, currentDuplicateCheck);
    if (!check.ready) {
      setError(check.reason);
      setReviewSnapshot(null);
      return;
    }
    if (!isReviewing) {
      setReviewSnapshot(fingerprint);
      return;
    }

    const selected = originalMethod === "national_final"
      ? nfEntries.find((entry) => entry.id === selectedNfEntry)
      : null;
    const selectionType = originalMethod === "national_final" ? "national_final" : "internal";
    if (selectionType === "national_final" && !selected) {
      setError("That National Final song is no longer available. Review your selection again.");
      setReviewSnapshot(null);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await submit({
        data: {
          edition_id: edition!.id,
          source_submission_id: sourceSubmissionId,
          country,
          participating: true,
          entry_unknown: false,
          selection_type: selectionType,
          national_final_entry_id: selected?.id ?? null,
          artist: selected ? selected.artist ?? "" : artist.trim(),
          song_title: selected ? selected.song_title ?? "" : songTitle.trim(),
          song_url: selected ? selected.song_url ?? "" : songUrl.trim(),
          preview_start: previewStart.trim(),
          preview_end: previewEnd,
        },
      });

      if (result.ok) {
        setDone(true);
        return;
      }
      if (result.error === "already_submitted") setError("Your country already submitted a Next in Line entry. Check its status before trying again.");
      else if (result.error === "invalid_nf_entry") setError("That National Final song is not eligible. The winner cannot enter Next in Line.");
      else if (result.error === "duplicate_song") setError("That song is already an SSC entry and cannot enter Next in Line.");
      else if (result.error === "duplicate_artist") setError("That artist is already used by another country in this edition.");
      else if (result.error === "preview_required") setError("Choose a valid 25-second preview start before submitting.");
      else setError("Submission could not be confirmed. Check your country's Next in Line status before trying again.");
    } catch {
      setError("The response was interrupted. Your entry may have been received. Check its status before trying again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      setReviewSnapshot(null);
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
        ) : !edition ? (
          <Panel title="Next in Line is unavailable">
            <p role="status" className="text-sm leading-6 text-muted-foreground">
              {error ?? "No active Next in Line competition is available right now."}
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setError(null);
                setLoading(true);
                setReloadVersion((current) => current + 1);
              }}
            >
              Retry availability
            </Button>
          </Panel>
        ) : done ? (
          <Panel>
            <div className="py-6 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
                <Check className="size-6" />
              </div>
              <h2 className="mt-5 text-2xl font-semibold">Next in Line entry submitted</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
                {country}'s song is saved for the separate Next in Line competition.
              </p>
            </div>
          </Panel>
        ) : (
          <Panel
            title="Enter a song"
            description={edition ? `SSC ${edition.edition_number} · ${edition.name}` : "Current edition"}
          >
            <fieldset disabled={submitting} className="space-y-5">
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
                  The list only contains countries already participating in this SSC edition.
                </p>
                {loadingCountry ? <p role="status" className="text-xs text-muted-foreground">Loading selection information…</p> : null}
                {sourceSubmissionId && originalMethod === "unknown" ? (
                  <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
                    The selection method is not confirmed. Submission stays blocked until country details are verified.
                  </p>
                ) : null}
              </div>

              {sourceSubmissionId && originalMethod === "national_final" ? (
                <div className="space-y-2">
                  <Label>Choose a non-winning National Final song</Label>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    The winning song is excluded automatically because it is already your official SSC entry.
                  </p>
                  {nfEntries.length ? nfEntries.map((entry) => (
                    <Choice key={entry.id} selected={selectedNfEntry === entry.id} onClick={() => { setReviewSnapshot(null); setSelectedNfEntry(entry.id); }}>
                      <span className="font-semibold text-foreground">{entry.artist ?? "Unknown artist"}</span>
                      <span className="text-muted-foreground"> — {entry.song_title ?? "Unknown song"}</span>
                    </Choice>
                  )) : (
                    <div className="rounded-xl border border-border bg-surface p-3 text-sm text-muted-foreground">
                      No eligible non-winning National Final songs are stored for this country.
                    </div>
                  )}
                </div>
              ) : sourceSubmissionId && originalMethod === "internal" ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-primary/15 bg-primary/[0.055] p-3 text-xs leading-relaxed text-muted-foreground">
                    Enter an alternative song that was considered but <strong className="text-foreground">not selected</strong> as {country}'s official SSC entry.
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="next-artist">Artist</Label>
                    <Input id="next-artist" value={artist} onChange={(event) => { setReviewSnapshot(null); setArtist(event.target.value); }} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="next-song">Song title</Label>
                    <Input id="next-song" value={songTitle} onChange={(event) => { setReviewSnapshot(null); setSongTitle(event.target.value); }} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="next-url">Song link</Label>
                    <Input id="next-url" value={songUrl} onChange={(event) => { setReviewSnapshot(null); setSongUrl(event.target.value); }} placeholder="https://…" />
                  </div>
                  {currentDuplicateCheck?.status === "checking" ? (
                    <p role="status" className="text-xs text-muted-foreground">Checking whether this song has already been used…</p>
                  ) : null}
                  {currentDuplicateCheck?.status === "unavailable" ? (
                    <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
                      Song eligibility could not be verified. Edit the song link or reselect the country to retry; submission is blocked until it succeeds.
                    </p>
                  ) : null}
                  {currentDuplicateCheck?.status === "duplicate" ? (
                    <p role="alert" className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-600 dark:text-red-200">
                      {currentDuplicateCheck.type === "song"
                        ? "This song has already been used in SSC and cannot enter Next in Line."
                        : "This artist is already submitted for another country in this edition."}
                    </p>
                  ) : null}
                  {currentDuplicateCheck?.status === "clear" ? (
                    <p role="status" className="text-xs text-muted-foreground">
                      No duplicate found for this song. Final eligibility is rechecked by the server at submission.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {sourceSubmissionId ? (
                <div className="space-y-2">
                  <Label htmlFor="next-preview">25-second preview start (MM:SS)</Label>
                  <Input id="next-preview" value={previewStart} onChange={(event) => { setReviewSnapshot(null); setPreviewStart(event.target.value); }} placeholder="01:20" />
                  {previewEnd ? <p className="text-xs text-muted-foreground">Preview: {previewStart}–{previewEnd}</p> : null}
                </div>
              ) : null}

              {sourceSubmissionId ? (
                <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Solaris checks that the song is eligible. National Final winners and already-used SSC songs cannot be entered.
                  </p>
                </div>
              ) : null}

              {error ? <div role="alert" className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-600 dark:text-red-200">{error}</div> : null}

              {sourceSubmissionId && isReviewing ? (
                <section aria-labelledby="next-in-line-review-title" className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <h3 id="next-in-line-review-title" className="text-lg font-semibold">Review before submitting</h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Verify this country, song and preview. The server, not the browser, records the final entry.
                  </p>
                  <dl className="grid gap-2 text-sm">
                    <div><dt className="text-muted-foreground">Country</dt><dd className="font-semibold">{country}</dd></div>
                    <div><dt className="text-muted-foreground">Artist and song</dt><dd className="font-semibold">
                      {originalMethod === "national_final"
                        ? (() => {
                            const pick = nfEntries.find((entry) => entry.id === selectedNfEntry);
                            return (pick?.artist ?? "Unknown artist") + " · " + (pick?.song_title ?? "Unknown song");
                          })()
                        : artist.trim() + " · " + songTitle.trim()}
                    </dd></div>
                    <div><dt className="text-muted-foreground">Preview</dt><dd className="font-semibold">{previewStart.trim()}–{previewEnd}</dd></div>
                  </dl>
                  <button type="button" className="min-h-11 text-sm font-semibold text-primary underline" onClick={() => setReviewSnapshot(null)}>
                    Back to editing
                  </button>
                </section>
              ) : null}

              {sourceSubmissionId ? (
                <Button className="w-full" disabled={submitting || !readiness.ready} onClick={() => void send()}>
                  {submitting ? "Submitting…" : isReviewing ? "Confirm and submit entry" : "Review entry"}
                </Button>
              ) : null}
              {sourceSubmissionId && !readiness.ready && !error ? (
                <p role="status" className="text-xs leading-5 text-muted-foreground">{readiness.reason}</p>
              ) : null}
            </fieldset>
          </Panel>
        )}
      </div>
      </ParticipationServiceShell>
    </ParticipationRouteChrome>
  );
}
