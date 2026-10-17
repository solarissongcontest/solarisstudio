import { CheckCircle2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { PublicRound } from "@/lib/public.functions";
import {
  submitMaintenanceConfirmation,
  type MaintenanceConfirmationSubmitResult,
} from "@/lib/maintenance-confirmation-editor";
import { prefillFromSubmission } from "@/lib/prefill";
import { getBrowserSessionId } from "@/lib/session";
import {
  emptyPayload,
  isValidUrl,
  offsetTimestamp,
  parseTimestamp,
  type ConfirmationPayload,
  type DateType,
} from "@/lib/ssc";

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{label}</Label>
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
      {children}
      {error ? <p className="text-xs font-semibold text-destructive">{error}</p> : null}
    </div>
  );
}

function Section({
  title,
  description,
  children,
  open = false,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details className="data-panel group overflow-hidden" open={open}>
      <summary className="cursor-pointer list-none px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold tracking-[-.02em]">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          </div>
          <span className="text-lg text-primary transition-transform group-open:rotate-45" aria-hidden="true">+</span>
        </div>
      </summary>
      <div className="space-y-5 border-t border-border/70 px-4 py-5 sm:px-5">{children}</div>
    </details>
  );
}

function DateEditor({
  label,
  value,
  exact,
  approximate,
  allowImmediate = false,
  onType,
  onExact,
  onApproximate,
}: {
  label: string;
  value: DateType | "";
  exact: string;
  approximate: string;
  allowImmediate?: boolean;
  onType: (value: DateType | "") => void;
  onExact: (value: string) => void;
  onApproximate: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        className="min-h-11 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm text-foreground outline-none focus:border-primary"
        value={value}
        onChange={(event) => onType(event.target.value as DateType | "")}
      >
        <option value="">Choose an option</option>
        <option value="exact">Exact date</option>
        <option value="approximate">Approximate date</option>
        {allowImmediate ? <option value="immediately">Can be revealed immediately</option> : null}
        <option value="unknown">Not known yet</option>
      </select>
      {value === "exact" ? (
        <Input type="date" value={exact} onChange={(event) => onExact(event.target.value)} />
      ) : null}
      {value === "approximate" ? (
        <Input
          value={approximate}
          onChange={(event) => onApproximate(event.target.value)}
          placeholder="Describe the approximate date"
        />
      ) : null}
    </Field>
  );
}

function resultMessage(result: MaintenanceConfirmationSubmitResult) {
  if (result.error === "duplicate_song") return "This song is already ineligible as a duplicate.";
  if (result.error === "duplicate_artist") return "This artist is already submitted for another country in this edition.";
  if (result.error === "editing_closed") return "TSBC has closed editing for this response. Return to the maintenance page to refresh its status.";
  if (result.error === "confirmation_already_complete") return "This Confirmation no longer accepts this edit. Return to the maintenance page and refresh its current status.";
  if (result.error === "submission_uncertain") return "Solaris could not yet prove whether this exact edit committed. Do not create another submission. Return to the maintenance page and refresh the existing Confirmation before trying anything else.";
  return "Solaris could not save these changes. Your existing Confirmation has not been replaced.";
}

