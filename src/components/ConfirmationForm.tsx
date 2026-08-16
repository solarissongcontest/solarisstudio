import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CloudUpload,
  GripVertical,
  Plus,
  Trash2,
  Trophy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  checkEntryDuplicate,
  findMySubmission,
  getRoundAvailability,
  loadDraft,
  lookupSubmission,
  saveDraft,
  submitConfirmation,
  type PublicRound,
} from "@/lib/public.functions";
import { prefillFromSubmission } from "@/lib/prefill";
import {
  clearLocalDraft,
  getBrowserSessionId,
  readLocalDraft,
  writeLocalDraft,
} from "@/lib/session";
import {
  availabilityMessage,
  emptyPayload,
  isValidUrl,
  offsetTimestamp,
  parseTimestamp,
  type AvailabilityReason,
  type ConfirmationPayload,
  type DateType,
} from "@/lib/ssc";

const STEPS = ["Delegation", "Participation", "Selection", "Entry", "Release", "Review"] as const;

type KnownErrorKey =
  | "artist"
  | "country"
  | "country_account"
  | "final_clip_start"
  | "instagram_username"
  | "internal"
  | "nf_date_type"
  | "nf_entries"
  | "nf_name"
  | "nf_result_date_type"
  | "nf_winner_final_clip"
  | "nf_winner_preview"
  | "nf_winner_replacement"
  | "nf_winner_song_url"
  | "preview_start"
  | "replacement_video_url"
  | "reveal_date_type"
  | "selection_method"
  | "song_title"
  | "song_url";

type Errors = Partial<Record<KnownErrorKey, string>> & Record<string, string | undefined>;

function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-sm font-medium">{label}</Label>
      {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      {children}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}

function Choice({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { value: string; label: string; description?: string }[];
  value: string;
  onChange: (value: string) => void;
  columns?: number;
}) {
  return (
    <div className={cn("grid gap-2", columns === 1 ? "grid-cols-1" : "sm:grid-cols-2")}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-lg border px-4 py-3 text-left text-sm transition-all",
            value === option.value
              ? "border-primary bg-primary/10 text-foreground shadow-[0_0_0_1px_var(--color-primary)]"
              : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/50 hover:text-foreground",
          )}
        >
          <span className="block font-medium text-foreground">{option.label}</span>
          {option.description ? <span className="mt-0.5 block text-xs">{option.description}</span> : null}
        </button>
      ))}
    </div>
  );
}

function DateChoice({
  value,
  onChange,
  exact,
  onExact,
  approx,
  onApprox,
  allowImmediate,
  approxPlaceholder,
}: {
  value: string;
  onChange: (value: DateType) => void;
  exact: string;
  onExact: (value: string) => void;
  approx: string;
  onApprox: (value: string) => void;
  allowImmediate?: boolean;
  approxPlaceholder: string;
}) {
  const options = [
    { value: "exact", label: "Select exact date" },
    { value: "approximate", label: "Approximate date" },
    ...(allowImmediate ? [{ value: "immediately", label: "Can be revealed immediately" }] : []),
    { value: "unknown", label: "I don't know yet" },
  ];

  return (
    <div className="space-y-3">
      <Choice options={options} value={value} onChange={(next) => onChange(next as DateType)} />
      {value === "exact" ? (
        <Input type="date" value={exact} onChange={(event) => onExact(event.target.value)} />
      ) : null}
      {value === "approximate" ? (
        <Input value={approx} onChange={(event) => onApprox(event.target.value)} placeholder={approxPlaceholder} />
      ) : null}
    </div>
  );
}

export interface ConfirmationFormProps {
  round: PublicRound;
  editToken?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prefill?: any;
  availability?: AvailabilityReason;
}

function sameWinner(
  data: ConfirmationPayload,
  entry: { artist: string; song_title: string; song_url: string },
) {
  return data.artist === entry.artist && data.song_title === entry.song_title && data.song_url === entry.song_url;
}

