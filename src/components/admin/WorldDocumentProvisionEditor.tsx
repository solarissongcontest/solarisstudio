import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import {
  addWorldDocumentProvision,
  MAX_WORLD_PROVISIONS_IN_EDITOR,
  type WorldDocumentProvision,
} from "@/lib/world-document-provisions";

type Props = {
  rows: WorldDocumentProvision[];
  onChange: (rows: WorldDocumentProvision[]) => void;
  disabled?: boolean;
};

const control = "w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const action = "inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-primary";

/** Authoring-only. Cannot publish or reassign a legal Work's canonical owner. */
export function WorldDocumentProvisionEditor({ rows, onChange, disabled = false }: Props) {
  const update = (index: number, patch: Partial<WorldDocumentProvision>) =>
    onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  const move = (index: number, delta: number) => {
    const next = index + delta;
    if (next < 0 || next >= rows.length) return;
    const copied = [...rows];
    [copied[index], copied[next]] = [copied[next], copied[index]];
    onChange(copied);
  };

  return (
    <section aria-labelledby="world-provisions-heading" className="space-y-4 border-t border-border/70 pt-5">
      <div className="space-y-1">
        <h3 id="world-provisions-heading" className="text-base font-bold">
          Structured legal provisions
        </h3>
        <p className="text-xs leading-5 text-muted-foreground">
          Choose a new permanent key for each new provision (never recycle an old key). Stable keys survive renumbering between versions. Titles, article labels and reading order
          may change without replacing the provision's identity. All changes apply only to the new unpublished draft.
        </p>
      </div>

      <div className="space-y-5">
        {rows.map((row, index) => (
          <fieldset key={index} disabled={disabled}
            className="space-y-3 border-b border-border/70 pb-5 last:border-0">
            <legend className="text-sm font-semibold">
              Provision {index + 1} {row.displayLabel && <span className="text-muted-foreground">· {row.displayLabel}</span>}
            </legend>
            <div className="flex flex-wrap gap-2">
              <button className={action} type="button" disabled={disabled || index === 0}
                aria-label={`Move provision ${index + 1} up`}
                onClick={() => move(index, -1)}>
                <ArrowUp className="size-4" aria-hidden="true" /> Up
              </button>
              <button className={action} type="button" disabled={disabled || index === rows.length - 1}
                aria-label={`Move provision ${index + 1} down`}
                onClick={() => move(index, 1)}>
                <ArrowDown className="size-4" aria-hidden="true" /> Down
              </button>
              <button className={action} type="button" disabled={disabled}
                aria-label={`Remove provision ${index + 1} from the new draft`}
                onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                <Trash2 className="size-4" aria-hidden="true" /> Remove from new draft
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold">
                <span>Permanent semantic key</span>
                <input className={control} value={row.semanticKey} maxLength={120}
                  onChange={(event) => update(index, { semanticKey: event.target.value.trim().toLowerCase() })}
                  aria-describedby="world-provision-identity-hint" required />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                <span>Deep-link anchor</span>
                <input className={control} value={row.anchor} maxLength={120}
                  onChange={(event) => update(index, { anchor: event.target.value.trim().toLowerCase() })}
                  required />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                <span>Visible article label (can change by version)</span>
                <input className={control} value={row.displayLabel} maxLength={80}
                  onChange={(event) => update(index, { displayLabel: event.target.value })} />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                <span>Parent provision</span>
                <select className={control} value={row.parentSemanticKey ?? ""}
                  onChange={(event) => update(index, { parentSemanticKey: event.target.value || null })}>
                  <option value="">None, top level</option>
                  {rows.filter((candidate, i) => i !== index && candidate.semanticKey.length > 0).map((candidate, i) => (
                    <option key={candidate.semanticKey + i} value={candidate.semanticKey}>
                      {candidate.displayLabel || candidate.heading || candidate.semanticKey}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1 text-xs font-semibold">
              <span>Provision heading</span>
              <input className={control} value={row.heading} maxLength={240}
                onChange={(event) => update(index, { heading: event.target.value })} />
            </label>
            <label className="block space-y-1 text-xs font-semibold">
              <span>Provision text</span>
              <textarea className={control + " min-h-32 resize-y leading-6"}
                value={row.bodyPlainText} maxLength={12000}
                onChange={(event) => update(index, { bodyPlainText: event.target.value })} />
            </label>
            {row.status !== "active" && (
              <p className="text-xs text-muted-foreground">Historical state: {row.status}. This editor preserves the source status.</p>
            )}
          </fieldset>
        ))}
      </div>
      <p id="world-provision-identity-hint" className="text-xs text-muted-foreground">
        Use keys such as <code>membership.admission</code> and anchors such as <code>membership-admission</code>.
        Reordering must not change these identifiers.
      </p>
      <button className={action} type="button"
        disabled={disabled || rows.length >= MAX_WORLD_PROVISIONS_IN_EDITOR}
        onClick={() => onChange(addWorldDocumentProvision(rows))}>
        <Plus className="size-4" aria-hidden="true" />
        Add provision ({rows.length}/{MAX_WORLD_PROVISIONS_IN_EDITOR})
      </button>
    </section>
  );
}
