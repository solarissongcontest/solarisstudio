import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSolarisOrganizerServer } from "@/integrations/supabase/organizer.server";

export type HodChannel = "delegation" | "jury" | "televote";

export type HodPerson = {
  id: string;
  displayName: string;
  identityKey: string;
  notes: string | null;
};

export type HodAssignment = {
  id: string;
  editionId: string;
  editionNumber: number | null;
  editionName: string;
  countryId: string;
  countryCode: string;
  countryName: string;
  personId: string;
  personName: string;
  identityKey: string;
  channel: HodChannel;
  source: string;
  confidence: number;
  notes: string | null;
};

export type ResolvedHod = {
  personId: string;
  displayName: string;
  identityKey: string;
  confidence: number;
  source: string;
  assignedChannel: HodChannel;
  requestedChannel: Exclude<HodChannel, "delegation">;
  inheritedFromDelegation: boolean;
};

type AssignmentRow = {
  id: string;
  edition_id: string;
  country_id: string;
  person_id: string;
  channel: HodChannel;
  source: string;
  confidence: number;
  notes: string | null;
};

type PersonRow = {
  id: string;
  display_name: string;
  identity_key: string;
  notes: string | null;
};

function normalizeIdentityKey(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function loadHodResolverServer() {
  const db = supabaseAdmin as any;
  const [peopleResult, assignmentsResult, editionsResult, countriesResult] = await Promise.all([
    db.from("delegation_people").select("id,display_name,identity_key,notes").order("display_name"),
    db
      .from("delegation_hod_assignments")
      .select("id,edition_id,country_id,person_id,channel,source,confidence,notes"),
    db.from("editions").select("id,edition_number,name,status").order("edition_number", { ascending: false, nullsFirst: false }),
    db.from("countries").select("id,short_code,name,flag_image").order("name"),
  ]);

  for (const result of [peopleResult, assignmentsResult, editionsResult, countriesResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const people = (peopleResult.data ?? []) as PersonRow[];
  const assignments = (assignmentsResult.data ?? []) as AssignmentRow[];
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const countries = countriesResult.data ?? [];
  const editions = editionsResult.data ?? [];
  const countriesById = new Map(countries.map((country: any) => [String(country.id), country]));
  const countriesByCode = new Map(countries.map((country: any) => [String(country.short_code ?? "").trim().toUpperCase(), country]));
  const editionsById = new Map(editions.map((edition: any) => [String(edition.id), edition]));
  const assignmentMap = new Map<string, AssignmentRow>();
  for (const assignment of assignments) {
    assignmentMap.set(`${assignment.edition_id}:${assignment.country_id}:${assignment.channel}`, assignment);
  }

  function resolve(
    editionId: string | null | undefined,
    countryId: string | null | undefined,
    channel: "jury" | "televote",
  ): ResolvedHod | null {
    if (!editionId || !countryId) return null;
    const direct = assignmentMap.get(`${editionId}:${countryId}:${channel}`);
    const fallback = assignmentMap.get(`${editionId}:${countryId}:delegation`);
    const assignment = direct ?? fallback;
    if (!assignment) return null;
    const person = peopleById.get(assignment.person_id);
    if (!person) return null;
    return {
      personId: person.id,
      displayName: person.display_name,
      identityKey: person.identity_key,
      confidence: Number(assignment.confidence ?? 100),
      source: assignment.source,
      assignedChannel: assignment.channel,
      requestedChannel: channel,
      inheritedFromDelegation: !direct && Boolean(fallback),
    };
  }

  return {
    people: people.map((person) => ({
      id: person.id,
      displayName: person.display_name,
      identityKey: person.identity_key,
      notes: person.notes,
    })) as HodPerson[],
    assignments,
    editions,
    countries,
    peopleById,
    countriesById,
    countriesByCode,
    editionsById,
    resolve,
  };
}

export async function getHodHistoryServer() {
  await requireSolarisOrganizerServer();
  const resolver = await loadHodResolverServer();

  const assignments: HodAssignment[] = resolver.assignments
    .map((assignment) => {
      const person = resolver.peopleById.get(assignment.person_id);
      const edition = resolver.editionsById.get(assignment.edition_id) as any;
      const country = resolver.countriesById.get(assignment.country_id) as any;
      if (!person || !edition || !country) return null;
      return {
        id: assignment.id,
        editionId: assignment.edition_id,
        editionNumber: edition.edition_number == null ? null : Number(edition.edition_number),
        editionName: String(edition.name),
        countryId: assignment.country_id,
        countryCode: String(country.short_code ?? ""),
        countryName: String(country.name),
        personId: person.id,
        personName: person.display_name,
        identityKey: person.identity_key,
        channel: assignment.channel,
        source: assignment.source,
        confidence: Number(assignment.confidence ?? 100),
        notes: assignment.notes,
      } satisfies HodAssignment;
    })
    .filter((row): row is HodAssignment => Boolean(row))
    .sort((a, b) =>
      (b.editionNumber ?? -1) - (a.editionNumber ?? -1) ||
      a.countryName.localeCompare(b.countryName) ||
      a.channel.localeCompare(b.channel),
    );

  return {
    people: resolver.people,
    assignments,
    editions: resolver.editions.map((edition: any) => ({
      id: String(edition.id),
      editionNumber: edition.edition_number == null ? null : Number(edition.edition_number),
      name: String(edition.name),
      status: String(edition.status),
    })),
    countries: resolver.countries.map((country: any) => ({
      id: String(country.id),
      code: String(country.short_code ?? ""),
      name: String(country.name),
      flagImage: country.flag_image == null ? null : String(country.flag_image),
    })),
  };
}

export async function saveHodPersonServer(input: {
  id?: string;
  displayName: string;
  identityKey?: string;
  notes?: string | null;
}) {
  await requireSolarisOrganizerServer();
  const db = supabaseAdmin as any;
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error("HOD name is required");

  if (input.id) {
    const values: Record<string, unknown> = {
      display_name: displayName,
      notes: input.notes?.trim() || null,
    };
    if (input.identityKey?.trim()) values.identity_key = normalizeIdentityKey(input.identityKey);
    const { data, error } = await db.from("delegation_people").update(values).eq("id", input.id).select("id").single();
    if (error) throw new Error(error.message);
    return { id: String(data.id) };
  }

  const base = normalizeIdentityKey(input.identityKey || displayName) || "hod";
  let identityKey = base;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data: existing, error: lookupError } = await db
      .from("delegation_people")
      .select("id")
      .eq("identity_key", identityKey)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!existing) break;
    identityKey = `${base}-${attempt + 2}`;
  }

  const { data, error } = await db
    .from("delegation_people")
    .insert({
      display_name: displayName,
      identity_key: identityKey,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: String(data.id), identityKey };
}

export async function saveHodAssignmentsServer(input: {
  personId: string;
  countryId: string;
  editionIds: string[];
  channel: HodChannel;
  source?: string;
  confidence?: number;
  notes?: string | null;
}) {
  await requireSolarisOrganizerServer();
  const db = supabaseAdmin as any;
  const editionIds = [...new Set(input.editionIds.map(String).filter(Boolean))];
  if (!input.personId || !input.countryId || !editionIds.length) throw new Error("Person, country and at least one edition are required");
  if (!["delegation", "jury", "televote"].includes(input.channel)) throw new Error("Invalid HOD channel");
  const confidence = Math.max(0, Math.min(100, Math.round(Number(input.confidence ?? 100))));
  const now = new Date().toISOString();

  const rows = editionIds.map((editionId) => ({
    edition_id: editionId,
    country_id: input.countryId,
    person_id: input.personId,
    channel: input.channel,
    source: input.source?.trim() || "manual",
    confidence,
    notes: input.notes?.trim() || null,
    updated_at: now,
  }));
  const { error } = await db
    .from("delegation_hod_assignments")
    .upsert(rows, { onConflict: "edition_id,country_id,channel" });
  if (error) throw new Error(error.message);
  return { updated: rows.length };
}

export async function deleteHodAssignmentServer(id: string) {
  await requireSolarisOrganizerServer();
  const db = supabaseAdmin as any;
  const { error } = await db.from("delegation_hod_assignments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}