export function ConfirmationForm({ round, editToken, prefill, availability }: ConfirmationFormProps) {
  const submit = useServerFn(submitConfirmation);
  const checkDuplicate = useServerFn(checkEntryDuplicate);
  const lookup = useServerFn(lookupSubmission);
  const persistDraft = useServerFn(saveDraft);
  const fetchDraft = useServerFn(loadDraft);
  const findMine = useServerFn(findMySubmission);
  const checkAvailability = useServerFn(getRoundAvailability);

  const [step, setStep] = useState(0);
  const [data, setData] = useState<ConfirmationPayload>(() =>
    prefill ? prefillFromSubmission(prefill, emptyPayload(round.id)) : emptyPayload(round.id),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [duplicateChecks, setDuplicateChecks] = useState<Record<string, "song" | "artist" | null>>({});
  const [duplicateChecking, setDuplicateChecking] = useState<Record<string, boolean>>({});
  const [existingSubmissionId, setExistingSubmissionId] = useState<string | undefined>(
    typeof prefill?.id === "string" ? prefill.id : undefined,
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | "submitted" | "not_participating">(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [editingExisting, setEditingExisting] = useState(Boolean(prefill));
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restored, setRestored] = useState<string | null>(null);

  const sessionId = useMemo(() => getBrowserSessionId(), []);
  const hydrated = useRef(false);
  const dirty = useRef(false);

  const set = <K extends keyof ConfirmationPayload>(key: K, value: ConfirmationPayload[K]) => {
    dirty.current = true;
    setData((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  useEffect(() => {
    if (hydrated.current || editToken) {
      hydrated.current = true;
      return;
    }
    hydrated.current = true;
    let cancelled = false;

    void (async () => {
      const local = readLocalDraft<ConfirmationPayload>(round.id);
      if (local?.payload) {
        setData({ ...local.payload, round_id: round.id });
        setStep(Math.min(local.step ?? 0, STEPS.length - 1));
        setRestored(local.savedAt);
      }

      if (!sessionId) return;

      try {
        const remote = await fetchDraft({
          data: { round_id: round.id, browser_session_id: sessionId },
        });
        if (!cancelled && remote.found && remote.payload_json) {
          const parsed = JSON.parse(remote.payload_json) as { payload?: ConfirmationPayload; step?: number };
          const remoteAt = new Date(remote.updated_at).getTime();
          const localAt = local ? new Date(local.savedAt).getTime() : 0;
          if (parsed.payload && remoteAt > localAt) {
            setData({ ...parsed.payload, round_id: round.id });
            setStep(Math.min(parsed.step ?? 0, STEPS.length - 1));
            setRestored(remote.updated_at);
          }
        }
      } catch {
        // Local draft remains available.
      }

      try {
        const mine = await findMine({
          data: { round_id: round.id, browser_session_id: sessionId },
        });
        if (!cancelled && mine.found && mine.submission) setExistingSubmissionId(mine.submission.id);
      } catch {
        // Ignore.
      }
    })();

    return () => { cancelled = true; };
  }, [editToken, fetchDraft, findMine, round.id, sessionId]);

  const autosave = useCallback(async (payload: ConfirmationPayload, currentStep: number) => {
    writeLocalDraft(round.id, payload, currentStep);
    if (!sessionId || editToken) return;
    setSaving(true);
    try {
      const result = await persistDraft({
        data: {
          round_id: round.id,
          browser_session_id: sessionId,
          payload_json: JSON.stringify({ payload, step: currentStep }),
        },
      });
      if (result.ok) setSavedAt(result.saved_at);
    } catch {
      // Local copy remains.
    } finally {
      setSaving(false);
    }
  }, [editToken, persistDraft, round.id, sessionId]);

  useEffect(() => {
    if (!hydrated.current || !dirty.current || done) return;
    const timer = window.setTimeout(() => void autosave(data, step), 1200);
    return () => window.clearTimeout(timer);
  }, [autosave, data, done, step]);

  function duplicateMessage(type: "song" | "artist" | null) {
    if (type === "song") return "This song has already been used in Solaris Song Contest and cannot be submitted again.";
    if (type === "artist") return "This artist has already been submitted for another country in this edition.";
    return null;
  }

  function normalizeEntryText(value: string) {
    return value.normalize("NFKC").toLocaleLowerCase().trim().replace(/[\s\p{P}]+/gu, "");
  }

  useEffect(() => {
    if (step !== 3 || data.selection_method !== "internal" || data.entry_unknown) return;
    const artist = data.artist.trim();
    const title = data.song_title.trim();
    const url = data.song_url.trim();
    if (!artist && !title && !url) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setDuplicateChecking((current) => ({ ...current, internal: true }));
      try {
        const result = await checkDuplicate({
          data: {
            edition_id: round.edition_id,
            ...(existingSubmissionId ? { submission_id: existingSubmissionId } : {}),
            artist,
            song_title: title,
            song_url: url,
          },
        });
        if (!cancelled) {
          setDuplicateChecks((current) => ({
            ...current,
            internal: result.ok && result.duplicate ? result.type : null,
          }));
        }
      } finally {
        if (!cancelled) setDuplicateChecking((current) => ({ ...current, internal: false }));
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [checkDuplicate, data.artist, data.entry_unknown, data.selection_method, data.song_title, data.song_url, existingSubmissionId, round.edition_id, step]);

  useEffect(() => {
    if (step !== 3 || data.selection_method !== "national_final" || data.nf_entries_unknown) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const next: Record<string, "song" | "artist" | null> = {};
      for (let i = 0; i < data.nf_entries.length; i += 1) {
        const entry = data.nf_entries[i]!;
        const artist = entry.artist.trim();
        const title = entry.song_title.trim();
        const url = entry.song_url.trim().toLowerCase();
        let local: "song" | "artist" | null = null;

        for (let j = 0; j < data.nf_entries.length; j += 1) {
          if (i === j) continue;
          const other = data.nf_entries[j]!;
          if (
            normalizeEntryText(artist) && normalizeEntryText(title) &&
            normalizeEntryText(artist) === normalizeEntryText(other.artist) &&
            normalizeEntryText(title) === normalizeEntryText(other.song_title)
          ) local = "song";
          if (url && url === other.song_url.trim().toLowerCase()) local = "song";
        }

        if (local === "song") {
          next[`nf_${i}`] = local;
          continue;
        }

        try {
          const result = await checkDuplicate({
            data: {
              edition_id: round.edition_id,
              ...(existingSubmissionId ? { submission_id: existingSubmissionId } : {}),
              artist,
              song_title: title,
              song_url: url,
            },
          });
          next[`nf_${i}`] = result.ok && result.duplicate ? result.type : local;
        } catch {
          next[`nf_${i}`] = local;
        }
      }
      if (!cancelled) setDuplicateChecks((current) => ({ ...current, ...next }));
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [checkDuplicate, data.nf_entries, data.nf_entries_unknown, data.selection_method, existingSubmissionId, round.edition_id, step]);

  const winnerIndex = data.selection_method === "national_final"
    ? data.nf_entries.findIndex((entry) => sameWinner(data, entry))
    : -1;
  const winner = winnerIndex >= 0 ? data.nf_entries[winnerIndex] ?? null : null;
  const previewEnd = offsetTimestamp(data.preview_start, 25);
  const clipEnd = offsetTimestamp(data.final_clip_start, 90);

  function selectNfWinner(index: number) {
    if (index < 0) {
      set("artist", "");
      set("song_title", "");
      set("song_url", "");
      set("preview_start", "");
      set("preview_end", "");
      set("final_clip_start", "");
      set("final_clip_end", "");
      set("replacement_video_required", false);
      set("replacement_video_url", "");
      return;
    }
    const entry = data.nf_entries[index];
    if (!entry) return;
    set("artist", entry.artist);
    set("song_title", entry.song_title);
    set("song_url", entry.song_url);
    if (winnerIndex !== index) {
      set("preview_start", "");
      set("preview_end", "");
      set("final_clip_start", "");
      set("final_clip_end", "");
      set("replacement_video_required", false);
      set("replacement_video_url", "");
    }
  }

  function updateNfEntry(index: number, patch: { artist?: string; song_title?: string; song_url?: string }) {
    const list = [...data.nf_entries];
    const old = list[index];
    if (!old) return;
    const wasWinner = sameWinner(data, old);
    const updated = { ...old, ...patch };
    list[index] = updated;
    set("nf_entries", list);
    if (wasWinner) {
      set("artist", updated.artist);
      set("song_title", updated.song_title);
      set("song_url", updated.song_url);
    }
  }

  function validate(current: number) {
    const next: Errors = {};
    if (current === 0) {
      if (!data.instagram_username.trim()) next.instagram_username = "Instagram username is required.";
      if (!data.country.trim()) next.country = "Country is required.";
      if (data.has_country_account && !data.country_account.trim()) next.country_account = "Add the delegation account.";
    }
    if (current === 2 && !data.selection_method) next.selection_method = "Choose a selection method.";

    if (current === 3 && data.selection_method === "internal" && !data.entry_unknown) {
      if (!data.artist.trim()) next.artist = "Artist is required.";
      if (!data.song_title.trim()) next.song_title = "Song title is required.";
      if (!isValidUrl(data.song_url)) next.song_url = "Enter a valid song link.";
      if (parseTimestamp(data.preview_start) === null) next.preview_start = "Enter an MM:SS timestamp.";
      if (parseTimestamp(data.final_clip_start) === null) next.final_clip_start = "Enter an MM:SS timestamp.";
      if (data.replacement_video_required && !isValidUrl(data.replacement_video_url)) next.replacement_video_url = "Enter a valid replacement video link.";
      if (duplicateChecks["internal"] === "song") next.song_title = duplicateMessage("song")!;
      if (duplicateChecks["internal"] === "artist") next.artist = duplicateMessage("artist")!;
    }

    if (current === 3 && data.selection_method === "national_final") {
      if (!data.nf_name.trim()) next.nf_name = "National Final name is required.";
      if (!data.nf_entries_unknown) {
        if (data.nf_entries.length === 0) next.nf_entries = "Add at least one National Final entry.";
        data.nf_entries.forEach((entry, index) => {
          if (!entry.artist.trim() || !entry.song_title.trim()) next[`nf_entry_${index}`] = "Artist and song title are required.";
          else if (entry.song_url.trim() && !isValidUrl(entry.song_url)) next[`nf_entry_${index}`] = "Enter a valid song link.";
          else if (duplicateChecks[`nf_${index}`]) next[`nf_entry_${index}`] = duplicateMessage(duplicateChecks[`nf_${index}`] ?? null)!;
        });
        if (winner) {
          if (!isValidUrl(data.song_url)) next.nf_winner_song_url = "The winning song needs a valid song link.";
          if (parseTimestamp(data.preview_start) === null) next.nf_winner_preview = "Enter the 25-second preview start as MM:SS.";
          if (parseTimestamp(data.final_clip_start) === null) next.nf_winner_final_clip = "Enter the 90-second clip start as MM:SS.";
          if (data.replacement_video_required && !isValidUrl(data.replacement_video_url)) next.nf_winner_replacement = "Enter a valid replacement video URL.";
        }
      }
      if (!data.nf_date_type) next.nf_date_type = "Choose when the National Final will finish.";
      if (data.nf_date_type === "exact" && !data.nf_exact_date) next.nf_date_type = "Pick a date.";
      if (data.nf_date_type === "approximate" && !data.nf_approximate_text.trim()) next.nf_date_type = "Describe the approximate date.";
      if (!data.nf_result_date_type) next.nf_result_date_type = "Choose when the winner will be known.";
    }
    if (current === 4 && !data.reveal_date_type) next.reveal_date_type = "Choose a release option.";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function next() {
    if (!validate(step)) return;
    if (step === 0 && !editToken) {
      setBusy(true);
      try {
        const result = await lookup({ data: { round_id: round.id, country: data.country } });
        if (result.exists && !result.canEdit) {
          setBlocked("A confirmation for this country already exists.");
          return;
        }
        if (result.exists && result.canEdit && result.submission) {
          setEditingExisting(true);
          setData((current) => prefillFromSubmission(result.submission, current));
        }
      } finally {
        setBusy(false);
      }
    }
    if (step === 1 && !data.participating) {
      await send(false);
      return;
    }
    if (step === 2 && data.selection_method === "unknown") {
      setStep(4);
      return;
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function back() {
    if (step === 4 && data.selection_method === "unknown") {
      setStep(2);
      return;
    }
    setStep((current) => Math.max(current - 1, 0));
  }

  async function send(participating: boolean) {
    setBusy(true);
    try {
      if (!editToken && !editingExisting) {
        const avail = await checkAvailability({ data: { round_id: round.id } });
        if (!avail.can_accept) {
          setBlocked(availabilityMessage(avail.reason));
          return;
        }
      }
      const payload = {
        ...data,
        participating,
        preview_end: previewEnd,
        final_clip_end: clipEnd,
        ...(sessionId ? { browser_session_id: sessionId } : {}),
        ...(editToken ? { edit_token: editToken } : {}),
      };
      const result = await submit({ data: payload });
      if (!result.ok) {
        if (result.reason) setBlocked(availabilityMessage(result.reason));
        else if (result.error === "duplicate_song") setBlocked(duplicateMessage("song"));
        else if (result.error === "duplicate_artist") setBlocked(duplicateMessage("artist"));
        else if (result.error === "editing_closed") setBlocked("Submission editing is currently closed.");
        else setBlocked("Something went wrong while saving. Please try again.");
        return;
      }
      dirty.current = false;
      clearLocalDraft(round.id);
      setDone(participating ? "submitted" : "not_participating");
    } finally {
      setBusy(false);
    }
  }

  const liveClosed = availability && availability !== "OPEN" && !editToken && !editingExisting;

  if (blocked) {
    return (
      <div className="surface p-8 text-center">
        <h2 className="text-xl font-semibold">We couldn't continue</h2>
        <p className="mt-3 text-sm text-muted-foreground">{blocked}</p>
        <Button variant="outline" className="mt-6" onClick={() => setBlocked(null)}>Back to form</Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="surface p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
          <Check className="size-6" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold">
          {done === "submitted" ? "Confirmation received" : "Thanks for letting us know"}
        </h2>
      </div>
    );
  }

  if (liveClosed) {
    return (
      <div className="surface p-8 text-center">
        <h2 className="text-xl font-semibold">This round is closed</h2>
        <p className="mt-3 text-sm text-muted-foreground">{availabilityMessage(availability!)}</p>
      </div>
    );
  }

  return (
    <div className="animate-rise space-y-6">
      <div className="space-y-3">
        <div className="flex justify-between text-xs uppercase tracking-widest text-muted-foreground">
          <span>Step {step + 1} — {STEPS[step]}</span>
          {saving ? (
            <span className="flex items-center gap-1 text-accent"><CloudUpload className="size-3.5" />Saving…</span>
          ) : savedAt ? <span>Saved</span> : null}
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5" />
      </div>

      {restored ? <p className="rounded-lg border border-accent/30 bg-accent/10 p-3 text-sm">Your unfinished response was restored.</p> : null}

      <div className="surface space-y-6 p-6 sm:p-8">
        {step === 0 ? (
          <>
            <SectionHeading title="Delegation details" subtitle="Tell us who is submitting." />
            <Field label="Instagram username" error={errors.instagram_username}>
              <Input value={data.instagram_username} onChange={(event) => set("instagram_username", event.target.value)} />
            </Field>
            <Field label="Country" error={errors.country}>
              <Input value={data.country} onChange={(event) => set("country", event.target.value)} />
            </Field>
            <Field label="Does your country have a delegation account?">
              <Choice
                options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
                value={data.has_country_account ? "yes" : "no"}
                onChange={(value) => set("has_country_account", value === "yes")}
              />
            </Field>
            {data.has_country_account ? (
              <Field label="Country account" error={errors.country_account}>
                <Input value={data.country_account} onChange={(event) => set("country_account", event.target.value)} />
              </Field>
            ) : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            <SectionHeading title="Participation" subtitle="Are you participating?" />
            <Choice
              options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
              value={data.participating ? "yes" : "no"}
              onChange={(value) => set("participating", value === "yes")}
            />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <SectionHeading title="Selection method" subtitle="How will your entry be selected?" />
            <Field label="Selection method" error={errors.selection_method}>
              <Choice
                columns={1}
                options={[
                  { value: "internal", label: "Internal Selection" },
                  { value: "national_final", label: "National Final" },
                  { value: "unknown", label: "I don't know yet" },
                ]}
                value={data.selection_method}
                onChange={(value) => {
                  const next = value as ConfirmationPayload["selection_method"];
                  if (next !== data.selection_method) {
                    set("artist", ""); set("song_title", ""); set("song_url", "");
                    set("preview_start", ""); set("preview_end", "");
                    set("final_clip_start", ""); set("final_clip_end", "");
                    set("replacement_video_required", false); set("replacement_video_url", "");
                  }
                  set("selection_method", next);
                }}
              />
            </Field>
          </>
        ) : null}

        {step === 3 && data.selection_method === "internal" ? (
          <>
            <SectionHeading title="Internal selection" subtitle="Your selected entry." />
            <label className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 p-4">
              <span>I don't know my entry yet</span>
              <Switch checked={data.entry_unknown} onCheckedChange={(value) => set("entry_unknown", value)} />
            </label>
            {!data.entry_unknown ? (
              <SongDetails data={data} errors={errors} set={set} previewEnd={previewEnd} clipEnd={clipEnd} />
            ) : null}
          </>
        ) : null}

        {step === 3 && data.selection_method === "national_final" ? (
          <>
            <SectionHeading title="National Final" subtitle="Add the competing songs and, when known, select the winner." />
            <Field label="National Final name" error={errors.nf_name}>
              <Input value={data.nf_name} onChange={(event) => set("nf_name", event.target.value)} />
            </Field>
            <Field label="Expected number of entries">
              <Input type="number" min={1} value={data.expected_entry_count} onChange={(event) => set("expected_entry_count", event.target.value)} />
            </Field>
            <label className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 p-4">
              <span>NF entries not known yet</span>
              <Switch checked={data.nf_entries_unknown} onCheckedChange={(value) => {
                set("nf_entries_unknown", value);
                if (value) selectNfWinner(-1);
              }} />
            </label>

            {!data.nf_entries_unknown ? (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">National Final entries</p>
                    <span className="text-xs text-muted-foreground">{data.nf_entries.length} added</span>
                  </div>
                  {errors.nf_entries ? <p className="text-xs font-medium text-destructive">{errors.nf_entries}</p> : null}
                  {data.nf_entries.map((entry, index) => {
                    const isWinner = winnerIndex === index;
                    return (
                      <div key={index} className={cn("rounded-xl border p-4", isWinner ? "border-accent bg-accent/10" : "border-border bg-secondary/30")}>
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            <GripVertical className="size-3.5" /> Entry {index + 1}
                            {isWinner ? <span className="flex items-center gap-1 font-semibold text-accent"><Trophy className="size-3.5" />Winner</span> : null}
                          </span>
                          <Button type="button" size="sm" variant="ghost" onClick={() => {
                            const removingWinner = isWinner;
                            set("nf_entries", data.nf_entries.filter((_, itemIndex) => itemIndex !== index));
                            if (removingWinner) selectNfWinner(-1);
                          }}><Trash2 className="size-4" /></Button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input placeholder="Artist" value={entry.artist} onChange={(event) => updateNfEntry(index, { artist: event.target.value })} />
                          <Input placeholder="Song title" value={entry.song_title} onChange={(event) => updateNfEntry(index, { song_title: event.target.value })} />
                        </div>
                        <Input className="mt-2" placeholder="Song link (https://)" value={entry.song_url} onChange={(event) => updateNfEntry(index, { song_url: event.target.value })} />
                        {errors[`nf_entry_${index}`] ? <p className="mt-2 text-xs font-medium text-destructive">{errors[`nf_entry_${index}`]}</p> : null}
                        {duplicateChecks[`nf_${index}`] ? <p className="mt-2 text-xs font-medium text-destructive">{duplicateMessage(duplicateChecks[`nf_${index}`] ?? null)}</p> : null}
                      </div>
                    );
                  })}
                  <Button type="button" variant="outline" onClick={() => set("nf_entries", [...data.nf_entries, { artist: "", song_title: "", song_url: "" }])}>
                    <Plus className="size-4" /> Add entry
                  </Button>
                </div>

                {data.nf_entries.length > 0 ? (
                  <div className="space-y-4 border-t border-border pt-6">
                    <SectionHeading title="National Final winner" subtitle="If your National Final has already happened, select the winning song. Otherwise leave it as not known yet." />
                    <Choice
                      columns={1}
                      value={winnerIndex >= 0 ? String(winnerIndex) : "unknown"}
                      options={[
                        { value: "unknown", label: "Winner not known yet" },
                        ...data.nf_entries.map((entry, index) => ({ value: String(index), label: `${entry.artist || "Unknown artist"} — ${entry.song_title || "Untitled"}` })),
                      ]}
                      onChange={(value) => selectNfWinner(value === "unknown" ? -1 : Number(value))}
                    />

                    {winner ? (
                      <div className="space-y-5 rounded-xl border-2 border-accent/50 bg-accent/10 p-5">
                        <div className="flex items-center gap-2">
                          <Trophy className="size-5 text-accent" />
                          <div>
                            <p className="text-xs uppercase tracking-widest text-accent">Winning entry</p>
                            <p className="font-semibold">{winner.artist} — {winner.song_title}</p>
                          </div>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">This remains your National Final winner. It is not converted into an internal selection.</p>
                        <Field label="Winner artist"><Input value={winner.artist} onChange={(event) => updateNfEntry(winnerIndex, { artist: event.target.value })} /></Field>
                        <Field label="Winning song title"><Input value={winner.song_title} onChange={(event) => updateNfEntry(winnerIndex, { song_title: event.target.value })} /></Field>
                        <Field label="Winning song link" error={errors.nf_winner_song_url}><Input value={winner.song_url} onChange={(event) => updateNfEntry(winnerIndex, { song_url: event.target.value })} placeholder="https://" /></Field>
                        <Field label="Post preview timestamp" hint="The 25-second song reveal / social media preview." error={errors.nf_winner_preview}>
                          <Input value={data.preview_start} onChange={(event) => set("preview_start", event.target.value)} placeholder="MM:SS" />
                          {previewEnd ? <p className="text-xs text-accent">Preview: {data.preview_start}–{previewEnd}</p> : null}
                        </Field>
                        <Field label="Final performance clip timestamp" hint="The 90-second clip used in the final." error={errors.nf_winner_final_clip}>
                          <Input value={data.final_clip_start} onChange={(event) => set("final_clip_start", event.target.value)} placeholder="MM:SS" />
                          {clipEnd ? <p className="text-xs text-accent">Clip: {data.final_clip_start}–{clipEnd}</p> : null}
                        </Field>
                        <Field label="Do you need a replacement video for the final clip?">
                          <Choice options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} value={data.replacement_video_required ? "yes" : "no"} onChange={(value) => set("replacement_video_required", value === "yes")} />
                        </Field>
                        {data.replacement_video_required ? (
                          <Field label="Replacement video link" error={errors.nf_winner_replacement}>
                            <Input value={data.replacement_video_url} onChange={(event) => set("replacement_video_url", event.target.value)} placeholder="https://" />
                          </Field>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}

            <Field label="Expected National Final date" error={errors.nf_date_type}>
              <DateChoice
                value={data.nf_date_type}
                onChange={(value) => set("nf_date_type", value)}
                exact={data.nf_exact_date}
                onExact={(value) => set("nf_exact_date", value)}
                approx={data.nf_approximate_text}
                onApprox={(value) => set("nf_approximate_text", value)}
                approxPlaceholder="Late September"
              />
            </Field>
            <Field label="When will the winner be known?" error={errors.nf_result_date_type}>
              <DateChoice
                value={data.nf_result_date_type}
                onChange={(value) => set("nf_result_date_type", value)}
                exact={data.nf_result_exact_date}
                onExact={(value) => set("nf_result_exact_date", value)}
                approx={data.nf_result_approximate_text}
                onApprox={(value) => set("nf_result_approximate_text", value)}
                approxPlaceholder="After the National Final"
              />
            </Field>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <SectionHeading title="Release date" subtitle="When may Solaris publicly reveal your entry?" />
            <Field label="Earliest reveal" error={errors.reveal_date_type}>
              <DateChoice
                value={data.reveal_date_type}
                onChange={(value) => set("reveal_date_type", value)}
                exact={data.reveal_exact_date}
                onExact={(value) => set("reveal_exact_date", value)}
                approx={data.reveal_approximate_text}
                onApprox={(value) => set("reveal_approximate_text", value)}
                allowImmediate
                approxPlaceholder="After the National Final"
              />
            </Field>
          </>
        ) : null}

        {step === 5 ? (
          <>
            <SectionHeading title="Review" subtitle="Check everything before submitting." />
            <ReviewBlock title="Delegation">
              <SummaryRow label="Country" value={data.country} />
              <SummaryRow label="Instagram" value={data.instagram_username} />
              <SummaryRow label="Selection" value={data.selection_method === "internal" ? "Internal Selection" : data.selection_method === "national_final" ? "National Final" : "Unknown"} />
            </ReviewBlock>
            {data.selection_method === "internal" ? (
              <ReviewBlock title="Internal entry">
                <SummaryRow label="Artist" value={data.entry_unknown ? "Not known yet" : data.artist} />
                <SummaryRow label="Song" value={data.entry_unknown ? "Not known yet" : data.song_title} />
              </ReviewBlock>
            ) : null}
            {data.selection_method === "national_final" ? (
              <>
                <ReviewBlock title="National Final">
                  <SummaryRow label="Name" value={data.nf_name} />
                  <SummaryRow label="Entries" value={data.nf_entries_unknown ? "Not known yet" : data.nf_entries.map((entry) => `${entry.artist} — ${entry.song_title}`).join(" · ")} />
                  <SummaryRow label="Winner" value={winner ? `${winner.artist} — ${winner.song_title}` : "Winner not known yet"} />
                </ReviewBlock>
                {winner ? (
                  <ReviewBlock title="NF winner technical details">
                    <SummaryRow label="25s preview" value={`${data.preview_start}–${previewEnd}`} />
                    <SummaryRow label="90s final clip" value={`${data.final_clip_start}–${clipEnd}`} />
                    <SummaryRow label="Replacement video" value={data.replacement_video_required ? data.replacement_video_url : "Not needed"} />
                  </ReviewBlock>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <Button variant="ghost" onClick={back} disabled={step === 0 || busy}><ArrowLeft className="size-4" />Back</Button>
          {step < 5 ? (
            <Button onClick={() => void next()} disabled={busy}>Continue<ArrowRight className="size-4" /></Button>
          ) : (
            <Button onClick={() => void send(true)} disabled={busy}>
              {busy ? "Submitting…" : editingExisting ? "Save changes" : "Submit confirmation"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function SongDetails({
  data,
  errors,
  set,
  previewEnd,
  clipEnd,
}: {
  data: ConfirmationPayload;
  errors: Errors;
  set: <K extends keyof ConfirmationPayload>(key: K, value: ConfirmationPayload[K]) => void;
  previewEnd: string;
  clipEnd: string;
}) {
  return (
    <>
      <Field label="Artist" error={errors.artist}><Input value={data.artist} onChange={(event) => set("artist", event.target.value)} /></Field>
      <Field label="Song title" error={errors.song_title}><Input value={data.song_title} onChange={(event) => set("song_title", event.target.value)} /></Field>
      <Field label="Song link" error={errors.song_url}><Input value={data.song_url} onChange={(event) => set("song_url", event.target.value)} placeholder="https://" /></Field>
      <Field label="Post preview timestamp" error={errors.preview_start}>
        <Input value={data.preview_start} onChange={(event) => set("preview_start", event.target.value)} placeholder="MM:SS" />
        {previewEnd ? <p className="text-xs text-accent">Preview: {data.preview_start}–{previewEnd}</p> : null}
      </Field>
      <Field label="Final performance clip timestamp" error={errors.final_clip_start}>
        <Input value={data.final_clip_start} onChange={(event) => set("final_clip_start", event.target.value)} placeholder="MM:SS" />
        {clipEnd ? <p className="text-xs text-accent">Clip: {data.final_clip_start}–{clipEnd}</p> : null}
      </Field>
      <Field label="Replacement video required?">
        <Choice options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} value={data.replacement_video_required ? "yes" : "no"} onChange={(value) => set("replacement_video_required", value === "yes")} />
      </Field>
      {data.replacement_video_required ? (
        <Field label="Replacement video link" error={errors.replacement_video_url}>
          <Input value={data.replacement_video_url} onChange={(event) => set("replacement_video_url", event.target.value)} placeholder="https://" />
        </Field>
      ) : null}
    </>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h2 className="text-xl font-semibold sm:text-2xl">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{subtitle}</p></div>;
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
      <dl className="space-y-2 text-sm">{children}</dl>
    </div>
  );
}

export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-all text-right font-medium">{value || "—"}</dd>
    </div>
  );
}

export { Textarea };
