import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import {
  uploadCountryAsset,
  useAddCountryMedia,
  useAvailableCountryClaims,
  useClaimCountryAccount,
  useCountryWorldProfile,
  useDeleteCountryMedia,
  useDeleteCountrySection,
  useMyCountryAccount,
  useSaveCountryProfile,
  useSaveCountrySection,
  useSaveOwnedCountryEntry,
  useUpdateOwnedCountryIdentity,
  type CountryMedia,
  type CountryProfileSection,
} from "@/lib/country-account";
import {
  editionLabel,
  useAllParticipants,
  useAllShows,
  useEditions,
  type Participant,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/country-hub/")({
  head: () => ({ meta: [{ title: "My country — Solaris Studio" }] }),
  component: CountryHubPage,
});

const EMPTY_PROFILE = {
  capital: "",
  government_type: "",
  leader_name: "",
  leader_title: "",
  demonym: "",
  official_languages: "",
  currency: "",
  motto: "",
  population: "",
  established: "",
  summary: "",
};

function CountryHubPage() {
  const { data: accountData, isLoading } = useMyCountryAccount();
  const access = accountData?.access;
  const country = accountData?.country;

  if (isLoading) {
    return <AppShell><p className="text-sm text-muted-foreground">Loading your country…</p></AppShell>;
  }

  if (access?.isOrganizer && !country) {
    return (
      <AppShell>
        <PageHeader eyebrow="Organizer account" title="Country Hub" description="Organizer accounts use Studio. Country ownership is kept separate so country permissions can never spill into organizer permissions." />
        <Panel title="Open organizer tools">
          <Link to="/admin" className="inline-flex min-h-11 items-center rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground">Open Studio →</Link>
        </Panel>
      </AppShell>
    );
  }

  if (!country) {
    return <ClaimCountry />;
  }

  return <OwnedCountryHub country={country} />;
}

