import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { ProfileActivityPanel } from "@/components/country/ProfileActivityPanel";
import {
  uploadCountryAsset,
  useAddCountryMedia,
  useAvailableCountryClaims,
  useClaimCountryAccount,
  useCountryWorldProfile,
  useDeleteCountryMedia,
  useDeleteCountrySection,
  useMyCountryAccount,
  useSaveCountryEntry,
  useSaveCountryProfile,
  useSaveCountrySection,
  useUpdateCountryIdentity,
  type CountryMedia,
  type CountryProfileSection,
} from "@/lib/country-account";
import { useSaveEntryListeningLinks } from "@/lib/entry-listening";
import { listenLinksFrom } from "@/lib/entry-utils";
import {
  editionLabel,
  useAllContestEntities,
  useAllParticipants,
  useAllShows,
  useCountries,
  useEditions,
  type Country,
  type Participant,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/country-hub/")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({ meta: [{ title: "My Solaris — Solaris Studio" }] }),
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
  const { country: targetCountryId } = Route.useSearch();
  const { data: accountData, isLoading } = useMyCountryAccount();
  const { data: countries, isLoading: countriesLoading } = useCountries();
  const access = accountData?.access;
  const ownCountry = accountData?.country;

  const adminTarget =
    access?.isOrganizer && targetCountryId
      ? (countries ?? []).find((country) => country.id === targetCountryId)
      : undefined;

  const country = adminTarget ?? ownCountry;
  const organizerOverride = Boolean(access?.isOrganizer && targetCountryId && adminTarget);

  if (isLoading || (targetCountryId && access?.isOrganizer && countriesLoading)) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading My Solaris…</p>
      </AppShell>
    );
  }

  if (targetCountryId && access?.isOrganizer && !adminTarget) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Organizer override"
          title="Country not found"
          description="That Terra Solaris country could not be loaded."
        />
        <Link
          to="/admin/country-accounts"
          className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
        >
          Back to country accounts
        </Link>
      </AppShell>
    );
  }

  if (!access?.isOrganizer && access?.countryStatus === "suspended" && ownCountry) {
    return <SuspendedCountry country={ownCountry} reason={access.suspensionReason} />;
  }

  if (!country) {
    return <ClaimCountry isOrganizer={Boolean(access?.isOrganizer)} />;
  }

  return (
    <OwnedCountryHub
      country={country}
      isOrganizer={Boolean(access?.isOrganizer)}
      organizerOverride={organizerOverride}
      targetCountryId={targetCountryId}
    />
  );
}

function SuspendedCountry({ country, reason }: { country: Country; reason: string | null }) {
  return (
    <AppShell>
      <PageHeader
        eyebrow="My Solaris"
        title={`${country.name} is suspended`}
        description="Your personal Solaris profile remains available, but country editing is currently disabled by an organizer."
        actions={
          <Link
            to="/countries/$code"
            params={{ code: country.short_code }}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          >
            View public page →
          </Link>
        }
      />
      <div className="space-y-5">
        <ProfileActivityPanel />
        <Panel title="Country account status">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {reason || "No suspension reason was provided."}
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}

function ClaimCountry({ isOrganizer }: { isOrganizer: boolean }) {
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
      <PageHeader
        eyebrow="My Solaris"
        title={isOrganizer ? "Your Solaris profile" : "Choose your Terra Solaris country"}
        description={
          isOrganizer
            ? "Your personal profile and organizer powers are separate. Organizer accounts can manage countries without claiming one."
            : "Your profile, activity and country tools live together in My Solaris. Choose your country to start."
        }
        actions={
          isOrganizer ? (
            <Link
              to="/admin/country-accounts"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              Manage all countries →
            </Link>
          ) : undefined
        }
      />
      <div className="space-y-5">
        <ProfileActivityPanel />
        {!isOrganizer && (
          <div className="mx-auto max-w-xl">
            <Panel title="Country ownership">
              {data?.schemaReady === false ? (
                <p className="text-sm text-muted-foreground">
                  Country account registration is temporarily unavailable.
                </p>
              ) : (
                <form onSubmit={submit} className="space-y-3">
                  <select
                    value={countryId}
                    onChange={(event) => setCountryId(event.target.value)}
                    required
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  >
                    <option value="">Choose an unclaimed country…</option>
                    {(data?.countries ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.short_code})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    One account can have one country, and each country can only belong to one account.
                  </p>
                  <button
                    disabled={!countryId || claim.isPending}
                    className="min-h-11 w-full rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {claim.isPending ? "Claiming…" : "Claim country"}
                  </button>
                  {message && <p className="text-sm text-destructive">{message}</p>}
                </form>
              )}
            </Panel>
          </div>
        )}
      </div>
    </AppShell>
  );
}

