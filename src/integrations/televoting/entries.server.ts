import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

type RoundEntryRow = {
  id: string;
  round_id: string;
  entry_type: "country" | "custom";
  entry_key: string;
  country_code: string | null;
  custom_name: string | null;
  short_name: string | null;
  entry_code: string | null;
  subtitle: string | null;
  image_url: string | null;
  description: string | null;
  display_order: number;
};

type CountryRow = {
  code: string;
  name: string;
  flag: string | null;
  flag_url: string | null;
};

type RoundRow = {
  id: string;
  name?: string;
  status: string;
  participant_mode: string | null;
  self_voting_mode: string | null;
  version: number;
};

type RoundCommandEnvelope = {
  roundId: string;
  expectedRoundVersion?: number;
  operationId?: string;
  idempotencyKey?: string;
};

async function roundConfigSnapshot(roundId: string) {
  const { data, error } = await televotingAdmin.rpc("v3_round_config_snapshot", {
    p_round_id: roundId,
  });
  if (error) throw new Error(error.message);
  const snapshot = (data ?? {}) as Record<string, unknown>;
  const version = Number(snapshot.version ?? -1);
  if (!Number.isInteger(version) || version < 0) {
    throw new Error("Canonical round revision is unavailable; refresh before editing");
  }
  return { version };
}

async function configureRound(
  input: RoundCommandEnvelope,
  action: "replace_countries" | "save_custom" | "delete_custom" | "reorder" | "set_self_voting",
  payload: Record<string, unknown>,
) {
  await requireMergedTelevotingAdminServer();
  const snapshot = input.expectedRoundVersion === undefined
    ? await roundConfigSnapshot(input.roundId)
    : { version: input.expectedRoundVersion };
  const operationId = input.operationId || crypto.randomUUID();
  const idempotencyKey = input.idempotencyKey || crypto.randomUUID();
  const { data, error } = await televotingAdmin.rpc("v3_configure_round", {
    p_round_id: input.roundId,
    p_action: action,
    p_payload: payload,
    p_expected_round_version: snapshot.version,
    p_operation_id: operationId,
    p_idempotency_key: idempotencyKey,
    p_correlation_id: operationId,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function getMergedRoundEntriesServer(roundId: string) {
  await requireMergedTelevotingAdminServer();

  const [{ data: rawRound, error: roundError }, snapshotResult] = await Promise.all([
    televotingAdmin
      .from("rounds")
      .select("id,name,status,participant_mode,self_voting_mode")
      .eq("id", roundId)
      .maybeSingle(),
    roundConfigSnapshot(roundId),
  ]);
  if (roundError) throw new Error(roundError.message);

  const raw = rawRound as Omit<RoundRow, "version"> | null;
  if (!raw) throw new Error("Round not found");
  const round: RoundRow = { ...raw, version: snapshotResult.version };

  const { data: rawEntries, error: entryError } = await televotingAdmin
    .from("round_entries")
    .select("id,round_id,entry_type,entry_key,country_code,custom_name,short_name,entry_code,subtitle,image_url,description,display_order")
    .eq("round_id", roundId)
    .order("display_order");
  if (entryError) throw new Error(entryError.message);

  const entries = (rawEntries ?? []) as RoundEntryRow[];
  const codes = [
    ...new Set(
      entries
        .map((entry) => entry.country_code)
        .filter((code): code is string => Boolean(code)),
    ),
  ];
  const countryMap = new Map<string, CountryRow>();

  if (codes.length) {
    const { data: rawCountries, error: countryError } = await televotingAdmin
      .from("countries")
      .select("code,name,flag,flag_url")
      .in("code", codes);
    if (countryError) throw new Error(countryError.message);

    const countries = (rawCountries ?? []) as CountryRow[];
    for (const country of countries) countryMap.set(country.code, country);
  }

  const { data: rawAllCountries, error: allCountriesError } = await televotingAdmin
    .from("countries")
    .select("code,name,flag,flag_url")
    .order("name");
  if (allCountriesError) throw new Error(allCountriesError.message);

  return {
    round,
    entries: entries.map((entry) => ({
      ...entry,
      country: entry.country_code ? countryMap.get(entry.country_code) ?? null : null,
    })),
    countries: (rawAllCountries ?? []) as CountryRow[],
  };
}

export async function saveMergedRoundCountriesServer(data: RoundCommandEnvelope & { countryCodes: string[] }) {
  return configureRound(data, "replace_countries", { countryCodes: data.countryCodes });
}

export async function saveMergedCustomRoundEntryServer(data: RoundCommandEnvelope & {
  id?: string | null;
  customName: string;
  shortName?: string | null;
  entryCode?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  description?: string | null;
}) {
  return configureRound(data, "save_custom", {
    id: data.id ?? null,
    customName: data.customName,
    shortName: data.shortName ?? null,
    entryCode: data.entryCode ?? null,
    subtitle: data.subtitle ?? null,
    imageUrl: data.imageUrl ?? null,
    description: data.description ?? null,
  });
}

export async function deleteMergedCustomRoundEntryServer(data: RoundCommandEnvelope & { entryId: string }) {
  return configureRound(data, "delete_custom", { entryId: data.entryId });
}

export async function reorderMergedRoundEntriesServer(data: RoundCommandEnvelope & { entryIds: string[] }) {
  return configureRound(data, "reorder", { entryIds: data.entryIds });
}

export async function setMergedRoundSelfVotingModeServer(data: RoundCommandEnvelope & {
  mode: "country_match" | "linked_identity" | "disabled" | "unrestricted";
}) {
  return configureRound(data, "set_self_voting", { mode: data.mode });
}
