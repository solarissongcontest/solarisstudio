import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EntryCredit, EntryCreditRole } from "@/lib/ssc";

const CREDIT_ROLE_OPTIONS: readonly { value: EntryCreditRole; label: string }[] = [
  { value: "composer", label: "Composer" },
  { value: "lyricist", label: "Lyricist" },
  { value: "songwriter", label: "Songwriter" },
  { value: "producer", label: "Producer" },
  { value: "arranger", label: "Arranger" },
  { value: "other", label: "Other" },
];

export const ENTRY_CREDIT_LIMIT = 32;
export const ENTRY_CREDIT_NAME_LIMIT = 160;

function normalizeCreditName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function entryCreditsSummary(credits: readonly EntryCredit[]) {
  if (!credits.length) return "Not supplied";
  return credits
    .map((credit) => {
      const label = CREDIT_ROLE_OPTIONS.find((option) => option.value === credit.role)?.label ?? credit.role;
      return `${label}: ${normalizeCreditName(credit.name) || "Unnamed"}`;
    })
    .join(" · ");
}

export function entryCreditsValidationMessage(credits: readonly EntryCredit[]) {
  if (credits.length > ENTRY_CREDIT_LIMIT) {
    return `Add no more than ${ENTRY_CREDIT_LIMIT} credit records.`;
  }

  const seen = new Set<string>();
  for (const credit of credits) {
    const normalizedName = normalizeCreditName(credit.name);
    if (!normalizedName) {
      return "Every credit needs a name, or remove the empty row.";
    }
    if (normalizedName.length > ENTRY_CREDIT_NAME_LIMIT) {
      return `Credit names must be ${ENTRY_CREDIT_NAME_LIMIT} characters or fewer.`;
    }

    // Mirror the database's duplicate definition: same canonical role and the
    // same whitespace-normalized, case-preserving credited name.
    const duplicateKey = `${credit.role}\u0000${normalizedName}`;
    if (seen.has(duplicateKey)) {
      return "Remove duplicate credit records with the same role and name.";
    }
    seen.add(duplicateKey);
  }
  return null;
}

export function EntryCreditsEditor({
  credits,
  onChange,
  error,
  idPrefix = "entry-credit",
  compact = false,
}: {
  credits: readonly EntryCredit[];
  onChange: (credits: EntryCredit[]) => void;
  error?: string;
  idPrefix?: string;
  compact?: boolean;
}) {
  function updateCredit(index: number, patch: Partial<EntryCredit>) {
    onChange(credits.map((credit, itemIndex) => (
      itemIndex === index ? { ...credit, ...patch } : { ...credit }
    )));
  }

  function removeCredit(index: number) {
    onChange(credits.filter((_, itemIndex) => itemIndex !== index).map((credit) => ({ ...credit })));
  }

  function addCredit() {
    if (credits.length >= ENTRY_CREDIT_LIMIT) return;
    onChange([...credits.map((credit) => ({ ...credit })), { role: "songwriter", name: "" }]);
  }

  return (
    <div className="space-y-3" data-entry-credits-editor="canonical-structured-credits">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Label className="text-sm font-medium">Credits</Label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Add the people credited for this song. Credits are saved with the same canonical Entry revision as the song itself.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">{credits.length}/{ENTRY_CREDIT_LIMIT}</span>
      </div>

      {credits.length ? (
        <div className="space-y-2">
          {credits.map((credit, index) => {
            const roleId = `${idPrefix}-${index}-role`;
            const nameId = `${idPrefix}-${index}-name`;
            return (
              <div
                key={`${idPrefix}-${index}`}
                className={compact ? "rounded-lg border border-border p-3" : "rounded-xl border border-border bg-secondary/30 p-3"}
              >
                <div className="grid gap-2 sm:grid-cols-[minmax(9rem,0.7fr)_minmax(0,1.3fr)_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor={roleId} className="text-xs text-muted-foreground">Role</Label>
                    <select
                      id={roleId}
                      value={credit.role}
                      onChange={(event) => updateCredit(index, { role: event.target.value as EntryCreditRole })}
                      className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {CREDIT_ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={nameId} className="text-xs text-muted-foreground">Name</Label>
                    <Input
                      id={nameId}
                      value={credit.name}
                      maxLength={ENTRY_CREDIT_NAME_LIMIT}
                      onChange={(event) => updateCredit(index, { name: event.target.value })}
                      placeholder="Full name or credited name"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCredit(index)}
                    aria-label={`Remove credit ${index + 1}`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
          No structured credits added yet.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCredit}
          disabled={credits.length >= ENTRY_CREDIT_LIMIT}
        >
          <Plus className="size-4" aria-hidden="true" /> Add credit
        </Button>
        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}