type EditionEntry = {
  editionId: string;
  entry: Participant;
  appearances: Participant[];
};

type HubTab = "overview" | "country" | "page" | "entries";

const HUB_TABS: Array<{ id: HubTab; label: string; description: string }> = [
  { id: "overview", label: "Overview", description: "Profile, activity and shortcuts" },
  { id: "country", label: "Country", description: "Identity and national facts" },
  { id: "page", label: "Page & media", description: "Article sections and images" },
  { id: "entries", label: "Entries", description: "SSC songs and listening links" },
];

function entryCompleteness(entry: Participant) {
  return (
    Number(entry.show_id == null) * 20 +
    Number(Boolean(entry.artist)) * 4 +
    Number(Boolean(entry.song)) * 4 +
    Number(Boolean(entry.notes))
  );
}

function OwnedCountryHub({
  country,
  isOrganizer,
  organizerOverride,
  targetCountryId,
}: {
  country: Country;
  isOrganizer: boolean;
  organizerOverride: boolean;
  targetCountryId?: string;
}) {
  const world = useCountryWorldProfile(country.id);
  const updateIdentity = useUpdateCountryIdentity(country.id, organizerOverride);
  const saveProfile = useSaveCountryProfile(country.id);
  const saveSection = useSaveCountrySection(country.id);
  const deleteSection = useDeleteCountrySection(country.id);
  const addMedia = useAddCountryMedia(country.id);
  const deleteMedia = useDeleteCountryMedia(country.id);
  const saveEntry = useSaveCountryEntry(country.id, organizerOverride);
  const saveEntryLinks = useSaveEntryListeningLinks(country.id, organizerOverride);
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: contestEntities } = useAllContestEntities();

  const [activeTab, setActiveTab] = useState<HubTab>("overview");
  const [message, setMessage] = useState<string | null>(null);
  const [identity, setIdentity] = useState({
    name: country.name,
    nativeName: country.native_name ?? "",
    region: country.region,
    description: country.description ?? "",
    accentColor: country.accent_color,
    flagImage: country.flag_image as string | null,
  });
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [flagBusy, setFlagBusy] = useState(false);
  const [galleryFile, setGalleryFile] = useState<File | null>(null);
  const [galleryCaption, setGalleryCaption] = useState("");
  const [galleryAlt, setGalleryAlt] = useState("");
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [newSection, setNewSection] = useState({
    heading: "",
    body: "",
    image_url: "",
    image_caption: "",
  });
  const [addEntry, setAddEntry] = useState({
    editionId: "",
    artist: "",
    song: "",
    notes: "",
    youtubeUrl: "",
    spotifyUrl: "",
    appleMusicUrl: "",
  });

  useEffect(() => {
    setIdentity({
      name: country.name,
      nativeName: country.native_name ?? "",
      region: country.region,
      description: country.description ?? "",
      accentColor: country.accent_color,
      flagImage: country.flag_image,
    });
  }, [country]);

  useEffect(() => {
    const current = world.data?.profile;
    setProfile(
      current
        ? {
            capital: current.capital ?? "",
            government_type: current.government_type ?? "",
            leader_name: current.leader_name ?? "",
            leader_title: current.leader_title ?? "",
            demonym: current.demonym ?? "",
            official_languages: current.official_languages ?? "",
            currency: current.currency ?? "",
            motto: current.motto ?? "",
            population: current.population ?? "",
            established: current.established ?? "",
            summary: current.summary ?? "",
          }
        : EMPTY_PROFILE,
    );
  }, [world.data?.profile]);

  const ownedEntityIds = useMemo(
    () =>
      new Set(
        (contestEntities ?? [])
          .filter((entity) => entity.country_id === country.id)
          .map((entity) => entity.id),
      ),
    [contestEntities, country.id],
  );

  const myEntries = useMemo<EditionEntry[]>(() => {
    const owned = (participants ?? []).filter(
      (entry) =>
        entry.country_id === country.id ||
        Boolean(entry.contest_entity_id && ownedEntityIds.has(entry.contest_entity_id)),
    );
    const byEdition = new Map<string, EditionEntry>();

    for (const entry of owned) {
      const current = byEdition.get(entry.edition_id);
      if (!current) {
        byEdition.set(entry.edition_id, {
          editionId: entry.edition_id,
          entry,
          appearances: [entry],
        });
        continue;
      }
      current.appearances.push(entry);
      if (entryCompleteness(entry) > entryCompleteness(current.entry)) current.entry = entry;
    }

    return [...byEdition.values()].sort(
      (a, b) =>
        (editions?.find((edition) => edition.id === b.editionId)?.edition_number ?? -1) -
        (editions?.find((edition) => edition.id === a.editionId)?.edition_number ?? -1),
    );
  }, [participants, editions, country.id, ownedEntityIds]);

  const countrySearch = targetCountryId ? { country: targetCountryId } : {};

  const run = async (task: () => Promise<unknown>, success: string) => {
    setMessage(null);
    try {
      await task();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That change could not be saved.");
    }
  };

  const uploadFlag = async (file: File) => {
    setFlagBusy(true);
    setMessage(null);
    try {
      const asset = await uploadCountryAsset(country.id, file, "flags");
      setIdentity((current) => ({ ...current, flagImage: asset.publicUrl }));
      setMessage("Flag uploaded. Save country identity to publish it everywhere.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Flag upload failed.");
    } finally {
      setFlagBusy(false);
    }
  };

  const uploadGallery = async () => {
    if (!galleryFile) return;
    setGalleryBusy(true);
    setMessage(null);
    try {
      const asset = await uploadCountryAsset(country.id, galleryFile, "gallery");
      await addMedia.mutateAsync({
        storagePath: asset.storagePath,
        publicUrl: asset.publicUrl,
        caption: galleryCaption,
        altText: galleryAlt,
      });
      setGalleryFile(null);
      setGalleryCaption("");
      setGalleryAlt("");
      setMessage("Image added to the country gallery.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setGalleryBusy(false);
    }
  };

  const saveNewSection = async () => {
    await run(async () => {
      await saveSection.mutateAsync({
        heading: newSection.heading,
        body: newSection.body,
        image_url: newSection.image_url || null,
        image_caption: newSection.image_caption || null,
        sort_order: world.data?.sections.length ?? 0,
      });
      setNewSection({ heading: "", body: "", image_url: "", image_caption: "" });
    }, "Section added.");
  };

  const addHistoricalEntry = async () => {
    await run(async () => {
      await saveEntry.mutateAsync({
        participantId: null,
        editionId: addEntry.editionId,
        showId: null,
        artist: addEntry.artist,
        song: addEntry.song,
        notes: addEntry.notes,
      });
      await saveEntryLinks.mutateAsync({
        participantId: null,
        editionId: addEntry.editionId,
        youtubeUrl: addEntry.youtubeUrl,
        spotifyUrl: addEntry.spotifyUrl,
        appleMusicUrl: addEntry.appleMusicUrl,
      });
      setAddEntry({
        editionId: "",
        artist: "",
        song: "",
        notes: "",
        youtubeUrl: "",
        spotifyUrl: "",
        appleMusicUrl: "",
      });
    }, "Edition participation and listening links saved.");
  };

  const mediaCount = world.data?.media.length ?? 0;
  const sectionCount = world.data?.sections.length ?? 0;

  return (
    <AppShell>
      <PageHeader
        eyebrow={organizerOverride ? "Organizer override" : "My Solaris"}
        title={organizerOverride ? `Editing ${country.name}` : country.name}
        description={
          organizerOverride
            ? "Choose one area below. Changes apply to this country's public pages and SSC data."
            : "Your Solaris home. Choose what you want to work on instead of scrolling through everything at once."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/countries/$code"
              params={{ code: country.short_code }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
            >
              Public page
            </Link>
            {isOrganizer && (
              <Link
                to="/admin/country-accounts"
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                Manage countries
              </Link>
            )}
          </div>
        }
      />

      {message && (
        <p className="mb-5 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          {message}
        </p>
      )}

      <nav
        aria-label="My Solaris sections"
        className="mb-5 grid gap-2 rounded-2xl border border-border/70 bg-surface/55 p-2 sm:grid-cols-2 xl:grid-cols-4"
      >
        {HUB_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-current={active ? "page" : undefined}
              className={`min-h-16 rounded-xl px-3 py-2.5 text-left transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-background/35 text-foreground hover:bg-surface-strong"
              }`}
            >
              <span className="block text-sm font-semibold">{tab.label}</span>
              <span
                className={`mt-0.5 block text-[11px] leading-4 ${
                  active ? "text-primary-foreground/75" : "text-muted-foreground"
                }`}
              >
                {tab.description}
              </span>
            </button>
          );
        })}
      </nav>

      {activeTab === "overview" && (
        <div className="space-y-5">
          {!organizerOverride && <ProfileActivityPanel />}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <OverviewCard
              label="Country details"
              value={profile.capital || identity.region || "Add details"}
              hint="Name, flag and national facts"
              onClick={() => setActiveTab("country")}
            />
            <OverviewCard
              label="Page content"
              value={`${sectionCount} section${sectionCount === 1 ? "" : "s"}`}
              hint={`${mediaCount} uploaded image${mediaCount === 1 ? "" : "s"}`}
              onClick={() => setActiveTab("page")}
            />
            <OverviewCard
              label="SSC entries"
              value={`${myEntries.length} edition${myEntries.length === 1 ? "" : "s"}`}
              hint="Songs and listening links"
              onClick={() => setActiveTab("entries")}
            />
            <Link
              to="/country-hub/page-builder"
              search={countrySearch}
              className="rounded-2xl border border-border bg-surface p-4 transition-colors hover:bg-surface-strong"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Public page
              </p>
              <p className="mt-2 text-lg font-semibold">Open page builder</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Arrange blocks, visibility and page content.
              </p>
            </Link>
          </div>

          <Panel title="Quick actions" description="The most common country-page actions, without opening every editor at once.">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Link
                to="/country-hub/theme"
                search={countrySearch}
                className="min-h-20 rounded-xl border border-border bg-surface p-3"
              >
                <p className="text-sm font-semibold">Appearance</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Colours, background and header style.
                </p>
              </Link>
              <Link
                to="/country-hub/page-builder"
                search={countrySearch}
                className="min-h-20 rounded-xl border border-border bg-surface p-3"
              >
                <p className="text-sm font-semibold">Page builder</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Build and reorder the public page.
                </p>
              </Link>
              <Link
                to="/countries/$code"
                params={{ code: country.short_code }}
                className="min-h-20 rounded-xl border border-border bg-surface p-3"
              >
                <p className="text-sm font-semibold">Preview country</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  See the public country profile.
                </p>
              </Link>
              <Link
                to="/wiki/$code"
                params={{ code: country.short_code }}
                className="min-h-20 rounded-xl border border-border bg-surface p-3"
              >
                <p className="text-sm font-semibold">Preview Wiki</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  See the longer Wiki page.
                </p>
              </Link>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "country" && (
        <div className="space-y-5">
          <Panel
            title="Country identity"
            description="Edit the basic country information shown across Solaris. The country code can only be changed by an organizer."
          >
            <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <FlagChip
                    code={country.short_code}
                    color={identity.accentColor}
                    image={identity.flagImage}
                    size="xl"
                  />
                  <div>
                    <p className="text-sm font-semibold">{country.short_code}</p>
                    <p className="text-xs text-muted-foreground">Country code</p>
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={flagBusy}
                  onChange={(event) =>
                    event.target.files?.[0] && void uploadFlag(event.target.files[0])
                  }
                  className="block w-full text-xs"
                />
                {identity.flagImage && (
                  <button
                    type="button"
                    onClick={() =>
                      setIdentity((current) => ({ ...current, flagImage: null }))
                    }
                    className="text-xs text-muted-foreground"
                  >
                    Remove flag
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Country name"
                  value={identity.name}
                  onChange={(value) =>
                    setIdentity((current) => ({ ...current, name: value }))
                  }
                />
                <Input
                  label="Native name"
                  value={identity.nativeName}
                  onChange={(value) =>
                    setIdentity((current) => ({ ...current, nativeName: value }))
                  }
                />
                <Input
                  label="Region"
                  value={identity.region}
                  onChange={(value) =>
                    setIdentity((current) => ({ ...current, region: value }))
                  }
                />
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                    Accent colour
                  </span>
                  <input
                    type="color"
                    value={identity.accentColor}
                    onChange={(event) =>
                      setIdentity((current) => ({
                        ...current,
                        accentColor: event.target.value,
                      }))
                    }
                    className="h-11 w-full rounded-xl border border-border bg-surface p-1"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                    Short description
                  </span>
                  <textarea
                    value={identity.description}
                    onChange={(event) =>
                      setIdentity((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    rows={3}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={updateIdentity.isPending}
                  onClick={() =>
                    void run(
                      () => updateIdentity.mutateAsync(identity),
                      "Country identity updated everywhere.",
                    )
                  }
                  className="min-h-11 rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-2"
                >
                  Save country identity
                </button>
              </div>
            </div>
          </Panel>

          <Panel
            title="National facts"
            description="These facts appear on the public country page and can also be used in the page builder."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="Capital"
                value={profile.capital}
                onChange={(value) => setProfile((current) => ({ ...current, capital: value }))}
              />
              <Input
                label="Government type"
                value={profile.government_type}
                placeholder="Kingdom, republic, federation…"
                onChange={(value) =>
                  setProfile((current) => ({ ...current, government_type: value }))
                }
              />
              <Input
                label="Leader name"
                value={profile.leader_name}
                onChange={(value) =>
                  setProfile((current) => ({ ...current, leader_name: value }))
                }
              />
              <Input
                label="Leader title"
                value={profile.leader_title}
                placeholder="President, Queen, Prime Minister…"
                onChange={(value) =>
                  setProfile((current) => ({ ...current, leader_title: value }))
                }
              />
              <Input
                label="Demonym"
                value={profile.demonym}
                onChange={(value) => setProfile((current) => ({ ...current, demonym: value }))}
              />
              <Input
                label="Official languages"
                value={profile.official_languages}
                onChange={(value) =>
                  setProfile((current) => ({ ...current, official_languages: value }))
                }
              />
              <Input
                label="Currency"
                value={profile.currency}
                onChange={(value) => setProfile((current) => ({ ...current, currency: value }))}
              />
              <Input
                label="Population"
                value={profile.population}
                placeholder="Fictional values are fine"
                onChange={(value) =>
                  setProfile((current) => ({ ...current, population: value }))
                }
              />
              <Input
                label="Established"
                value={profile.established}
                onChange={(value) =>
                  setProfile((current) => ({ ...current, established: value }))
                }
              />
              <Input
                label="Motto"
                value={profile.motto}
                onChange={(value) => setProfile((current) => ({ ...current, motto: value }))}
                className="lg:col-span-3"
              />
              <label className="block sm:col-span-2 lg:col-span-3">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Country introduction
                </span>
                <textarea
                  value={profile.summary}
                  onChange={(event) =>
                    setProfile((current) => ({ ...current, summary: event.target.value }))
                  }
                  rows={5}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={saveProfile.isPending}
                onClick={() =>
                  void run(() => saveProfile.mutateAsync(profile), "Country facts updated.")
                }
                className="min-h-11 rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:col-span-2 lg:col-span-3"
              >
                Save national facts
              </button>
            </div>
          </Panel>
        </div>
      )}

      {activeTab === "page" && (
        <div className="space-y-5">
          <Panel
            title="Public page tools"
            description="Use these for the full page design. The editors below are only for quick text and image changes."
          >
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Link
                to="/country-hub/theme"
                search={countrySearch}
                className="min-h-20 rounded-xl border border-border bg-surface p-3"
              >
                <p className="text-sm font-semibold">Appearance</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Background, colours and header style.
                </p>
              </Link>
              <Link
                to="/country-hub/page-builder"
                search={countrySearch}
                className="min-h-20 rounded-xl border border-border bg-surface p-3"
              >
                <p className="text-sm font-semibold">Page builder</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Sections, images, visibility and order.
                </p>
              </Link>
              <Link
                to="/countries/$code"
                params={{ code: country.short_code }}
                className="min-h-20 rounded-xl border border-border bg-surface p-3"
              >
                <p className="text-sm font-semibold">Preview country</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Check the public country profile.
                </p>
              </Link>
              <Link
                to="/wiki/$code"
                params={{ code: country.short_code }}
                className="min-h-20 rounded-xl border border-border bg-surface p-3"
              >
                <p className="text-sm font-semibold">Preview Wiki</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Check the longer Wiki article.
                </p>
              </Link>
            </div>
          </Panel>

          <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
            <Panel
              title="Quick article sections"
              description="Make simple text-and-image changes here. Use Page builder for layouts, visibility and more block types."
              actions={
                <Link
                  to="/country-hub/page-builder"
                  search={countrySearch}
                  className="rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Open page builder →
                </Link>
              }
            >
              <div className="space-y-3">
                {(world.data?.sections ?? []).map((section) => (
                  <SectionEditor
                    key={section.id}
                    section={section}
                    media={world.data?.media ?? []}
                    onSave={(values) =>
                      run(() => saveSection.mutateAsync(values), "Section updated.")
                    }
                    onDelete={() =>
                      run(() => deleteSection.mutateAsync(section.id), "Section removed.")
                    }
                  />
                ))}
                <div className="rounded-xl border border-border bg-surface p-3">
                  <p className="mb-3 text-sm font-semibold">New simple section</p>
                  <Input
                    label="Heading"
                    value={newSection.heading}
                    onChange={(value) =>
                      setNewSection((current) => ({ ...current, heading: value }))
                    }
                  />
                  <label className="mt-3 block">
                    <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                      Body
                    </span>
                    <textarea
                      value={newSection.body}
                      onChange={(event) =>
                        setNewSection((current) => ({ ...current, body: event.target.value }))
                      }
                      rows={6}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <MediaSelect
                    className="mt-3"
                    media={world.data?.media ?? []}
                    value={newSection.image_url}
                    onChange={(value) =>
                      setNewSection((current) => ({ ...current, image_url: value }))
                    }
                  />
                  <Input
                    className="mt-3"
                    label="Image caption"
                    value={newSection.image_caption}
                    onChange={(value) =>
                      setNewSection((current) => ({ ...current, image_caption: value }))
                    }
                  />
                  <button
                    type="button"
                    disabled={!newSection.heading.trim() || saveSection.isPending}
                    onClick={() => void saveNewSection()}
                    className="mt-3 min-h-10 rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-50"
                  >
                    Add simple section
                  </button>
                </div>
              </div>
            </Panel>

            <Panel
              title="Country media"
              description="Upload reusable images for your article and gallery. JPG, PNG, WebP or GIF, maximum 8 MB."
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => setGalleryFile(event.target.files?.[0] ?? null)}
                className="block w-full text-xs"
              />
              <Input
                className="mt-3"
                label="Caption"
                value={galleryCaption}
                onChange={setGalleryCaption}
              />
              <Input
                className="mt-3"
                label="Alt text"
                value={galleryAlt}
                onChange={setGalleryAlt}
              />
              <button
                type="button"
                disabled={!galleryFile || galleryBusy}
                onClick={() => void uploadGallery()}
                className="mt-3 min-h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm font-semibold disabled:opacity-50"
              >
                {galleryBusy ? "Uploading…" : "Upload image"}
              </button>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {(world.data?.media ?? []).map((media) => (
                  <div key={media.id} className="overflow-hidden rounded-xl bg-surface">
                    <img
                      src={media.public_url}
                      alt={media.alt_text ?? media.caption ?? "Country image"}
                      className="aspect-[4/3] w-full object-cover"
                    />
                    <div className="p-2">
                      <p className="truncate text-[11px] text-muted-foreground">
                        {media.caption || "No caption"}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          void run(() => deleteMedia.mutateAsync(media), "Image removed.")
                        }
                        className="mt-1 text-[10px] font-semibold text-destructive"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {activeTab === "entries" && (
        <Panel
          title="SSC entries"
          description={
            organizerOverride
              ? "One artist and one song per country per edition. Semi-final and final appearances use that same entry."
              : "Each edition has one artist and one song. Reaching the final does not create a second participation."
          }
        >
          <div className="mb-4 rounded-xl border border-sky-200/15 bg-sky-200/[0.045] p-3 text-xs leading-5 text-muted-foreground">
            <strong className="text-foreground">Edit once per edition:</strong> Solaris uses the same
            artist, song and listening links for every show appearance in that edition.
          </div>
          <div className="space-y-3">
            {myEntries.map((group) => (
              <EntryEditor
                key={group.editionId}
                entry={group.entry}
                edition={editions?.find((item) => item.id === group.editionId)}
                showNames={group.appearances
                  .map(
                    (appearance) =>
                      shows?.find((show) => show.id === appearance.show_id)?.name ?? null,
                  )
                  .filter((name): name is string => Boolean(name))}
                busy={saveEntry.isPending || saveEntryLinks.isPending}
                onSave={(values) =>
                  run(async () => {
                    await saveEntry.mutateAsync({
                      participantId: values.participantId,
                      editionId: values.editionId,
                      showId: null,
                      artist: values.artist,
                      song: values.song,
                      notes: values.notes,
                    });
                    await saveEntryLinks.mutateAsync({
                      participantId: values.participantId,
                      editionId: values.editionId,
                      youtubeUrl: values.youtubeUrl,
                      spotifyUrl: values.spotifyUrl,
                      appleMusicUrl: values.appleMusicUrl,
                    });
                  }, "Edition entry and listening links updated everywhere.")
                }
              />
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-semibold">Add a missing edition participation</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Choose the edition and enter the artist and song once. Listening links are optional.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Edition
                </span>
                <select
                  value={addEntry.editionId}
                  onChange={(event) =>
                    setAddEntry((current) => ({ ...current, editionId: event.target.value }))
                  }
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="">Choose edition…</option>
                  {(editions ?? []).map((edition) => (
                    <option key={edition.id} value={edition.id}>
                      {editionLabel(edition)}
                    </option>
                  ))}
                </select>
              </label>
              <Input
                label="Artist"
                value={addEntry.artist}
                onChange={(value) =>
                  setAddEntry((current) => ({ ...current, artist: value }))
                }
              />
              <Input
                label="Song"
                value={addEntry.song}
                onChange={(value) => setAddEntry((current) => ({ ...current, song: value }))}
              />
              <Input
                label="YouTube music video"
                value={addEntry.youtubeUrl}
                placeholder="https://youtube.com/watch?..."
                onChange={(value) =>
                  setAddEntry((current) => ({ ...current, youtubeUrl: value }))
                }
              />
              <Input
                label="Spotify"
                value={addEntry.spotifyUrl}
                placeholder="https://open.spotify.com/track/..."
                onChange={(value) =>
                  setAddEntry((current) => ({ ...current, spotifyUrl: value }))
                }
              />
              <Input
                label="Apple Music"
                value={addEntry.appleMusicUrl}
                placeholder="https://music.apple.com/..."
                onChange={(value) =>
                  setAddEntry((current) => ({ ...current, appleMusicUrl: value }))
                }
                className="sm:col-span-2"
              />
              <Input
                label="Notes"
                value={addEntry.notes}
                onChange={(value) =>
                  setAddEntry((current) => ({ ...current, notes: value }))
                }
                className="sm:col-span-2"
              />
              <button
                type="button"
                disabled={
                  !addEntry.editionId ||
                  !addEntry.artist.trim() ||
                  !addEntry.song.trim() ||
                  saveEntry.isPending ||
                  saveEntryLinks.isPending
                }
                onClick={() => void addHistoricalEntry()}
                className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-50 sm:col-span-2"
              >
                Save edition participation
              </button>
            </div>
          </div>
        </Panel>
      )}
    </AppShell>
  );
}

function OverviewCard({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-strong"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>
    </button>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />
    </label>
  );
}

function MediaSelect({
  media,
  value,
  onChange,
  className = "",
}: {
  media: CountryMedia[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">Section image</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
      >
        <option value="">No image</option>
        {media.map((item) => (
          <option key={item.id} value={item.public_url}>
            {item.caption || item.alt_text || "Gallery image"}
          </option>
        ))}
      </select>
    </label>
  );
}

function SectionEditor({
  section,
  media,
  onSave,
  onDelete,
}: {
  section: CountryProfileSection;
  media: CountryMedia[];
  onSave: (values: {
    id: string;
    heading: string;
    body: string;
    image_url: string | null;
    image_caption: string | null;
    sort_order: number;
  }) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}) {
  const [value, setValue] = useState({
    heading: section.heading,
    body: section.body,
    image_url: section.image_url ?? "",
    image_caption: section.image_caption ?? "",
    sort_order: section.sort_order,
  });

  useEffect(
    () =>
      setValue({
        heading: section.heading,
        body: section.body,
        image_url: section.image_url ?? "",
        image_caption: section.image_caption ?? "",
        sort_order: section.sort_order,
      }),
    [section],
  );

  return (
    <div className="rounded-xl bg-surface p-3">
      <Input
        label="Heading"
        value={value.heading}
        onChange={(heading) => setValue((current) => ({ ...current, heading }))}
      />
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-semibold text-muted-foreground">Body</span>
        <textarea
          value={value.body}
          onChange={(event) =>
            setValue((current) => ({ ...current, body: event.target.value }))
          }
          rows={5}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <MediaSelect
          media={media}
          value={value.image_url}
          onChange={(image_url) => setValue((current) => ({ ...current, image_url }))}
        />
        <Input
          label="Image caption"
          value={value.image_caption}
          onChange={(image_caption) =>
            setValue((current) => ({ ...current, image_caption }))
          }
        />
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() =>
            void onSave({
              id: section.id,
              heading: value.heading,
              body: value.body,
              image_url: value.image_url || null,
              image_caption: value.image_caption || null,
              sort_order: value.sort_order,
            })
          }
          className="min-h-9 rounded-lg border border-border px-3 text-xs font-semibold"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => void onDelete()}
          className="min-h-9 rounded-lg px-3 text-xs font-semibold text-destructive"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

type EntryEditorValues = {
  participantId: string;
  editionId: string;
  artist: string;
  song: string;
  notes: string;
  youtubeUrl: string;
  spotifyUrl: string;
  appleMusicUrl: string;
};

function EntryEditor({
  entry,
  edition,
  showNames,
  busy,
  onSave,
}: {
  entry: Participant;
  edition: { edition_number: number | null; name: string; year: number | null } | undefined;
  showNames: string[];
  busy: boolean;
  onSave: (values: EntryEditorValues) => Promise<unknown>;
}) {
  const initialLinks = listenLinksFrom(entry);
  const [artist, setArtist] = useState(entry.artist ?? "");
  const [song, setSong] = useState(entry.song ?? "");
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [youtubeUrl, setYoutubeUrl] = useState(initialLinks.youtube_url ?? "");
  const [spotifyUrl, setSpotifyUrl] = useState(initialLinks.spotify_url ?? "");
  const [appleMusicUrl, setAppleMusicUrl] = useState(initialLinks.apple_music_url ?? "");

  useEffect(() => {
    const links = listenLinksFrom(entry);
    setArtist(entry.artist ?? "");
    setSong(entry.song ?? "");
    setNotes(entry.notes ?? "");
    setYoutubeUrl(links.youtube_url ?? "");
    setSpotifyUrl(links.spotify_url ?? "");
    setAppleMusicUrl(links.apple_music_url ?? "");
  }, [entry]);

  const uniqueShows = [...new Set(showNames)];

  return (
    <div className="rounded-xl bg-surface p-3 sm:p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold">
          {edition ? editionLabel(edition as any) : "Edition"}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {uniqueShows.length ? (
            uniqueShows.map((showName) => (
              <span
                key={showName}
                className="rounded-full border border-border bg-background/40 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground"
              >
                {showName}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-muted-foreground">
              No show appearance assigned yet
            </span>
          )}
        </div>
        {uniqueShows.length > 1 ? (
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            These are appearances of the same edition entry. Artist, song and listening links are
            entered once.
          </p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Artist" value={artist} onChange={setArtist} />
        <Input label="Song" value={song} onChange={setSong} />
        <Input
          label="YouTube music video"
          value={youtubeUrl}
          placeholder="https://youtube.com/watch?..."
          onChange={setYoutubeUrl}
        />
        <Input
          label="Spotify"
          value={spotifyUrl}
          placeholder="https://open.spotify.com/track/..."
          onChange={setSpotifyUrl}
        />
        <Input
          label="Apple Music"
          value={appleMusicUrl}
          placeholder="https://music.apple.com/..."
          onChange={setAppleMusicUrl}
          className="sm:col-span-2"
        />
        <Input
          label="Notes"
          value={notes}
          onChange={setNotes}
          className="sm:col-span-2"
        />
        <p className="text-[11px] leading-5 text-muted-foreground sm:col-span-2">
          Listening links are optional and are shown publicly so fans can go straight to the song.
        </p>
        <button
          type="button"
          disabled={!artist.trim() || !song.trim() || busy}
          onClick={() =>
            void onSave({
              participantId: entry.id,
              editionId: entry.edition_id,
              artist,
              song,
              notes,
              youtubeUrl,
              spotifyUrl,
              appleMusicUrl,
            })
          }
          className="min-h-10 rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-50 sm:col-span-2"
        >
          {busy ? "Saving…" : "Save edition entry"}
        </button>
      </div>
    </div>
  );
}
