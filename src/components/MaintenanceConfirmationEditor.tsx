import { Check, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  submitMaintenanceConfirmationEdit,
  type MaintenanceEditRound,
} from "@/lib/maintenance-confirmation-client";

type MaintenanceConfirmationEditorProps = {
  round: MaintenanceEditRound;
  editToken: string;
  prefill: Record<string, unknown>;
};

type DateFieldProps = {
  label: string;
  value: DateType | "";
  exact: string;
  approximate: string;
  allowImmediate?: boolean;
  onType: (value: DateType) => void;
  onExact: (value: string) => void;
  onApproximate: (value: string) => void;
};

const fieldClass =
  "min-h-11 rounded-xl border-border/80 bg-background/55 text-foreground";

function DateField({
  label,
  value,
  exact,
  approximate,
  allowImmediate = false,
  onType,
  onExact,
  onApproximate,
}: DateFieldProps) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">{label}</Label>
      <select
        className={`${fieldClass} w-full border px-3 text-sm`}
        value={value}
        onChange={(event) => onType(event.target.value as DateType)}
      >
        <option value="">Choose an option</option>
        <option value="exact">Exact date</option>
        <option value="approximate">Approximate date</option>
        {allowImmediate ? <option value="immediately">Can be revealed immediately</option> : null}
        <option value="unknown">Unknown</option>
      </select>
      {value === "exact" ? (
        <Input
          className={fieldClass}
          type="date"
          value={exact}
          onChange={(event) => onExact(event.target.value)}
        />
      ) : null}
      {value === "approximate" ? (
        <Input
          className={fieldClass}
          value={approximate}
          maxLength={200}
          placeholder="Describe the approximate timing"
          onChange={(event) => onApproximate(event.target.value)}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="data-panel space-y-4 p-4 sm:p-5">
      <div>
        <h3 className="text-base font-bold tracking-[-.01em]">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function sameWinner(
  data: ConfirmationPayload,
  entry: { artist: string; song_title: string; song_url: string },
) {
  return (
    data.artist === entry.artist &&
    data.song_title === entry.song_title &&
    data.song_url === entry.song_url
  );
}

function validationMessage(data: ConfirmationPayload) {
  if (!data.instagram_username.trim()) return "Instagram username is required.";
  if (!data.country.trim()) return "Country is missing from the saved Confirmation.";
  if (data.has_country_account && !data.country_account.trim()) {
    return "Country account is required for this response.";
  }
  if (!data.participating) return null;
  if (!data.selection_method) return "Choose a selection method.";

  if (data.selection_method === "internal" && !data.entry_unknown) {
    if (!data.artist.trim() || !data.song_title.trim()) {
      return "Artist and song title are required for the internal entry.";
    }
    if (!isValidUrl(data.song_url)) return "Enter a valid song link.";
    if (parseTimestamp(data.preview_start) === null) {
      return "Enter the 25-second preview start as MM:SS.";
    }
    if (parseTimestamp(data.final_clip_start) === null) {
      return "Enter the 90-second final clip start as MM:SS.";
    }
    if (data.replacement_video_required && !isValidUrl(data.replacement_video_url)) {
      return "Enter a valid replacement video URL.";
    }
  }

  if (data.selection_method === "national_final") {
    if (!data.nf_name.trim()) return "National Final name is required.";
    if (!data.nf_entries_unknown) {
      if (!data.nf_entries.length) return "Add at least one National Final entry.";
      for (const entry of data.nf_entries) {
        if (!entry.artist.trim() || !entry.song_title.trim()) {
          return "Every National Final entry needs an artist and song title.";
        }
        if (entry.song_url.trim() && !isValidUrl(entry.song_url)) {
          return "Every entered National Final song link must be a valid URL.";
        }
      }
      const winnerSelected = data.nf_entries.some((entry) => sameWinner(data, entry));
      if (winnerSelected) {
        if (!isValidUrl(data.song_url)) return "The winning entry needs a valid song link.";
        if (parseTimestamp(data.preview_start) === null) {
          return "Enter the winning entry preview start as MM:SS.";
        }
        if (parseTimestamp(data.final_clip_start) === null) {
          return "Enter the winning entry final clip start as MM:SS.";
        }
      }
    }
    if (!data.nf_date_type) return "Choose when the National Final will take place.";
    if (data.nf_date_type === "exact" && !data.nf_exact_date) return "Choose the National Final date.";
    if (data.nf_date_type === "approximate" && !data.nf_approximate_text.trim()) {
      return "Describe the approximate National Final date.";
    }
    if (!data.nf_result_date_type) return "Choose when the National Final result will be known.";
    if (data.nf_result_date_type === "exact" && !data.nf_result_exact_date) {
      return "Choose the National Final result date.";
    }
    if (
      data.nf_result_date_type === "approximate" &&
      !data.nf_result_approximate_text.trim()
    ) {
      return "Describe the approximate National Final result date.";
    }
  }

  if (!data.reveal_date_type) return "Choose the entry reveal timing.";
  if (data.reveal_date_type === "exact" && !data.reveal_exact_date) {
    return "Choose the entry reveal date.";
  }
  if (data.reveal_date_type === "approximate" && !data.reveal_approximate_text.trim()) {
    return "Describe the approximate entry reveal date.";
  }

  return null;
}

export function MaintenanceConfirmationEditor({
  round,
  editToken,
  prefill,
}: MaintenanceConfirmationEditorProps) {
  const [data, setData] = useState<ConfirmationPayload>(() =>
    prefillFromSubmission(prefill, emptyPayload(round.id)),
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const winnerIndex = useMemo(
    () =>
      data.selection_method === "national_final"
        ? data.nf_entries.findIndex((entry) => sameWinner(data, entry))
        : -1,
    [data],
  );

  function set<K extends keyof ConfirmationPayload>(
    key: K,
    value: ConfirmationPayload[K],
  ) {
    setData((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function updateNfEntry(
    index: number,
    patch: Partial<ConfirmationPayload["nf_entries"][number]>,
  ) {
    setData((current) => {
      const entries = current.nf_entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      );
      const old = current.nf_entries[index];
      const updated = entries[index];
      if (!old || !updated || !sameWinner(current, old)) {
        return { ...current, nf_entries: entries };
      }
      return {
        ...current,
        nf_entries: entries,
        artist: updated.artist,
        song_title: updated.song_title,
        song_url: updated.song_url,
      };
    });
    setError(null);
  }

  function chooseWinner(index: number) {
    setData((current) => {
      if (index < 0) {
        return {
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
        };
      }
      const entry = current.nf_entries[index];
      if (!entry) return current;
      const sameAsCurrent = sameWinner(current, entry);
      return {
        ...current,
        artist: entry.artist,
        song_title: entry.song_title,
        song_url: entry.song_url,
        ...(sameAsCurrent
          ? {}
          : {
              preview_start: "",
              preview_end: "",
              final_clip_start: "",
              final_clip_end: "",
              replacement_video_required: false,
              replacement_video_url: "",
            }),
      };
    });
    setError(null);
  }

  async function save() {
    const invalid = validationMessage(data);
    if (invalid) {
      setError(invalid);
      return;
    }

    const browserSessionId = getBrowserSessionId();
    if (!browserSessionId) {
      setError(
        "This browser could not create the protected editor session required to save changes. Private browsing/storage restrictions may be blocking it.",
      );
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await submitMaintenanceConfirmationEdit({
        ...data,
        preview_end: offsetTimestamp(data.preview_start, 25),
        final_clip_end: offsetTimestamp(data.final_clip_start, 90),
        browser_session_id: browserSessionId,
        edit_token: editToken,
      });

      if (!result.ok) {
        if (result.error === "duplicate_song") {
          setError("This song conflicts with another Solaris entry. Review the song details before saving.");
        } else if (result.error === "duplicate_artist") {
          setError("This artist conflicts with another entry in this edition. Review the artist details before saving.");
        } else if (result.error === "editing_closed" || result.error === "edit_token_invalid") {
          setError("Editing was closed or this edit link was replaced. Return to the maintenance page for the current status.");
        } else {
          setError("Solaris rejected the update. Your existing Confirmation is unchanged.");
        }
        return;
      }

      setSaved(true);
    } catch (caught) {
      console.error("[Maintenance Confirmation] Save transport failed", caught);
      setError(
        "Solaris could not verify the save response. Do not create a second Confirmation. Retrying the same unchanged update is protected by the same operation identity.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <section className="data-panel p-6 text-center sm:p-8" data-maintenance-confirmation-saved="">
        <div className="mx-auto grid size-12 place-items-center rounded-full border border-emerald-300/25 bg-emerald-300/10 text-emerald-200">
          <Check className="size-6" />
        </div>
        <h2 className="mt-4 text-xl font-bold">Changes saved</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
          Solaris updated the existing Confirmation. No duplicate Confirmation was created. The edit link is now finished; return to the maintenance page for the latest review status.
        </p>
        <Button asChild className="mt-5">
          <a href="/">Return to maintenance page</a>
        </Button>
      </section>
    );
  }

  return (
    <div className="space-y-4" data-maintenance-confirmation-editor="">
      <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-4 py-3 text-xs leading-5 text-muted-foreground">
        This focused editor talks only to the existing-response Confirmation RPCs that remain authorized during maintenance. The rest of Solaris Studio stays closed.
      </div>

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive" role="alert">
          {error}
        </div>
      ) : null}

      <Section title="Delegation" description="Review the contact details attached to this saved Confirmation.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Country</Label>
            <Input className={fieldClass} value={data.country} readOnly aria-readonly="true" />
            <p className="text-[11px] leading-4 text-muted-foreground">Country identity is fixed by this country-account edit link.</p>
          </div>
          <div className="space-y-2">
            <Label>Instagram username</Label>
            <Input
              className={fieldClass}
              value={data.instagram_username}
              maxLength={80}
              onChange={(event) => set("instagram_username", event.target.value)}
            />
          </div>
          {data.has_country_account ? (
            <div className="space-y-2 sm:col-span-2">
              <Label>Country account</Label>
              <Input
                className={fieldClass}
                value={data.country_account}
                maxLength={80}
                onChange={(event) => set("country_account", event.target.value)}
              />
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Participation" description="Changing this updates the same existing response.">
        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border/70 bg-background/35 px-3 text-sm">
          <input
            type="checkbox"
            checked={data.participating}
            onChange={(event) => set("participating", event.target.checked)}
          />
          Participating in {round.edition_name}
        </label>
      </Section>

      {data.participating ? (
        <>
          <Section title="Selection" description="Choose how this delegation selects its entry.">
            <select
              className={`${fieldClass} w-full border px-3 text-sm`}
              value={data.selection_method}
              onChange={(event) =>
                set(
                  "selection_method",
                  event.target.value as ConfirmationPayload["selection_method"],
                )
              }
            >
              <option value="">Choose selection method</option>
              <option value="internal">Internal selection</option>
              <option value="national_final">National Final</option>
              <option value="unknown">Not known yet</option>
            </select>
          </Section>

          {data.selection_method === "internal" ? (
            <Section title="Entry" description="Edit the artist, song and media for the internal selection.">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={data.entry_unknown}
                  onChange={(event) => set("entry_unknown", event.target.checked)}
                />
                Entry is not known yet
              </label>
              {!data.entry_unknown ? (
                <div className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Artist</Label>
                      <Input className={fieldClass} value={data.artist} maxLength={160} onChange={(event) => set("artist", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Song title</Label>
                      <Input className={fieldClass} value={data.song_title} maxLength={160} onChange={(event) => set("song_title", event.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Song URL</Label>
                    <Input className={fieldClass} value={data.song_url} maxLength={500} onChange={(event) => set("song_url", event.target.value)} />
                  </div>
                </div>
              ) : null}
            </Section>
          ) : null}

          {data.selection_method === "national_final" ? (
            <Section title="National Final" description="Edit the selection event, its entries and the current winner.">
              <div className="space-y-2">
                <Label>National Final name</Label>
                <Input className={fieldClass} value={data.nf_name} maxLength={160} onChange={(event) => set("nf_name", event.target.value)} />
              </div>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={data.nf_entries_unknown}
                  onChange={(event) => set("nf_entries_unknown", event.target.checked)}
                />
                National Final entries are not known yet
              </label>
              {!data.nf_entries_unknown ? (
                <div className="space-y-3">
                  {data.nf_entries.map((entry, index) => (
                    <div key={index} className="rounded-xl border border-border/70 bg-background/30 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-xs font-semibold">
                          <input
                            type="radio"
                            name="maintenance-nf-winner"
                            checked={winnerIndex === index}
                            onChange={() => chooseWinner(index)}
                          />
                          Winner
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (winnerIndex === index) chooseWinner(-1);
                            set("nf_entries", data.nf_entries.filter((_, i) => i !== index));
                          }}
                        >
                          <Trash2 className="size-4" /> Remove
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input className={fieldClass} aria-label={`Entry ${index + 1} artist`} placeholder="Artist" value={entry.artist} maxLength={160} onChange={(event) => updateNfEntry(index, { artist: event.target.value })} />
                        <Input className={fieldClass} aria-label={`Entry ${index + 1} song title`} placeholder="Song title" value={entry.song_title} maxLength={160} onChange={(event) => updateNfEntry(index, { song_title: event.target.value })} />
                      </div>
                      <Input className={`${fieldClass} mt-3`} aria-label={`Entry ${index + 1} song URL`} placeholder="Song URL" value={entry.song_url} maxLength={500} onChange={(event) => updateNfEntry(index, { song_url: event.target.value })} />
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => set("nf_entries", [...data.nf_entries, { artist: "", song_title: "", song_url: "" }])}>
                      <Plus className="size-4" /> Add entry
                    </Button>
                    {winnerIndex >= 0 ? (
                      <Button type="button" variant="ghost" onClick={() => chooseWinner(-1)}>
                        Winner not decided yet
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <DateField
                  label="National Final date"
                  value={data.nf_date_type}
                  exact={data.nf_exact_date}
                  approximate={data.nf_approximate_text}
                  onType={(value) => set("nf_date_type", value)}
                  onExact={(value) => set("nf_exact_date", value)}
                  onApproximate={(value) => set("nf_approximate_text", value)}
                />
                <DateField
                  label="Result date"
                  value={data.nf_result_date_type}
                  exact={data.nf_result_exact_date}
                  approximate={data.nf_result_approximate_text}
                  onType={(value) => set("nf_result_date_type", value)}
                  onExact={(value) => set("nf_result_exact_date", value)}
                  onApproximate={(value) => set("nf_result_approximate_text", value)}
                />
              </div>
            </Section>
          ) : null}

          {(data.selection_method === "internal" && !data.entry_unknown) ||
          (data.selection_method === "national_final" && winnerIndex >= 0) ? (
            <Section title="Entry media" description="Set preview/final clip timing and any replacement video for the selected entry.">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>25-second preview start (MM:SS)</Label>
                  <Input className={fieldClass} value={data.preview_start} placeholder="00:00" onChange={(event) => set("preview_start", event.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Ends at {offsetTimestamp(data.preview_start, 25) || "—"}</p>
                </div>
                <div className="space-y-2">
                  <Label>90-second final clip start (MM:SS)</Label>
                  <Input className={fieldClass} value={data.final_clip_start} placeholder="00:00" onChange={(event) => set("final_clip_start", event.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Ends at {offsetTimestamp(data.final_clip_start, 90) || "—"}</p>
                </div>
              </div>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={data.replacement_video_required}
                  onChange={(event) => set("replacement_video_required", event.target.checked)}
                />
                Replacement video required
              </label>
              {data.replacement_video_required ? (
                <div className="space-y-2">
                  <Label>Replacement video URL</Label>
                  <Input className={fieldClass} value={data.replacement_video_url} maxLength={500} onChange={(event) => set("replacement_video_url", event.target.value)} />
                </div>
              ) : null}
            </Section>
          ) : null}

          <Section title="Reveal" description="Update when the selected entry may be revealed.">
            <DateField
              label="Entry reveal timing"
              value={data.reveal_date_type}
              exact={data.reveal_exact_date}
              approximate={data.reveal_approximate_text}
              allowImmediate
              onType={(value) => set("reveal_date_type", value)}
              onExact={(value) => set("reveal_exact_date", value)}
              onApproximate={(value) => set("reveal_approximate_text", value)}
            />
          </Section>
        </>
      ) : null}

      <div className="sticky bottom-3 z-20 rounded-2xl border border-border/80 bg-background/95 p-3 shadow-xl backdrop-blur">
        <Button className="w-full" disabled={busy} onClick={() => void save()}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
          {busy ? "Saving changes…" : "Save changes to this Confirmation"}
        </Button>
        <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">
          This updates the existing response only. It does not reopen the round or create a new Confirmation.
        </p>
      </div>
    </div>
  );
}
