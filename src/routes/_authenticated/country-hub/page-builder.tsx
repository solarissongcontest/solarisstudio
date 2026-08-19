import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  ImagePlus,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import {
  uploadCountryAsset,
  useAddCountryMedia,
  useCountries,
  useCountryWorldProfile,
  useDeleteCountryMedia,
  useDeleteCountrySection,
  useMyCountryAccount,
  type CountryMedia,
  type CountryProfile,
} from "@/lib/country-account";
import {
  COUNTRY_SECTION_TEMPLATES,
  autoFactRows,
  buildCountryAutoSection,
  normalizeCountryPageSection,
  useReorderCountryPageSections,
  useSaveCountryPageSection,
  type CountryPageSection,
  type CountryPageSectionInput,
  type CountrySectionImageLayout,
  type CountrySectionType,
} from "@/lib/country-page-builder";
import type { Country } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/country-hub/page-builder")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({ meta: [{ title: "Country page builder — Solaris Studio" }] }),
  component: CountryPageBuilderRoute,
});

function CountryPageBuilderRoute() {
  const { country: targetCountryId } = Route.useSearch();
  const { data: accountData, isLoading } = useMyCountryAccount();
  const { data: countries } = useCountries();
  const access = accountData?.access;
  const ownCountry = accountData?.country;
  const adminTarget =
    access?.isOrganizer && targetCountryId
      ? (countries ?? []).find((country) => country.id === targetCountryId)
      : null;
  const country = adminTarget ?? ownCountry;

  if (isLoading) {
    return <AppShell><p className="text-sm text-muted-foreground">Loading page builder…</p></AppShell>;
  }
  if (!country) {
    return (
      <AppShell>
        <PageHeader eyebrow="Country page builder" title="No country selected" description="Claim a country before building its public pages." />
        <Link to="/country-hub" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold">Open My Solaris</Link>
      </AppShell>
    );
  }

  return <CountryPageBuilder country={country} targetCountryId={targetCountryId} />;
}

