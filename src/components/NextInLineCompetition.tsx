import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Check,
  History,
  LoaderCircle,
  Music2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { Panel } from "@/components/AppShell";
import {
  ParticipationRouteChrome,
  ParticipationServiceShell,
} from "@/components/ParticipationServiceShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getMyNextInLine,
  getNextInLineCountries,
  submitNextInLine,
  type NextInLineEdition,
} from "@/lib/confirmation-next-in-line.functions";
import { checkEntryDuplicate } from "@/lib/public.functions";
import { isValidUrl, offsetTimestamp, parseTimestamp } from "@/lib/ssc";
import type {
  V3NextInLineContext,
  V3NextInLineProjection,
} from "@/lib/v3-next-in-line";
import { cn } from "@/lib/utils";

type DuplicateType = "song" | "artist" | null;

type PendingAttempt = {
  operationId: string;
  idempotencyKey: string;
  fingerprint: string;
};

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
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

function formatDate(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function stateCopy(projection: V3NextInLineProjection) {
  if (projection.window?.effectiveOpen) return "Submissions are open";
  if (projection.state === "upcoming") return "Submissions have not opened yet";
  if (projection.state === "draft") return "Next in Line is not open yet";
  if (projection.state === "cancelled") return "This Next in Line round was cancelled";
  if (projection.state === "closed") return "Submissions are closed";
  if (projection.state === "unavailable") return "Next in Line is unavailable";
  return "Your submission is recorded";
}

function operationStatus(context: V3NextInLineContext) {
  const status = context.submission?.lastOperation?.status;
  if (!status) return null;
  if (status === "succeeded") return "Receipt confirmed";
  if (status === "pending" || status === "running") return "Receipt reconciling";
  return `Operation ${status}`;
}

export function NextInLineCompetition() {
  const discoverEdition = useServerFn(getNextInLineCountries);
  const loadProjection = useServerFn(getMyNextInLine);
  const submit = useServerFn(submitNextInLine);
  const checkDuplicate = useServerFn(checkEntryDuplicate);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [edition, setEdition] = useState<NextInLineEdition | null>(null);
  const [projection, setProjection] = useState<V3NextInLineProjection | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState("");

  const [selectedNfEntry, setSelectedNfEntry] = useState("");
  const [artist, setArtist] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [songUrl, setSongUrl] = useState("");
  const [previewStart, setPreviewStart] = useState("");
  const previewEnd = useMemo(() => offsetTimestamp(previewStart, 25), [previewStart]);
  const [duplicate, setDuplicate] = useState<DuplicateType>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const pendingAttempt = useRef<PendingAttempt | null>(null);

  const selectedContext = useMemo(
    () => projection?.contexts.find((context) => context.sourceSubmissionId === selectedSourceId) ?? null,
    [projection, selectedSourceId],
  );

  const chooseContext = (context: V3NextInLineContext | null) => {
    setSelectedSourceId(context?.sourceSubmissionId ?? "");
    setSelectedNfEntry(context?.submission?.nationalFinalEntryId ?? "");
    setArtist(context?.submission?.artist ?? "");
    setSongTitle(context?.submission?.songTitle ?? "");
    setSongUrl(context?.submission?.songUrl ?? "");
    setPreviewStart(context?.submission?.previewStart ?? "");
    setDuplicate(null);
    setError(null);
    setNotice(null);
    pendingAttempt.current = null;
  };

  const refreshProjection = async (
    editionId: string,
    preferredSourceId?: string | null,
    applyCanonicalValues = false,
  ) => {
    const next = await loadProjection({ data: { edition_id: editionId } });
    setProjection(next);

    const preferred =
      next.contexts.find((context) => context.sourceSubmissionId === preferredSourceId) ??
      next.contexts[0] ??
      null;

    if (!selectedSourceId || applyCanonicalValues || !next.contexts.some((context) => context.sourceSubmissionId === selectedSourceId)) {
      chooseContext(preferred);
    }
    return { projection: next, preferred };
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const discovery = await discoverEdition();
        if (cancelled) return;
        if (!discovery.ok || !discovery.edition) {
          setError("There is no active Next in Line competition at the moment.");
          return;
        }
        setEdition(discovery.edition);
        const next = await loadProjection({ data: { edition_id: discovery.edition.id } });
        if (cancelled) return;
        setProjection(next);
        chooseContext(next.contexts[0] ?? null);
      } catch (caught) {
        if (!cancelled) {
          console.error("Could not load authoritative Next in Line state", caught);
          setError("Next in Line could not be loaded for your Solaris account.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [discoverEdition, loadProjection]);

  useEffect(() => {
    if (!selectedContext || selectedContext.selectionMethod === "national_final" || !edition) {
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
  }, [artist, checkDuplicate, edition, selectedContext, songTitle, songUrl]);

  async function reconcileAttempt(operationId: string, sourceSubmissionId: string) {
    if (!edition) return false;
    try {
      const next = await loadProjection({ data: { edition_id: edition.id } });
      setProjection(next);
      const context = next.contexts.find((candidate) => candidate.sourceSubmissionId === sourceSubmissionId) ?? null;
      if (context?.submission?.lastOperationId === operationId) {
        chooseContext(context);
        setNotice(`Revision ${context.submission.revision} is confirmed by Solaris.`);
        pendingAttempt.current = null;
        return true;
      }
    } catch (caught) {
      console.error("Next in Line reconciliation read failed", caught);
    }
    return false;
  }

  async function send() {
    setError(null);
    setNotice(null);
    if (!edition || !selectedContext) {
      setError("Choose your competing country first.");
      return;
    }
    if (!projection?.window?.effectiveOpen) {
      setError("Next in Line is not currently open for submissions.");
      return;
    }
    if (!selectedContext.eligible) {
      setError("This country is not currently eligible for Next in Line.");
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

    if (selectedContext.selectionMethod === "national_final") {
      const selected = selectedContext.candidates.find((entry) => entry.id === selectedNfEntry);
      if (!selected) {
        setError("Choose one of the songs that did not win your National Final.");
        return;
      }
      selectionType = "national_final";
      nationalFinalEntryId = selected.id;
      finalArtist = selected.artist ?? "";
      finalSong = selected.songTitle ?? "";
      finalUrl = selected.songUrl ?? "";
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

    const payload = {
      edition_id: edition.id,
      source_submission_id: selectedContext.sourceSubmissionId,
      country: selectedContext.country.name,
      participating: true as const,
      entry_unknown: false as const,
      selection_type: selectionType,
      national_final_entry_id: nationalFinalEntryId,
      artist: finalArtist,
      song_title: finalSong,
      song_url: finalUrl,
      preview_start: previewStart.trim(),
      preview_end: previewEnd,
    };
    const fingerprint = JSON.stringify(payload);
    const existingAttempt = pendingAttempt.current;
    const attempt = existingAttempt?.fingerprint === fingerprint
      ? existingAttempt
      : (() => {
          const operationId = crypto.randomUUID();
          return {
            operationId,
            idempotencyKey: `next-in-line:${operationId}`,
            fingerprint,
          };
        })();
    pendingAttempt.current = attempt;

    setSubmitting(true);
    try {
      const result = await submit({
        data: {
          ...payload,
          operation_id: attempt.operationId,
          idempotency_key: attempt.idempotencyKey,
        },
      });

      if (result.ok) {
        const refreshed = await refreshProjection(
          edition.id,
          selectedContext.sourceSubmissionId,
          true,
        );
        const canonical = refreshed.preferred?.submission;
        setNotice(
          canonical
            ? `Revision ${canonical.revision} confirmed · receipt ${result.receiptId.slice(0, 8)}.`
            : `Submission confirmed · receipt ${result.receiptId.slice(0, 8)}.`,
        );
        pendingAttempt.current = null;
        return;
      }

      if (result.error === "reconciliation_pending" || result.error === "server") {
        const committed = await reconcileAttempt(attempt.operationId, selectedContext.sourceSubmissionId);
        if (!committed) {
          setError("Solaris could not yet prove whether that submission committed. Retry uses the same operation and will not create a duplicate.");
        }
        return;
      }

      pendingAttempt.current = null;
      if (result.error === "not_authenticated") setError("Your Solaris session expired. Sign in again before submitting.");
      else if (result.error === "not_authorized") {
        setError("Your current account no longer controls this delegation for the edition.");
        await refreshProjection(edition.id, selectedContext.sourceSubmissionId, true);
      } else if (result.error === "state_changed") {
        setError("The Next in Line window changed before Solaris accepted the submission.");
        await refreshProjection(edition.id, selectedContext.sourceSubmissionId, true);
      } else if (result.error === "invalid_nf_entry") setError("That National Final song is not eligible. The winner cannot enter Next in Line.");
      else if (result.error === "duplicate_song") setError("That song is already an SSC entry and cannot enter Next in Line.");
      else if (result.error === "duplicate_artist") setError("That artist is already used by another country in this edition.");
      else if (result.error === "preview_required") setError("Choose the 25-second preview start before submitting.");
      else setError("The Next in Line entry could not be submitted safely.");
    } catch (caught) {
      const committed = await reconcileAttempt(attempt.operationId, selectedContext.sourceSubmissionId);
      if (!committed) {
        console.error("Next in Line submit transport failed", caught);
        setError("The connection ended before Solaris could confirm the result. Retry uses the same operation and cannot duplicate the submission.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function manualRefresh() {
    if (!edition) return;
    setRefreshing(true);
    setError(null);
    try {
      await refreshProjection(edition.id, selectedContext?.sourceSubmissionId, true);
    } catch (caught) {
      console.error("Next in Line refresh failed", caught);
      setError("Solaris could not refresh the authoritative submission state.");
    } finally {
      setRefreshing(false);
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
        <div className="mx-auto max-w-3xl space-y-4" data-v3-next-in-line-root="">
          <Panel>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Music2 className="size-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">This is not a confirmation round</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Next in Line does not give countries an SSC place. The countries shown below come from your authenticated delegation authority, not a public country picker.
                </p>
              </div>
            </div>
          </Panel>

          {loading ? (
            <Panel>
              <div className="py-8 text-center text-sm text-muted-foreground" role="status" aria-live="polite">
                <LoaderCircle className="mx-auto mb-3 size-5 animate-spin" /> Loading your Next in Line state…
              </div>
            </Panel>
          ) : !edition || !projection ? (
            <Panel>
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-300" />
                <div>
                  <p className="font-semibold">Next in Line is unavailable</p>
                  <p className="mt-1 text-sm text-muted-foreground">{error ?? "There is no active competition for your account right now."}</p>
                </div>
              </div>
            </Panel>
          ) : (
            <>
              <Panel>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Server-authoritative status</p>
                    <h2 className="mt-1 text-lg font-semibold">{stateCopy(projection)}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {projection.window?.opensAt ? `Opens ${formatDate(projection.window.opensAt)}` : ""}
                      {projection.window?.opensAt && projection.window?.closesAt ? " · " : ""}
                      {projection.window?.closesAt ? `Closes ${formatDate(projection.window.closesAt)}` : ""}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" disabled={refreshing} onClick={() => void manualRefresh()}>
                    <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
              </Panel>

              {!projection.contexts.length ? (
                <Panel>
                  <p className="font-semibold">No authorized delegation is eligible</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    Solaris did not find a country you currently control that is eligible for this edition's Next in Line workflow.
                  </p>
                </Panel>
              ) : (
                <Panel
                  title={selectedContext?.submission ? "Your Next in Line submission" : "Enter a song"}
                  description={`SSC ${edition.edition_number} · ${edition.name}`}
                >
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="next-country">Your eligible delegation</Label>
                      <select
                        id="next-country"
                        value={selectedSourceId}
                        onChange={(event) => {
                          const nextContext = projection.contexts.find(
                            (context) => context.sourceSubmissionId === event.target.value,
                          ) ?? null;
                          chooseContext(nextContext);
                        }}
                        className="flex h-11 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                      >
                        {projection.contexts.map((context) => (
                          <option key={context.sourceSubmissionId} value={context.sourceSubmissionId}>
                            {context.country.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        This list is derived from your authenticated country/delegation authority for this edition.
                      </p>
                    </div>

                    {selectedContext?.submission ? (
                      <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] p-4" data-v3-next-in-line-submission={selectedContext.submission.id}>
                        <div className="flex items-start gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-300/10 text-emerald-200">
                            <Check className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-semibold">Revision {selectedContext.submission.revision} recorded</p>
                              <span className="text-xs text-emerald-200">{operationStatus(selectedContext) ?? "Canonical submission"}</span>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {[selectedContext.submission.artist, selectedContext.submission.songTitle].filter(Boolean).join(" · ")}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {formatDate(selectedContext.submission.updatedAt ?? selectedContext.submission.submittedAt) ?? "Server timestamp unavailable"}
                              {selectedContext.submission.lastOperationId ? ` · receipt ${selectedContext.submission.lastOperationId.slice(0, 8)}` : ""}
                            </p>
                            {selectedContext.submission.history.length > 1 ? (
                              <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <History className="size-3.5" /> {selectedContext.submission.history.length} immutable revisions
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {selectedContext && projection.window?.effectiveOpen ? (
                      <>
                        {selectedContext.selectionMethod === "national_final" ? (
                          <div className="space-y-2">
                            <Label>Choose a non-winning National Final song</Label>
                            <p className="text-[11px] leading-relaxed text-muted-foreground">
                              The authoritative projection excludes the winning song automatically.
                            </p>
                            {selectedContext.candidates.length ? selectedContext.candidates.map((entry) => (
                              <Choice
                                key={entry.id}
                                selected={selectedNfEntry === entry.id}
                                onClick={() => setSelectedNfEntry(entry.id)}
                              >
                                <span className="font-semibold text-foreground">{entry.artist ?? "Unknown artist"}</span>
                                <span className="text-muted-foreground"> — {entry.songTitle ?? "Unknown song"}</span>
                              </Choice>
                            )) : (
                              <div className="rounded-xl border border-border bg-surface p-3 text-sm text-muted-foreground">
                                No eligible non-winning National Final songs are available for this delegation.
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="rounded-xl border border-primary/15 bg-primary/[0.055] p-3 text-xs leading-relaxed text-muted-foreground">
                              Enter an alternative song that was considered but <strong className="text-foreground">not selected</strong> as {selectedContext.country.name}'s official SSC entry.
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
                            {checkingDuplicate ? <p className="text-xs text-muted-foreground">Checking official/used entry conflicts…</p> : null}
                            {duplicate ? (
                              <div className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100">
                                {duplicate === "song"
                                  ? "This song has already been used in SSC and cannot enter Next in Line."
                                  : "This artist is already submitted for another country in this edition."}
                              </div>
                            ) : null}
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label htmlFor="next-preview">25-second preview start (MM:SS)</Label>
                          <Input
                            id="next-preview"
                            value={previewStart}
                            onChange={(event) => setPreviewStart(event.target.value)}
                            placeholder="01:20"
                          />
                          {previewEnd ? <p className="text-xs text-muted-foreground">Preview: {previewStart}–{previewEnd}</p> : null}
                        </div>

                        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
                          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            Solaris re-checks delegation authority, the open window, source eligibility, duplicate song/artist rules and National Final eligibility on the server before accepting any revision.
                          </p>
                        </div>

                        {notice ? (
                          <div className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100" role="status" aria-live="polite">
                            {notice}
                          </div>
                        ) : null}
                        {error ? (
                          <div className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100" role="alert">
                            {error}
                          </div>
                        ) : null}

                        <Button
                          className="w-full"
                          disabled={submitting || checkingDuplicate}
                          onClick={() => void send()}
                        >
                          {submitting
                            ? "Submitting and reconciling…"
                            : selectedContext.submission
                              ? "Save revised Next in Line entry"
                              : "Submit Next in Line entry"}
                        </Button>
                      </>
                    ) : selectedContext ? (
                      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">
                        This submission is read-only while the server-authoritative Next in Line window is not open.
                      </div>
                    ) : null}

                    {!projection.window?.effectiveOpen && error ? (
                      <div className="rounded-xl border border-red-300/20 bg-red-300/10 p-3 text-sm text-red-100" role="alert">
                        {error}
                      </div>
                    ) : null}
                  </div>
                </Panel>
              )}
            </>
          )}
        </div>
      </ParticipationServiceShell>
    </ParticipationRouteChrome>
  );
}