export function MaintenanceConfirmationEditor({
  round,
  submission,
  editToken,
}: {
  round: PublicRound;
  submission: Record<string, unknown>;
  editToken: string;
}) {
  const [data, setData] = useState<ConfirmationPayload>(() =>
    prefillFromSubmission(submission, emptyPayload(round.id)),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState<MaintenanceConfirmationSubmitResult | null>(null);

  const winnerIndex = useMemo(() => {
    if (data.selection_method !== "national_final") return -1;
    return data.nf_entries.findIndex(
      (entry) =>
        entry.artist === data.artist &&
        entry.song_title === data.song_title &&
        entry.song_url === data.song_url,
    );
  }, [data.artist, data.nf_entries, data.selection_method, data.song_title, data.song_url]);

  function set<K extends keyof ConfirmationPayload>(key: K, value: ConfirmationPayload[K]) {
    setData((current) => ({ ...current, [key]: value }));
    setFailure(null);
    setErrors((current) => {
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  function updateNfEntry(index: number, patch: Partial<ConfirmationPayload["nf_entries"][number]>) {
    setData((current) => {
      const entries = [...current.nf_entries];
      const previous = entries[index];
      if (!previous) return current;
      const wasWinner =
        previous.artist === current.artist &&
        previous.song_title === current.song_title &&
        previous.song_url === current.song_url;
      const updated = { ...previous, ...patch };
      entries[index] = updated;
      return {
        ...current,
        nf_entries: entries,
        ...(wasWinner
          ? { artist: updated.artist, song_title: updated.song_title, song_url: updated.song_url }
          : {}),
      };
    });
    setFailure(null);
  }

  function chooseWinner(index: number) {
    const entry = data.nf_entries[index];
    if (!entry) {
      setData((current) => ({
        ...current,
        artist: "",
        song_title: "",
        song_url: "",
        preview_start: "",
        preview_end: "",
        final_clip_start: "",
        final_clip_end: "",
        replacement_video_required: false,
        replacement_video_url: "",
      }));
      return;
    }
    setData((current) => ({
      ...current,
      artist: entry.artist,
      song_title: entry.song_title,
      song_url: entry.song_url,
    }));
  }

  function validate() {
    const next: Record<string, string> = {};
    if (!data.instagram_username.trim()) next.instagram_username = "Instagram username is required.";
    if (!data.country.trim()) next.country = "Country is required.";
    if (!data.selection_method) next.selection_method = "Choose the selection method.";

    if (data.selection_method === "internal" && !data.entry_unknown) {
      if (!data.artist.trim()) next.artist = "Artist is required.";
      if (!data.song_title.trim()) next.song_title = "Song title is required.";
      if (!isValidUrl(data.song_url)) next.song_url = "Enter a valid song link.";
      if (parseTimestamp(data.preview_start) === null) next.preview_start = "Enter an MM:SS timestamp.";
      if (parseTimestamp(data.final_clip_start) === null) next.final_clip_start = "Enter an MM:SS timestamp.";
      if (data.replacement_video_required && !isValidUrl(data.replacement_video_url)) {
        next.replacement_video_url = "Enter a valid replacement video link.";
      }
    }

    if (data.selection_method === "national_final") {
      if (!data.nf_name.trim()) next.nf_name = "National Final name is required.";
      if (!data.nf_entries_unknown && data.nf_entries.length === 0) {
        next.nf_entries = "Add at least one National Final entry.";
      }
      if (!data.nf_entries_unknown) {
        data.nf_entries.forEach((entry, index) => {
          if (!entry.artist.trim() || !entry.song_title.trim()) {
            next[`nf_${index}`] = "Artist and song title are required.";
          } else if (entry.song_url.trim() && !isValidUrl(entry.song_url)) {
            next[`nf_${index}`] = "Enter a valid song link.";
          }
        });
      }
      if (!data.nf_date_type) next.nf_date_type = "Choose a National Final date option.";
      if (!data.nf_result_date_type) next.nf_result_date_type = "Choose when the result will be known.";
    }

    if (!data.reveal_date_type) next.reveal_date_type = "Choose a release option.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    if (!validate()) {
      setFailure("Some required Confirmation details still need attention. Open the highlighted sections below.");
      return;
    }

    const browserSessionId = getBrowserSessionId();
    if (!browserSessionId) {
      setFailure("Solaris could not create the protected browser session required to save this edit.");
      return;
    }

    setBusy(true);
    setFailure(null);
    try {
      const payload: ConfirmationPayload = {
        ...data,
        preview_end: offsetTimestamp(data.preview_start, 25),
        final_clip_end: offsetTimestamp(data.final_clip_start, 90),
      };
      const result = await submitMaintenanceConfirmation({
        ...payload,
        browser_session_id: browserSessionId,
        edit_token: editToken,
      });
      if (!result.ok) {
        setFailure(resultMessage(result));
        return;
      }
      setData(payload);
      setSaved(result);
    } catch (error) {
      console.error("[Maintenance Confirmations] Editor save failed", error);
      setFailure("Solaris could not save these changes. Your existing Confirmation remains authoritative.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="data-panel p-6 text-center sm:p-8" data-maintenance-confirmation-saved="true">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-400/10 text-emerald-200">
          <CheckCircle2 className="size-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold">Changes confirmed</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          The same existing Confirmation was updated. No duplicate Confirmation was created.
          {saved.canonical_sync === "pending" ? " Solaris is still reconciling the public Entry projection." : ""}
        </p>
        <Button asChild className="mt-5">
          <a href="/">Return to Confirmation status</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-maintenance-confirmation-editor="true">
      <div className="data-panel border-primary/20 p-4 sm:p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">Existing Confirmation</p>
        <h2 className="mt-1 text-lg font-bold">Edit the saved response</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Only this existing response can be changed during maintenance. Saving below updates it in place.
        </p>
      </div>

      {failure ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm leading-6 text-destructive" role="alert">
          {failure}
        </div>
      ) : null}

      <Section title="Delegation & participation" description="Account and participation details for this Confirmation.">
        <Field label="Instagram username" error={errors.instagram_username}>
          <Input value={data.instagram_username} onChange={(event) => set("instagram_username", event.target.value)} />
        </Field>
        <Field label="Country" error={errors.country}>
          <Input value={data.country} onChange={(event) => set("country", event.target.value)} />
        </Field>
        <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/30 p-4">
          <span className="text-sm font-semibold">Participating in this edition</span>
          <Switch checked={data.participating} onCheckedChange={(value) => set("participating", value)} />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/30 p-4">
          <span className="text-sm font-semibold">Has a delegation account</span>
          <Switch checked={data.has_country_account} onCheckedChange={(value) => set("has_country_account", value)} />
        </label>
        {data.has_country_account ? (
          <Field label="Delegation account">
            <Input value={data.country_account} onChange={(event) => set("country_account", event.target.value)} />
          </Field>
        ) : null}
      </Section>

      <Section title="Selection method" description="How this entry was selected.">
        <Field label="Selection method" error={errors.selection_method}>
          <select
            className="min-h-11 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm text-foreground outline-none focus:border-primary"
            value={data.selection_method}
            onChange={(event) => set("selection_method", event.target.value as ConfirmationPayload["selection_method"])}
          >
            <option value="">Choose a method</option>
            <option value="internal">Internal Selection</option>
            <option value="national_final">National Final</option>
            <option value="unknown">Not known yet</option>
          </select>
        </Field>
      </Section>

      <Section title="Entry details" description="Artist, song and media details." open>
        {data.selection_method === "internal" ? (
          <>
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/30 p-4">
              <span className="text-sm font-semibold">Entry is not known yet</span>
              <Switch checked={data.entry_unknown} onCheckedChange={(value) => set("entry_unknown", value)} />
            </label>
            {!data.entry_unknown ? (
              <>
                <Field label="Artist" error={errors.artist}>
                  <Input value={data.artist} onChange={(event) => set("artist", event.target.value)} />
                </Field>
                <Field label="Song title" error={errors.song_title}>
                  <Input value={data.song_title} onChange={(event) => set("song_title", event.target.value)} />
                </Field>
                <Field label="Song link" error={errors.song_url}>
                  <Input value={data.song_url} onChange={(event) => set("song_url", event.target.value)} placeholder="https://" />
                </Field>
                <Field label="25-second preview start" hint="MM:SS" error={errors.preview_start}>
                  <Input value={data.preview_start} onChange={(event) => set("preview_start", event.target.value)} placeholder="MM:SS" />
                </Field>
                <Field label="90-second final clip start" hint="MM:SS" error={errors.final_clip_start}>
                  <Input value={data.final_clip_start} onChange={(event) => set("final_clip_start", event.target.value)} placeholder="MM:SS" />
                </Field>
                <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/30 p-4">
                  <span className="text-sm font-semibold">Replacement video required</span>
                  <Switch checked={data.replacement_video_required} onCheckedChange={(value) => set("replacement_video_required", value)} />
                </label>
                {data.replacement_video_required ? (
                  <Field label="Replacement video link" error={errors.replacement_video_url}>
                    <Input value={data.replacement_video_url} onChange={(event) => set("replacement_video_url", event.target.value)} placeholder="https://" />
                  </Field>
                ) : null}
              </>
            ) : null}
          </>
        ) : data.selection_method === "national_final" ? (
          <>
            <Field label="National Final name" error={errors.nf_name}>
              <Input value={data.nf_name} onChange={(event) => set("nf_name", event.target.value)} />
            </Field>
            <Field label="Expected number of entries">
              <Input type="number" min={1} value={data.expected_entry_count} onChange={(event) => set("expected_entry_count", event.target.value)} />
            </Field>
            <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-secondary/30 p-4">
              <span className="text-sm font-semibold">National Final entries are not known yet</span>
              <Switch checked={data.nf_entries_unknown} onCheckedChange={(value) => set("nf_entries_unknown", value)} />
            </label>
            {!data.nf_entries_unknown ? (
              <div className="space-y-3">
                {errors.nf_entries ? <p className="text-xs font-semibold text-destructive">{errors.nf_entries}</p> : null}
                {data.nf_entries.map((entry, index) => (
                  <div key={index} className="rounded-xl border border-border bg-secondary/25 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Entry {index + 1}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const wasWinner = winnerIndex === index;
                          set("nf_entries", data.nf_entries.filter((_, itemIndex) => itemIndex !== index));
                          if (wasWinner) chooseWinner(-1);
                        }}
                      >
                        <Trash2 className="size-4" /> Remove
                      </Button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input value={entry.artist} onChange={(event) => updateNfEntry(index, { artist: event.target.value })} placeholder="Artist" />
                      <Input value={entry.song_title} onChange={(event) => updateNfEntry(index, { song_title: event.target.value })} placeholder="Song title" />
                    </div>
                    <Input className="mt-2" value={entry.song_url} onChange={(event) => updateNfEntry(index, { song_url: event.target.value })} placeholder="Song link (https://)" />
                    {errors[`nf_${index}`] ? <p className="mt-2 text-xs font-semibold text-destructive">{errors[`nf_${index}`]}</p> : null}
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={() => set("nf_entries", [...data.nf_entries, { artist: "", song_title: "", song_url: "" }])}>
                  <Plus className="size-4" /> Add National Final entry
                </Button>
                {data.nf_entries.length > 0 ? (
                  <Field label="Winning entry">
                    <select
                      className="min-h-11 w-full rounded-lg border border-border bg-secondary/40 px-3 text-sm text-foreground outline-none focus:border-primary"
                      value={winnerIndex >= 0 ? String(winnerIndex) : "unknown"}
                      onChange={(event) => chooseWinner(event.target.value === "unknown" ? -1 : Number(event.target.value))}
                    >
                      <option value="unknown">Winner not known yet</option>
                      {data.nf_entries.map((entry, index) => (
                        <option key={index} value={index}>{entry.artist || "Unknown artist"} — {entry.song_title || "Untitled"}</option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                {winnerIndex >= 0 ? (
                  <>
                    <Field label="25-second preview start" hint="MM:SS" error={errors.preview_start}>
                      <Input value={data.preview_start} onChange={(event) => set("preview_start", event.target.value)} placeholder="MM:SS" />
                    </Field>
                    <Field label="90-second final clip start" hint="MM:SS" error={errors.final_clip_start}>
                      <Input value={data.final_clip_start} onChange={(event) => set("final_clip_start", event.target.value)} placeholder="MM:SS" />
                    </Field>
                  </>
                ) : null}
              </div>
            ) : null}
            <DateEditor
              label="Expected National Final date"
              value={data.nf_date_type}
              exact={data.nf_exact_date}
              approximate={data.nf_approximate_text}
              onType={(value) => set("nf_date_type", value)}
              onExact={(value) => set("nf_exact_date", value)}
              onApproximate={(value) => set("nf_approximate_text", value)}
            />
            {errors.nf_date_type ? <p className="text-xs font-semibold text-destructive">{errors.nf_date_type}</p> : null}
            <DateEditor
              label="When will the winner be known?"
              value={data.nf_result_date_type}
              exact={data.nf_result_exact_date}
              approximate={data.nf_result_approximate_text}
              onType={(value) => set("nf_result_date_type", value)}
              onExact={(value) => set("nf_result_exact_date", value)}
              onApproximate={(value) => set("nf_result_approximate_text", value)}
            />
            {errors.nf_result_date_type ? <p className="text-xs font-semibold text-destructive">{errors.nf_result_date_type}</p> : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Choose the selection method above to edit entry details.</p>
        )}
      </Section>

      <Section title="Release details" description="When Solaris may reveal the entry.">
        <DateEditor
          label="Earliest reveal"
          value={data.reveal_date_type}
          exact={data.reveal_exact_date}
          approximate={data.reveal_approximate_text}
          allowImmediate
          onType={(value) => set("reveal_date_type", value)}
          onExact={(value) => set("reveal_exact_date", value)}
          onApproximate={(value) => set("reveal_approximate_text", value)}
        />
        {errors.reveal_date_type ? <p className="text-xs font-semibold text-destructive">{errors.reveal_date_type}</p> : null}
      </Section>

      <div className="sticky bottom-3 z-10 rounded-2xl border border-primary/20 bg-background/95 p-3 shadow-2xl backdrop-blur-xl">
        <Button className="w-full" size="lg" disabled={busy} onClick={() => void save()}>
          {busy ? <><LoaderCircle className="size-4 animate-spin" /> Saving changes…</> : "Save changes to this Confirmation"}
        </Button>
        <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">
          This updates the existing response only. It cannot create a new Confirmation during maintenance.
        </p>
      </div>
    </div>
  );
}