function CountryPageBuilder({ country, targetCountryId }: { country: Country; targetCountryId?: string }) {
  const world = useCountryWorldProfile(country.id);
  const saveSection = useSaveCountryPageSection(country.id);
  const reorder = useReorderCountryPageSections(country.id);
  const deleteSection = useDeleteCountrySection(country.id);
  const addMedia = useAddCountryMedia(country.id);
  const deleteMedia = useDeleteCountryMedia(country.id);
  const sections = useMemo(
    () => ((world.data?.sections ?? []) as CountryPageSection[]).map(normalizeCountryPageSection),
    [world.data?.sections],
  );
  const media = world.data?.media ?? [];
  const profile = world.data?.profile ?? null;
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const run = async (task: () => Promise<unknown>, success: string) => {
    setMessage(null);
    try {
      await task();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That page change could not be saved.");
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    await run(() => reorder.mutateAsync(next.map((section) => section.id)), "Section order updated.");
  };

  const addTemplate = async (templateId: string) => {
    const template = COUNTRY_SECTION_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const generated = template.autoKind
      ? buildCountryAutoSection(template.autoKind, country, profile)
      : "";
    await run(
      () => saveSection.mutateAsync({
        heading: template.heading,
        kicker: template.kicker ?? "",
        body: generated,
        sectionType: template.sectionType,
        contentMode: template.autoKind ? "auto" : "manual",
        visibleOnCountry: true,
        visibleOnWiki: true,
        imageLayout: "wide",
        contentJson: template.autoKind ? { autoKind: template.autoKind } : {},
        sortOrder: sections.length,
      }),
      `${template.label} added.`,
    );
    setAdding(false);
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="My Solaris · Page builder"
        title={`${country.name} pages`}
        description="Build the public country profile and Terra Solaris Wiki from the same modular content. Write everything yourself, let Solaris draft from facts you supplied, decide where each block appears and move it into your preferred order."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/country-hub" search={targetCountryId ? { country: targetCountryId } : {}} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">← My Solaris</Link>
            <Link to="/country-hub/theme" search={targetCountryId ? { country: targetCountryId } : {}} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">Appearance</Link>
          </div>
        }
      />

      {message && <p className="mb-4 rounded-xl border border-border bg-surface px-4 py-3 text-sm">{message}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="space-y-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">{sections.length} custom block{sections.length === 1 ? "" : "s"}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Use the large ↑ ↓ controls for reliable phone reordering. No precision finger gymnastics required.</p>
            </div>
            <button type="button" onClick={() => setAdding((value) => !value)} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="mr-1 inline size-4" /> Add block</button>
          </div>

          {adding && (
            <Panel title="Choose a block" description="Templates are only starting points. Everything generated from national facts remains editable.">
              <div className="grid gap-2 sm:grid-cols-2">
                {COUNTRY_SECTION_TEMPLATES.map((template) => (
                  <button key={template.id} type="button" onClick={() => void addTemplate(template.id)} disabled={saveSection.isPending} className="min-h-24 rounded-xl border border-border bg-surface p-3 text-left disabled:opacity-50">
                    <div className="flex items-center gap-2"><span className="text-sm font-semibold">{template.label}</span>{template.autoKind ? <Sparkles className="size-3.5 text-primary" /> : null}</div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{template.description}</p>
                  </button>
                ))}
              </div>
            </Panel>
          )}

          {world.isLoading ? (
            <Panel><p className="py-8 text-center text-sm text-muted-foreground">Loading page blocks…</p></Panel>
          ) : sections.length ? sections.map((section, index) => (
            <SectionBuilderCard
              key={section.id}
              country={country}
              profile={profile}
              section={section}
              media={media}
              index={index}
              count={sections.length}
              onMove={(direction) => move(index, direction)}
              onSave={(input) => run(() => saveSection.mutateAsync(input), "Section saved.")}
              onDelete={() => run(() => deleteSection.mutateAsync(section.id), "Section deleted.")}
              onAddMedia={(file) => run(async () => {
                const asset = await uploadCountryAsset(country.id, file, "gallery");
                await addMedia.mutateAsync({ storagePath: asset.storagePath, publicUrl: asset.publicUrl, caption: "", altText: "" });
              }, "Image uploaded. It is now available to this block and the gallery.")}
            />
          )) : (
            <Panel>
              <div className="py-8 text-center">
                <p className="text-lg font-semibold">Your page is ready for its first custom block</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">The standard country and SSC information still works. Add custom blocks when you want the page to become more distinctly yours.</p>
                <button type="button" onClick={() => setAdding(true)} className="mt-4 min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Add first block</button>
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-4 lg:sticky lg:top-24">
          <Panel title="Where content appears" description="Each custom block can exist on either public surface or both.">
            <div className="space-y-2 text-xs leading-5 text-muted-foreground">
              <p><strong className="text-foreground">Country page</strong> is the statistical/profile experience under Countries.</p>
              <p><strong className="text-foreground">Wiki</strong> is the longer Terra Solaris article.</p>
              <p>Turning a block off on one surface does not delete it or affect the other.</p>
            </div>
          </Panel>

          <Panel title="System-assisted writing" description="Solaris drafts only from facts already stored for this country.">
            <div className="space-y-2">
              {autoFactRows(profile).slice(0, 6).map((row) => <div key={row.label} className="rounded-lg bg-surface px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{row.label}</p><p className="mt-1 text-xs font-semibold">{row.value}</p></div>)}
              {!autoFactRows(profile).length && <p className="text-xs leading-5 text-muted-foreground">Fill in National facts in My Solaris first, then smart sections can turn those facts into editable copy.</p>}
            </div>
          </Panel>

          {media.length > 0 && (
            <Panel title="Media library" description={`${media.length} country image${media.length === 1 ? "" : "s"}`}>
              <div className="grid grid-cols-3 gap-2">
                {media.slice(0, 9).map((item) => <img key={item.id} src={item.public_url} alt={item.alt_text || item.caption || "Country media"} className="aspect-square rounded-lg object-cover" />)}
              </div>
              <p className="mt-3 text-[10px] leading-4 text-muted-foreground">Images remain reusable. Deleting a section does not delete its media.</p>
            </Panel>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Link to="/countries/$code" params={{ code: country.short_code }} className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold">Preview country</Link>
            <Link to="/wiki/$code" params={{ code: country.short_code }} className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold">Preview Wiki</Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SectionBuilderCard({
  country,
  profile,
  section,
  media,
  index,
  count,
  onMove,
  onSave,
  onDelete,
  onAddMedia,
}: {
  country: Country;
  profile: CountryProfile | null;
  section: CountryPageSection;
  media: CountryMedia[];
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => Promise<unknown>;
  onSave: (input: CountryPageSectionInput) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
  onAddMedia: (file: File) => Promise<unknown>;
}) {
  const normalized = normalizeCountryPageSection(section);
  const initial = () => ({
    heading: normalized.heading,
    kicker: normalized.kicker ?? "",
    body: normalized.body,
    sectionType: normalized.section_type,
    contentMode: normalized.content_mode,
    visibleOnCountry: normalized.visible_on_country,
    visibleOnWiki: normalized.visible_on_wiki,
    imageUrl: normalized.image_url ?? "",
    imageCaption: normalized.image_caption ?? "",
    imageLayout: normalized.image_layout,
    backgroundTint: normalized.background_tint ?? "",
    contentJson: normalized.content_json ?? {},
  });
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setValue(initial()), [section]);

  const regenerate = () => {
    const autoKind = String(value.contentJson.autoKind ?? "overview");
    setValue((current) => ({
      ...current,
      body: buildCountryAutoSection(autoKind, country, profile),
      contentMode: "auto",
    }));
  };

  const save = async () => {
    setBusy(true);
    try {
      await onSave({
        id: section.id,
        heading: value.heading,
        kicker: value.kicker,
        body: value.body,
        sectionType: value.sectionType,
        contentMode: value.contentMode,
        visibleOnCountry: value.visibleOnCountry,
        visibleOnWiki: value.visibleOnWiki,
        imageUrl: value.imageUrl || null,
        imageCaption: value.imageCaption || null,
        imageLayout: value.imageLayout,
        backgroundTint: value.backgroundTint || null,
        contentJson: value.contentJson,
        sortOrder: section.sort_order,
      });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="flex min-h-16 items-center gap-2 p-3">
        <div className="grid grid-cols-1 gap-1">
          <button type="button" disabled={index === 0} onClick={() => void onMove(-1)} aria-label="Move section up" className="grid size-9 place-items-center rounded-lg border border-border bg-background disabled:opacity-25"><ArrowUp className="size-4" /></button>
          <button type="button" disabled={index === count - 1} onClick={() => void onMove(1)} aria-label="Move section down" className="grid size-9 place-items-center rounded-lg border border-border bg-background disabled:opacity-25"><ArrowDown className="size-4" /></button>
        </div>
        <button type="button" onClick={() => setOpen((current) => !current)} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold">{section.section_type === "divider" ? "Visual divider" : section.heading || "Untitled section"}</p>
            <span className="rounded-full border border-border bg-background px-2 py-1 text-[9px] font-semibold uppercase text-muted-foreground">{String(normalized.section_type).replace("_", " ")}</span>
            {normalized.content_mode === "auto" ? <span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-semibold text-primary">Smart draft</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">{normalized.visible_on_country ? <Eye className="size-3" /> : <EyeOff className="size-3" />} Country</span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">{normalized.visible_on_wiki ? <Eye className="size-3" /> : <EyeOff className="size-3" />} Wiki</span>
          </div>
        </button>
        <button type="button" onClick={() => setOpen((current) => !current)} className="min-h-11 rounded-xl border border-border px-3 text-xs font-semibold">{open ? "Close" : "Edit"}</button>
      </div>

      {open && (
        <div className="border-t border-border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Block type" value={value.sectionType} onChange={(next) => setValue((current) => ({ ...current, sectionType: next as CountrySectionType }))} options={[
              ["rich_text", "Text / article"], ["image", "Image feature"], ["quote", "Quote / statement"], ["facts", "Quick facts"], ["gallery", "Gallery"], ["divider", "Divider"],
            ]} />
            <SelectField label="Image layout" value={value.imageLayout} onChange={(next) => setValue((current) => ({ ...current, imageLayout: next as CountrySectionImageLayout }))} options={[
              ["wide", "Wide"], ["split", "Split text + image"], ["left", "Image left"], ["right", "Image right"], ["full", "Full bleed"],
            ]} disabled={!value.imageUrl && value.sectionType !== "image"} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <VisibilityButton label="Country page" active={value.visibleOnCountry} onClick={() => setValue((current) => ({ ...current, visibleOnCountry: !current.visibleOnCountry }))} />
            <VisibilityButton label="Wiki page" active={value.visibleOnWiki} onClick={() => setValue((current) => ({ ...current, visibleOnWiki: !current.visibleOnWiki }))} />
          </div>

          {value.sectionType !== "divider" && (
            <div className="mt-4 space-y-3">
              <TextField label="Small heading / kicker" value={value.kicker} onChange={(kicker) => setValue((current) => ({ ...current, kicker }))} placeholder="Optional" />
              <TextField label="Section heading" value={value.heading} onChange={(heading) => setValue((current) => ({ ...current, heading }))} />
            </div>
          )}

          {value.sectionType === "rich_text" || value.sectionType === "quote" || value.sectionType === "image" ? (
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{value.sectionType === "quote" ? "Quote / statement" : "Text"}</span>
                {value.contentMode === "auto" && (
                  <button type="button" onClick={regenerate} className="min-h-9 rounded-lg border border-primary/30 bg-primary/10 px-3 text-[11px] font-semibold text-primary"><Sparkles className="mr-1 inline size-3" /> Regenerate from saved facts</button>
                )}
              </div>
              <textarea value={value.body} onChange={(event) => setValue((current) => ({ ...current, body: event.target.value, contentMode: "manual" }))} rows={value.sectionType === "quote" ? 4 : 7} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm" />
              {normalized.content_mode === "auto" && value.contentMode === "manual" ? <p className="mt-1 text-[10px] text-muted-foreground">Edited manually. Solaris will not overwrite your changes unless you explicitly regenerate.</p> : null}
            </div>
          ) : null}

          {value.sectionType === "facts" && (
            <div className="mt-4 rounded-xl border border-border bg-background p-3">
              <p className="text-xs font-semibold">Automatic fact rows</p>
              <div className="mt-2 grid grid-cols-2 gap-2">{autoFactRows(profile).map((row) => <div key={row.label} className="rounded-lg bg-surface p-2"><p className="text-[9px] uppercase text-muted-foreground">{row.label}</p><p className="mt-1 text-xs font-semibold">{row.value}</p></div>)}</div>
              {!autoFactRows(profile).length && <p className="mt-2 text-xs text-muted-foreground">No structured facts are filled in yet.</p>}
            </div>
          )}

          {(value.sectionType === "image" || value.sectionType === "rich_text") && (
            <div className="mt-4 rounded-xl border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">Section image</p><label className="cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-[11px] font-semibold"><ImagePlus className="mr-1 inline size-3" /> Upload<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => event.target.files?.[0] && void onAddMedia(event.target.files[0])} /></label></div>
              <select value={value.imageUrl} onChange={(event) => setValue((current) => ({ ...current, imageUrl: event.target.value }))} className="mt-3 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"><option value="">No image</option>{media.map((item) => <option key={item.id} value={item.public_url}>{item.caption || item.alt_text || "Country image"}</option>)}</select>
              {value.imageUrl && <img src={value.imageUrl} alt="Section preview" className="mt-3 aspect-video w-full rounded-xl object-cover" />}
              <TextField className="mt-3" label="Image caption" value={value.imageCaption} onChange={(imageCaption) => setValue((current) => ({ ...current, imageCaption }))} />
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Section tint</span><div className="flex gap-2"><input type="color" value={value.backgroundTint || "#0d2634"} onChange={(event) => setValue((current) => ({ ...current, backgroundTint: event.target.value }))} className="h-11 w-14 rounded-xl border border-border bg-background p-1" /><button type="button" onClick={() => setValue((current) => ({ ...current, backgroundTint: "" }))} className="min-h-11 flex-1 rounded-xl border border-border bg-background px-3 text-xs font-semibold">Use page default</button></div></label>
          </div>

          <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
            <button type="button" disabled={busy} onClick={() => void save()} className="min-h-12 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save block"}</button>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm("Delete this page block? The media library is not deleted.")) void onDelete(); }} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-destructive/30 text-destructive" aria-label="Delete section"><Trash2 className="size-4" /></button>
          </div>
        </div>
      )}
    </section>
  );
}

function VisibilityButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`min-h-12 rounded-xl border px-3 text-xs font-semibold ${active ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}>{active ? <Eye className="mr-1 inline size-3.5" /> : <EyeOff className="mr-1 inline size-3.5" />}{label}</button>;
}

function TextField({ label, value, onChange, placeholder, className = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" /></label>;
}

function SelectField({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: Array<readonly [string, string]>; disabled?: boolean }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-40">{options.map(([option, labelText]) => <option key={option} value={option}>{labelText}</option>)}</select></label>;
}
