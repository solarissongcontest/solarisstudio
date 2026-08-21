import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Palette, RotateCcw, Save } from "lucide-react";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { editionLabel, useEditions } from "@/lib/data";
import {
  DEFAULT_EDITION_APPEARANCE,
  editionAppearanceFromConfig,
  editionBackgroundCss,
  type EditionAppearance,
} from "@/lib/edition-appearance";
import { DEFAULT_THEME, editionThemeToVisual } from "@/lib/visual-theme";

const supabase = typedSupabase as any;

type EditionVisual = {
  id: string;
  slug: string;
  name: string;
  edition_number: number | null;
  artwork_url?: string | null;
  theme_colors?: unknown;
  design_config?: unknown;
};

export const Route = createFileRoute("/_authenticated/admin/edition-appearance/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} page appearance — Solaris Organizer` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditionAppearancePage,
});

function EditionAppearancePage() {
  const { slug } = Route.useParams();
  const { data: editions = [] } = useEditions();
  const edition = useMemo(
    () => editions.find((item) => item.slug === slug) as EditionVisual | undefined,
    [editions, slug],
  );
  const saved = useMemo(
    () => editionAppearanceFromConfig(edition?.design_config),
    [edition?.design_config],
  );
  const [draft, setDraft] = useState<EditionAppearance | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!edition) {
    return (
      <AdminPage>
        <AdminCard><AdminEmptyState icon={Palette} title="Edition not found" description="Choose another edition." /></AdminCard>
      </AdminPage>
    );
  }

  const value = draft ?? saved;
  const colours = editionThemeToVisual(edition.theme_colors) ?? DEFAULT_THEME;
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  const update = <K extends keyof EditionAppearance>(key: K, next: EditionAppearance[K]) =>
    setDraft((current) => ({ ...(current ?? saved), [key]: next }));

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from("editions")
        .update({ design_config: value })
        .eq("id", edition.id);
      if (error) throw error;
      setDraft(null);
      setMessage("Page appearance saved. Edition and show pages now share this design.");
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Page appearance could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  const background = editionBackgroundCss(value, colours, edition.artwork_url ?? null);

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow="Edition identity"
        title="Page appearance"
        description={`Control how ${editionLabel(edition as any)} and all of its public show pages look. This changes presentation only, never entries, votes or results.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminStatus tone={dirty ? "attention" : "ready"}>{dirty ? "Unsaved changes" : "Saved"}</AdminStatus>
            <Link to="/admin/edition-theme/$slug" params={{ slug }} className="admin-action-secondary"><ArrowLeft className="size-4" /> Artwork & colours</Link>
            <Link to="/editions/$slug" params={{ slug }} target="_blank" className="admin-action-quiet"><ExternalLink className="size-4" /> Public preview</Link>
          </div>
        }
      />

      {message ? <div className="mb-4 rounded-xl border border-white/[0.08] bg-white/[0.035] p-3 text-sm">{message}</div> : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[.92fr_1.08fr]">
        <div className="min-w-0 space-y-4">
          <AdminCard>
            <AdminCardHeader eyebrow="Composition" title="Choose the page personality" description="These presets change hierarchy and material without hiding information." />
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Header style"
                value={value.heroLayout}
                options={[
                  ["cinematic", "Cinematic"],
                  ["editorial", "Editorial"],
                  ["minimal", "Minimal"],
                  ["broadcast", "Broadcast"],
                  ["glass", "Glass"],
                ]}
                onChange={(next) => update("heroLayout", next as EditionAppearance["heroLayout"])}
              />
              <SelectField
                label="Card material"
                value={value.cardStyle}
                options={[["soft", "Soft"], ["glass", "Glass"], ["solid", "Solid"]]}
                onChange={(next) => update("cardStyle", next as EditionAppearance["cardStyle"])}
              />
              <SelectField
                label="Decoration"
                value={value.decorationStyle}
                options={[["artwork", "Artwork fade"], ["orbits", "Orbits"], ["stars", "Stars"], ["none", "None"]]}
                onChange={(next) => update("decorationStyle", next as EditionAppearance["decorationStyle"])}
              />
              <SelectField
                label="Page background"
                value={value.backgroundMode}
                options={[["gradient", "Gradient"], ["artwork", "Artwork"], ["solid", "Solid"]]}
                onChange={(next) => update("backgroundMode", next as EditionAppearance["backgroundMode"])}
              />
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="Background" title="Fine-tune the atmosphere" description="The main palette still comes from Artwork & colours. These controls decide how those colours are composed." />
            {value.backgroundMode === "gradient" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Gradient style"
                  value={value.gradientStyle}
                  options={[["aurora", "Aurora"], ["linear", "Linear"], ["radial", "Radial"]]}
                  onChange={(next) => update("gradientStyle", next as EditionAppearance["gradientStyle"])}
                />
                <RangeField label="Gradient angle" value={value.gradientAngle} min={0} max={360} suffix="°" onChange={(next) => update("gradientAngle", next)} />
                <label className="block sm:col-span-2">
                  <span className="admin-section-label">Optional third background colour</span>
                  <div className="mt-2 flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3">
                    <input
                      type="color"
                      value={value.backgroundTertiary ?? colours.accent}
                      onChange={(event) => update("backgroundTertiary", event.target.value)}
                      className="size-7 rounded-lg border-0 bg-transparent p-0"
                    />
                    <span className="text-xs text-muted-foreground">{value.backgroundTertiary ?? "Uses accent colour"}</span>
                    {value.backgroundTertiary ? <button type="button" className="ml-auto text-xs font-semibold text-muted-foreground" onClick={() => update("backgroundTertiary", null)}>Use accent</button> : null}
                  </div>
                </label>
              </div>
            ) : value.backgroundMode === "artwork" ? (
              <div className="space-y-3">
                {!edition.artwork_url ? <p className="rounded-xl border border-amber-200/15 bg-amber-200/[0.04] p-3 text-xs text-amber-100">Upload edition artwork first. Until then Solaris falls back to the gradient.</p> : null}
                <RangeField label="Artwork left / right" value={value.artworkPositionX} min={0} max={100} suffix="%" onChange={(next) => update("artworkPositionX", next)} />
                <RangeField label="Artwork up / down" value={value.artworkPositionY} min={0} max={100} suffix="%" onChange={(next) => update("artworkPositionY", next)} />
                <RangeField label="Dark overlay" value={Math.round(value.artworkOverlay * 100)} min={0} max={90} suffix="%" onChange={(next) => update("artworkOverlay", next / 100)} />
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">Solid uses the edition's main background colour with no extra gradient or artwork layer.</p>
            )}
          </AdminCard>

          <div className="admin-sticky-actions flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={busy || !dirty}
              onClick={() => setDraft({ ...DEFAULT_EDITION_APPEARANCE })}
              className="admin-action-secondary flex-1"
            >
              <RotateCcw className="size-4" /> Reset design
            </button>
            <button type="button" disabled={busy || !dirty} onClick={() => void save()} className="admin-action-primary flex-[1.35]">
              <Save className="size-4" /> {busy ? "Saving…" : "Save page appearance"}
            </button>
          </div>
        </div>

        <AdminCard className="h-fit xl:sticky xl:top-24">
          <AdminCardHeader eyebrow="Live preview" title="Edition + show language" description="A lightweight preview of the same palette, header personality and card material used publicly." />
          <div
            className="overflow-hidden rounded-[1.7rem] border p-4 sm:p-5"
            style={{
              background,
              backgroundSize: "cover",
              backgroundPosition: `${value.artworkPositionX}% ${value.artworkPositionY}%`,
              color: colours.textPrimary,
              borderColor: `${colours.accent}44`,
            }}
          >
            <div
              className={`relative overflow-hidden border p-4 ${value.heroLayout === "minimal" ? "rounded-none border-x-0 border-t-0 bg-transparent" : value.heroLayout === "broadcast" ? "rounded-xl border-l-4" : "rounded-2xl"}`}
              style={{
                borderColor: `${colours.accent}55`,
                background: value.heroLayout === "glass" ? `${colours.surface}99` : `${colours.surface}e6`,
              }}
            >
              <p className="text-[9px] font-bold uppercase tracking-[.2em]" style={{ color: colours.accent }}>Semi final</p>
              <h3 className="mt-2 font-display text-3xl font-bold">Semi-final 1</h3>
              <p className="mt-2 text-xs" style={{ color: colours.textMuted }}>Entries and show information.</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {["Entries", "Line-up"].map((label, index) => (
                <div
                  key={label}
                  className="rounded-2xl border p-3"
                  style={{
                    borderColor: `${colours.accent}33`,
                    background: value.cardStyle === "glass" ? `${colours.surface}99` : colours.surface,
                  }}
                >
                  <p className="text-[9px] uppercase tracking-[.15em]" style={{ color: colours.textMuted }}>{label}</p>
                  <p className="mt-1 text-xl font-semibold">{index ? "Alphabetical" : "18"}</p>
                </div>
              ))}
            </div>
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="admin-section-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 text-sm">
        {options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}
      </select>
    </label>
  );
}

function RangeField({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between gap-3"><span className="admin-section-label">{label}</span><span className="text-xs text-muted-foreground">{Math.round(value)}{suffix}</span></span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-3 w-full" />
    </label>
  );
}