function ClaimCountry() {
  const { data } = useAvailableCountryClaims();
  const claim = useClaimCountryAccount();
  const [countryId, setCountryId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (!countryId) return;
    try {
      await claim.mutateAsync(countryId);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Country could not be claimed.");
    }
  };

  return (
    <AppShell>
      <PageHeader eyebrow="Country account" title="Choose your Terra Solaris country" description="Each country can belong to one account only. Once claimed, the account can maintain that country's profile and entries without organizer approval." />
      <div className="mx-auto max-w-xl">
        <Panel title="Country ownership">
          {data?.schemaReady === false ? (
            <p className="text-sm text-muted-foreground">Country account registration is temporarily unavailable.</p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <select value={countryId} onChange={(event) => setCountryId(event.target.value)} required className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm">
                <option value="">Choose an unclaimed country…</option>
                {(data?.countries ?? []).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.short_code})</option>)}
              </select>
              <p className="text-xs leading-relaxed text-muted-foreground">This choice is exclusive. Country transfers should be handled by an organizer rather than by making a second account.</p>
              <button disabled={!countryId || claim.isPending} className="min-h-11 w-full rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60">{claim.isPending ? "Claiming…" : "Claim country"}</button>
              {message && <p className="text-sm text-destructive">{message}</p>}
            </form>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

function OwnedCountryHub({ country }: { country: NonNullable<ReturnType<typeof useMyCountryAccount>["data"]>["country"] }) {
  const world = useCountryWorldProfile(country!.id);
  const updateIdentity = useUpdateOwnedCountryIdentity();
  const saveProfile = useSaveCountryProfile(country!.id);
  const saveSection = useSaveCountrySection(country!.id);
  const deleteSection = useDeleteCountrySection(country!.id);
  const addMedia = useAddCountryMedia(country!.id);
  const deleteMedia = useDeleteCountryMedia(country!.id);
  const saveEntry = useSaveOwnedCountryEntry();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();

  const [message, setMessage] = useState<string | null>(null);
  const [identity, setIdentity] = useState({ name: country!.name, nativeName: country!.native_name ?? "", region: country!.region, description: country!.description ?? "", accentColor: country!.accent_color, flagImage: country!.flag_image as string | null });
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [flagBusy, setFlagBusy] = useState(false);
  const [galleryFile, setGalleryFile] = useState<File | null>(null);
  const [galleryCaption, setGalleryCaption] = useState("");
  const [galleryAlt, setGalleryAlt] = useState("");
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [newSection, setNewSection] = useState({ heading: "", body: "", image_url: "", image_caption: "" });
  const [addEntry, setAddEntry] = useState({ editionId: "", showId: "", artist: "", song: "", notes: "" });

  useEffect(() => {
    setIdentity({ name: country!.name, nativeName: country!.native_name ?? "", region: country!.region, description: country!.description ?? "", accentColor: country!.accent_color, flagImage: country!.flag_image });
  }, [country]);

  useEffect(() => {
    const current = world.data?.profile;
    setProfile(current ? {
      capital: current.capital ?? "", government_type: current.government_type ?? "", leader_name: current.leader_name ?? "", leader_title: current.leader_title ?? "", demonym: current.demonym ?? "", official_languages: current.official_languages ?? "", currency: current.currency ?? "", motto: current.motto ?? "", population: current.population ?? "", established: current.established ?? "", summary: current.summary ?? "",
    } : EMPTY_PROFILE);
  }, [world.data?.profile]);

  const myEntries = useMemo(() => (participants ?? []).filter((entry) => entry.country_id === country!.id).sort((a, b) => (editions?.find((edition) => edition.id === b.edition_id)?.edition_number ?? -1) - (editions?.find((edition) => edition.id === a.edition_id)?.edition_number ?? -1)), [participants, editions, country]);
  const addShows = (shows ?? []).filter((show) => show.edition_id === addEntry.editionId);

  const run = async (task: () => Promise<unknown>, success: string) => {
    setMessage(null);
    try { await task(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : "That change could not be saved."); }
  };

  const uploadFlag = async (file: File) => {
    setFlagBusy(true); setMessage(null);
    try {
      const asset = await uploadCountryAsset(country!.id, file, "flags");
      setIdentity((current) => ({ ...current, flagImage: asset.publicUrl }));
      setMessage("Flag uploaded. Save country identity to publish it everywhere.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Flag upload failed."); }
    finally { setFlagBusy(false); }
  };

  const uploadGallery = async () => {
    if (!galleryFile) return;
    setGalleryBusy(true); setMessage(null);
    try {
      const asset = await uploadCountryAsset(country!.id, galleryFile, "gallery");
      await addMedia.mutateAsync({ storagePath: asset.storagePath, publicUrl: asset.publicUrl, caption: galleryCaption, altText: galleryAlt });
      setGalleryFile(null); setGalleryCaption(""); setGalleryAlt(""); setMessage("Image added to the country gallery.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Image upload failed."); }
    finally { setGalleryBusy(false); }
  };

  const saveNewSection = async () => {
    await run(async () => {
      await saveSection.mutateAsync({ heading: newSection.heading, body: newSection.body, image_url: newSection.image_url || null, image_caption: newSection.image_caption || null, sort_order: world.data?.sections.length ?? 0 });
      setNewSection({ heading: "", body: "", image_url: "", image_caption: "" });
    }, "Section added.");
  };

  const addHistoricalEntry = async () => {
    await run(async () => {
      await saveEntry.mutateAsync({ participantId: null, editionId: addEntry.editionId, showId: addEntry.showId || null, artist: addEntry.artist, song: addEntry.song, notes: addEntry.notes });
      setAddEntry({ editionId: "", showId: "", artist: "", song: "", notes: "" });
    }, "Entry saved. It now uses the same contest data as Studio and the edition pages.");
  };

  return (
    <AppShell>
      <PageHeader eyebrow="Country account" title={country!.name} description="Maintain your country's SSC entries and its Terra Solaris profile. Contest administration, voting and results remain organizer-only." actions={<Link to="/countries/$code" params={{ code: country!.short_code }} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">View public page →</Link>} />

      {message && <p className="mb-5 rounded-xl border border-border bg-surface px-4 py-3 text-sm">{message}</p>}

      <div className="space-y-5">
        <Panel title="Country identity" description="Name and flag changes propagate through country pages and linked contest entities. The stable country code is intentionally organizer-controlled.">
          <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="flex items-center gap-3"><FlagChip code={country!.short_code} color={identity.accentColor} image={identity.flagImage} size="xl" /><div><p className="text-sm font-semibold">{country!.short_code}</p><p className="text-xs text-muted-foreground">Stable code</p></div></div>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={flagBusy} onChange={(event) => event.target.files?.[0] && void uploadFlag(event.target.files[0])} className="block w-full text-xs" />
              {identity.flagImage && <button type="button" onClick={() => setIdentity((current) => ({ ...current, flagImage: null }))} className="text-xs text-muted-foreground">Remove flag</button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Country name" value={identity.name} onChange={(value) => setIdentity((current) => ({ ...current, name: value }))} />
              <Input label="Native name" value={identity.nativeName} onChange={(value) => setIdentity((current) => ({ ...current, nativeName: value }))} />
              <Input label="Region" value={identity.region} onChange={(value) => setIdentity((current) => ({ ...current, region: value }))} />
              <label className="block"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Accent colour</span><input type="color" value={identity.accentColor} onChange={(event) => setIdentity((current) => ({ ...current, accentColor: event.target.value }))} className="h-11 w-full rounded-xl border border-border bg-surface p-1" /></label>
              <label className="block sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Short description</span><textarea value={identity.description} onChange={(event) => setIdentity((current) => ({ ...current, description: event.target.value }))} rows={3} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm" /></label>
              <button type="button" disabled={updateIdentity.isPending} onClick={() => void run(() => updateIdentity.mutateAsync(identity), "Country identity updated everywhere." )} className="min-h-11 rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-2">Save country identity</button>
            </div>
          </div>
        </Panel>

        <Panel title="Terra Solaris infobox" description="Structured facts for the public country page.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input label="Capital" value={profile.capital} onChange={(value) => setProfile((current) => ({ ...current, capital: value }))} />
            <Input label="Government type" value={profile.government_type} placeholder="Kingdom, republic, federation…" onChange={(value) => setProfile((current) => ({ ...current, government_type: value }))} />
            <Input label="Leader name" value={profile.leader_name} onChange={(value) => setProfile((current) => ({ ...current, leader_name: value }))} />
            <Input label="Leader title" value={profile.leader_title} placeholder="President, Queen, Prime Minister…" onChange={(value) => setProfile((current) => ({ ...current, leader_title: value }))} />
            <Input label="Demonym" value={profile.demonym} onChange={(value) => setProfile((current) => ({ ...current, demonym: value }))} />
            <Input label="Official languages" value={profile.official_languages} onChange={(value) => setProfile((current) => ({ ...current, official_languages: value }))} />
            <Input label="Currency" value={profile.currency} onChange={(value) => setProfile((current) => ({ ...current, currency: value }))} />
            <Input label="Population" value={profile.population} placeholder="Fictional values are fine" onChange={(value) => setProfile((current) => ({ ...current, population: value }))} />
            <Input label="Established" value={profile.established} onChange={(value) => setProfile((current) => ({ ...current, established: value }))} />
            <Input label="Motto" value={profile.motto} onChange={(value) => setProfile((current) => ({ ...current, motto: value }))} className="lg:col-span-3" />
            <label className="block sm:col-span-2 lg:col-span-3"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Country introduction</span><textarea value={profile.summary} onChange={(event) => setProfile((current) => ({ ...current, summary: event.target.value }))} rows={5} className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm" /></label>
            <button type="button" disabled={saveProfile.isPending} onClick={() => void run(() => saveProfile.mutateAsync(profile), "Country profile updated." )} className="min-h-11 rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-2 lg:col-span-3">Save profile</button>
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
          <Panel title="Article sections" description="Add as many Wikipedia-style heading and body sections as you want.">
            <div className="space-y-3">
              {(world.data?.sections ?? []).map((section) => <SectionEditor key={section.id} section={section} media={world.data?.media ?? []} onSave={(values) => run(() => saveSection.mutateAsync(values), "Section updated.")} onDelete={() => run(() => deleteSection.mutateAsync(section.id), "Section removed.")} />)}
              <div className="rounded-xl border border-border bg-surface p-3">
                <p className="mb-3 text-sm font-semibold">New section</p>
                <Input label="Heading" value={newSection.heading} onChange={(value) => setNewSection((current) => ({ ...current, heading: value }))} />
                <label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Body</span><textarea value={newSection.body} onChange={(event) => setNewSection((current) => ({ ...current, body: event.target.value }))} rows={6} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" /></label>
                <MediaSelect className="mt-3" media={world.data?.media ?? []} value={newSection.image_url} onChange={(value) => setNewSection((current) => ({ ...current, image_url: value }))} />
                <Input className="mt-3" label="Image caption" value={newSection.image_caption} onChange={(value) => setNewSection((current) => ({ ...current, image_caption: value }))} />
                <button type="button" disabled={!newSection.heading.trim() || saveSection.isPending} onClick={() => void saveNewSection()} className="mt-3 min-h-10 rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-50">Add section</button>
              </div>
            </div>
          </Panel>

          <Panel title="Country gallery" description="JPG, PNG, WebP or GIF. Maximum 8 MB per image.">
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => setGalleryFile(event.target.files?.[0] ?? null)} className="block w-full text-xs" />
            <Input className="mt-3" label="Caption" value={galleryCaption} onChange={setGalleryCaption} />
            <Input className="mt-3" label="Alt text" value={galleryAlt} onChange={setGalleryAlt} />
            <button type="button" disabled={!galleryFile || galleryBusy} onClick={() => void uploadGallery()} className="mt-3 min-h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold disabled:opacity-50">{galleryBusy ? "Uploading…" : "Upload image"}</button>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(world.data?.media ?? []).map((media) => <div key={media.id} className="overflow-hidden rounded-xl bg-surface"><img src={media.public_url} alt={media.alt_text ?? media.caption ?? "Country image"} className="aspect-[4/3] w-full object-cover" /><div className="p-2"><p className="truncate text-[11px] text-muted-foreground">{media.caption || "No caption"}</p><button type="button" onClick={() => void run(() => deleteMedia.mutateAsync(media), "Image removed.")} className="mt-1 text-[10px] font-semibold text-destructive">Delete</button></div></div>)}
            </div>
          </Panel>
        </div>

        <Panel title="SSC entries" description="Edit the artist, song and your own notes. Running order, qualification, voting and results remain locked to organizers.">
          <div className="space-y-3">
            {myEntries.map((entry) => <EntryEditor key={entry.id} entry={entry} edition={editions?.find((item) => item.id === entry.edition_id)} showName={shows?.find((show) => show.id === entry.show_id)?.name ?? "Show"} onSave={(values) => run(() => saveEntry.mutateAsync(values), "Entry updated everywhere." )} />)}
          </div>
          <div className="mt-5 rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-semibold">Add a missing historical entry</p>
            <p className="mt-1 text-xs text-muted-foreground">If an entry for that edition already exists, this updates its artist/song instead of creating a duplicate.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label><span className="mb-1 block text-xs font-semibold text-muted-foreground">Edition</span><select value={addEntry.editionId} onChange={(event) => setAddEntry((current) => ({ ...current, editionId: event.target.value, showId: "" }))} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="">Choose edition…</option>{(editions ?? []).map((edition) => <option key={edition.id} value={edition.id}>{editionLabel(edition)}</option>)}</select></label>
              <label><span className="mb-1 block text-xs font-semibold text-muted-foreground">Show</span><select value={addEntry.showId} onChange={(event) => setAddEntry((current) => ({ ...current, showId: event.target.value }))} disabled={!addEntry.editionId} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-50"><option value="">Choose show…</option>{addShows.map((show) => <option key={show.id} value={show.id}>{show.name}</option>)}</select></label>
              <Input label="Artist" value={addEntry.artist} onChange={(value) => setAddEntry((current) => ({ ...current, artist: value }))} />
              <Input label="Song" value={addEntry.song} onChange={(value) => setAddEntry((current) => ({ ...current, song: value }))} />
              <Input label="Notes" value={addEntry.notes} onChange={(value) => setAddEntry((current) => ({ ...current, notes: value }))} className="sm:col-span-2" />
              <button type="button" disabled={!addEntry.editionId || !addEntry.showId || !addEntry.artist.trim() || !addEntry.song.trim() || saveEntry.isPending} onClick={() => void addHistoricalEntry()} className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-50 sm:col-span-2">Save historical entry</button>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function Input({ label, value, onChange, placeholder, className = "" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm" /></label>;
}

function MediaSelect({ media, value, onChange, className = "" }: { media: CountryMedia[]; value: string; onChange: (value: string) => void; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-1 block text-xs font-semibold text-muted-foreground">Section image</span><select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"><option value="">No image</option>{media.map((item) => <option key={item.id} value={item.public_url}>{item.caption || item.alt_text || "Gallery image"}</option>)}</select></label>;
}

function SectionEditor({ section, media, onSave, onDelete }: { section: CountryProfileSection; media: CountryMedia[]; onSave: (values: { id: string; heading: string; body: string; image_url: string | null; image_caption: string | null; sort_order: number }) => Promise<unknown>; onDelete: () => Promise<unknown> }) {
  const [value, setValue] = useState({ heading: section.heading, body: section.body, image_url: section.image_url ?? "", image_caption: section.image_caption ?? "", sort_order: section.sort_order });
  useEffect(() => setValue({ heading: section.heading, body: section.body, image_url: section.image_url ?? "", image_caption: section.image_caption ?? "", sort_order: section.sort_order }), [section]);
  return <div className="rounded-xl bg-surface p-3"><Input label="Heading" value={value.heading} onChange={(heading) => setValue((current) => ({ ...current, heading }))} /><label className="mt-3 block"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Body</span><textarea value={value.body} onChange={(event) => setValue((current) => ({ ...current, body: event.target.value }))} rows={5} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" /></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><MediaSelect media={media} value={value.image_url} onChange={(image_url) => setValue((current) => ({ ...current, image_url }))} /><Input label="Image caption" value={value.image_caption} onChange={(image_caption) => setValue((current) => ({ ...current, image_caption }))} /></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => void onSave({ id: section.id, heading: value.heading, body: value.body, image_url: value.image_url || null, image_caption: value.image_caption || null, sort_order: value.sort_order })} className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold">Save</button><button type="button" onClick={() => void onDelete()} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-destructive">Delete</button></div></div>;
}

function EntryEditor({ entry, edition, showName, onSave }: { entry: Participant; edition: { edition_number: number | null; name: string; year: number | null } | undefined; showName: string; onSave: (values: { participantId: string; editionId: string; showId: string | null; artist: string; song: string; notes: string }) => Promise<unknown> }) {
  const [artist, setArtist] = useState(entry.artist ?? ""); const [song, setSong] = useState(entry.song ?? ""); const [notes, setNotes] = useState(entry.notes ?? "");
  useEffect(() => { setArtist(entry.artist ?? ""); setSong(entry.song ?? ""); setNotes(entry.notes ?? ""); }, [entry]);
  return <div className="rounded-xl bg-surface p-3"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">{edition ? editionLabel(edition as any) : "Edition"}</p><p className="text-[11px] text-muted-foreground">{showName}</p></div></div><div className="grid gap-3 sm:grid-cols-2"><Input label="Artist" value={artist} onChange={setArtist} /><Input label="Song" value={song} onChange={setSong} /><Input label="Notes" value={notes} onChange={setNotes} className="sm:col-span-2" /><button type="button" disabled={!artist.trim() || !song.trim()} onClick={() => void onSave({ participantId: entry.id, editionId: entry.edition_id, showId: entry.show_id, artist, song, notes })} className="min-h-10 rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-50 sm:col-span-2">Save entry</button></div></div>;
}
