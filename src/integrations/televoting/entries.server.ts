import { randomUUID } from "node:crypto";

import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

async function audit(
  actor: { id: string; username: string },
  action: string,
  targetId: string,
  oldValues?: unknown,
  newValues?: unknown,
) {
  await televotingAdmin.from("admin_audit_log").insert({
    actor_admin_id: actor.id,
    actor_username: actor.username,
    action,
    target_type: "round_entry",
    target_id: targetId,
    old_values: oldValues ?? null,
    new_values: newValues ?? null,
  });
}

async function assertEditableRound(roundId: string) {
  const { data: round, error } = await televotingAdmin
    .from("rounds")
    .select("id,status,participant_mode,self_voting_mode")
    .eq("id", roundId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!round) throw new Error("Round not found");
  if (round.status === "open") throw new Error("Close the round before changing its participants");
  return round;
}

async function normalizeOrders(roundId: string) {
  const { data, error } = await televotingAdmin
    .from("round_entries")
    .select("id")
    .eq("round_id", roundId)
    .order("display_order");
  if (error) throw new Error(error.message);

  for (let index = 0; index < (data ?? []).length; index += 1) {
    const { error: updateError } = await televotingAdmin
      .from("round_entries")
      .update({ display_order: index + 1 })
      .eq("id", data![index]!.id);
    if (updateError) throw new Error(updateError.message);
  }
}

async function syncParticipantMode(roundId: string) {
  const { data, error } = await televotingAdmin
    .from("round_entries")
    .select("entry_type")
    .eq("round_id", roundId);
  if (error) throw new Error(error.message);

  const hasCountry = (data ?? []).some((row) => row.entry_type === "country");
  const hasCustom = (data ?? []).some((row) => row.entry_type === "custom");
  const participantMode = hasCountry && hasCustom ? "mixed" : hasCustom ? "custom" : "countries";

  const { error: updateError } = await televotingAdmin
    .from("rounds")
    .update({ participant_mode: participantMode })
    .eq("id", roundId);
  if (updateError) throw new Error(updateError.message);
  return participantMode;
}

export async function getMergedRoundEntriesServer(roundId: string) {
  await requireMergedTelevotingAdminServer();

  const { data: round, error: roundError } = await televotingAdmin
    .from("rounds")
    .select("id,name,status,participant_mode,self_voting_mode")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError) throw new Error(roundError.message);
  if (!round) throw new Error("Round not found");

  const { data: entries, error: entryError } = await televotingAdmin
    .from("round_entries")
    .select("id,round_id,entry_type,entry_key,country_code,custom_name,short_name,entry_code,subtitle,image_url,description,display_order")
    .eq("round_id", roundId)
    .order("display_order");
  if (entryError) throw new Error(entryError.message);

  const codes = [...new Set((entries ?? []).map((entry) => entry.country_code).filter((code): code is string => Boolean(code)))];
  const countryMap = new Map<string, { code: string; name: string; flag: string | null; flag_url: string | null }>();

  if (codes.length) {
    const { data: countries, error: countryError } = await televotingAdmin
      .from("countries")
      .select("code,name,flag,flag_url")
      .in("code", codes);
    if (countryError) throw new Error(countryError.message);
    for (const country of countries ?? []) countryMap.set(country.code, country);
  }

  const { data: allCountries, error: allCountriesError } = await televotingAdmin
    .from("countries")
    .select("code,name,flag,flag_url")
    .order("name");
  if (allCountriesError) throw new Error(allCountriesError.message);

  return {
    round,
    entries: (entries ?? []).map((entry) => ({
      ...entry,
      country: entry.country_code ? countryMap.get(entry.country_code) ?? null : null,
    })),
    countries: allCountries ?? [],
  };
}

export async function saveMergedRoundCountriesServer(data: { roundId: string; countryCodes: string[] }) {
  const actor = await requireMergedTelevotingAdminServer();
  await assertEditableRound(data.roundId);

  const { data: validCountries, error: validError } = await televotingAdmin
    .from("countries")
    .select("code")
    .in("code", data.countryCodes);
  if (validError) throw new Error(validError.message);

  const valid = new Set((validCountries ?? []).map((row) => row.code));
  const unknown = data.countryCodes.filter((code) => !valid.has(code));
  if (unknown.length) {
    throw new Error(`Unknown country code${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`);
  }

  const { data: before, error: beforeError } = await televotingAdmin
    .from("round_entries")
    .select("*")
    .eq("round_id", data.roundId)
    .order("display_order");
  if (beforeError) throw new Error(beforeError.message);

  const customEntries = (before ?? [])
    .filter((entry) => entry.entry_type === "custom")
    .sort((a, b) => a.display_order - b.display_order);

  const { error: deleteError } = await televotingAdmin
    .from("round_entries")
    .delete()
    .eq("round_id", data.roundId)
    .eq("entry_type", "country");
  if (deleteError) throw new Error(deleteError.message);

  const countryRows = data.countryCodes.map((code, index) => ({
    round_id: data.roundId,
    entry_type: "country" as const,
    entry_key: code,
    country_code: code,
    custom_name: null,
    short_name: null,
    entry_code: null,
    subtitle: null,
    image_url: null,
    description: null,
    display_order: index + 1,
  }));

  if (countryRows.length) {
    const { error: insertError } = await televotingAdmin.from("round_entries").insert(countryRows);
    if (insertError) throw new Error(insertError.message);
  }

  for (let index = 0; index < customEntries.length; index += 1) {
    const { error: reorderError } = await televotingAdmin
      .from("round_entries")
      .update({ display_order: countryRows.length + index + 1 })
      .eq("id", customEntries[index]!.id);
    if (reorderError) throw new Error(reorderError.message);
  }

  const participantMode = customEntries.length ? "mixed" : "countries";
  const { error: modeError } = await televotingAdmin
    .from("rounds")
    .update({ participant_mode: participantMode })
    .eq("id", data.roundId);
  if (modeError) throw new Error(modeError.message);

  await audit(actor, "configure_round_entries", data.roundId, before, {
    participant_mode: participantMode,
    countryCodes: data.countryCodes,
  });

  return { ok: true, participantMode };
}

export async function saveMergedCustomRoundEntryServer(data: {
  roundId: string;
  id?: string | null;
  customName: string;
  shortName?: string | null;
  entryCode?: string | null;
  subtitle?: string | null;
  imageUrl?: string | null;
  description?: string | null;
}) {
  const actor = await requireMergedTelevotingAdminServer();
  await assertEditableRound(data.roundId);

  if (data.id) {
    const { data: before, error: beforeError } = await televotingAdmin
      .from("round_entries")
      .select("*")
      .eq("id", data.id)
      .eq("round_id", data.roundId)
      .eq("entry_type", "custom")
      .maybeSingle();
    if (beforeError) throw new Error(beforeError.message);
    if (!before) throw new Error("Custom entry not found");

    const patch = {
      custom_name: data.customName,
      short_name: data.shortName ?? null,
      entry_code: data.entryCode ?? null,
      subtitle: data.subtitle ?? null,
      image_url: data.imageUrl ?? null,
      description: data.description ?? null,
    };

    const { data: updated, error: updateError } = await televotingAdmin
      .from("round_entries")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();
    if (updateError) throw new Error(updateError.message);

    await audit(actor, "update_custom_round_entry", data.id, before, updated);
    return { ok: true };
  }

  const { count, error: countError } = await televotingAdmin
    .from("round_entries")
    .select("id", { count: "exact", head: true })
    .eq("round_id", data.roundId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= 50) throw new Error("A round can have at most 50 entries");

  const { data: lastRows, error: lastError } = await televotingAdmin
    .from("round_entries")
    .select("display_order")
    .eq("round_id", data.roundId)
    .order("display_order", { ascending: false })
    .limit(1);
  if (lastError) throw new Error(lastError.message);

  const entryKey = `x_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const { data: inserted, error: insertError } = await televotingAdmin
    .from("round_entries")
    .insert({
      round_id: data.roundId,
      entry_type: "custom",
      entry_key: entryKey,
      country_code: null,
      custom_name: data.customName,
      short_name: data.shortName ?? null,
      entry_code: data.entryCode ?? null,
      subtitle: data.subtitle ?? null,
      image_url: data.imageUrl ?? null,
      description: data.description ?? null,
      display_order: Number(lastRows?.[0]?.display_order ?? 0) + 1,
    })
    .select("*")
    .single();
  if (insertError) throw new Error(insertError.message);

  const participantMode = await syncParticipantMode(data.roundId);
  await audit(actor, "create_custom_round_entry", inserted.id, null, inserted);
  return { ok: true, participantMode };
}

export async function deleteMergedCustomRoundEntryServer(data: { roundId: string; entryId: string }) {
  const actor = await requireMergedTelevotingAdminServer();
  await assertEditableRound(data.roundId);

  const { data: before, error: beforeError } = await televotingAdmin
    .from("round_entries")
    .select("*")
    .eq("id", data.entryId)
    .eq("round_id", data.roundId)
    .eq("entry_type", "custom")
    .maybeSingle();
  if (beforeError) throw new Error(beforeError.message);
  if (!before) throw new Error("Custom entry not found");

  const { data: submissions, error: submissionError } = await televotingAdmin
    .from("vote_submissions")
    .select("id")
    .eq("round_id", data.roundId);
  if (submissionError) throw new Error(submissionError.message);

  const submissionIds = (submissions ?? []).map((row) => row.id);
  if (submissionIds.length) {
    const { count, error: dependencyError } = await televotingAdmin
      .from("vote_entries")
      .select("id", { count: "exact", head: true })
      .in("submission_id", submissionIds)
      .eq("target_country_code", before.entry_key);
    if (dependencyError) throw new Error(dependencyError.message);
    if ((count ?? 0) > 0) {
      throw new Error(`Cannot delete this entry because it is referenced by ${count} submitted vote${count === 1 ? "" : "s"}.`);
    }
  }

  const { error: deleteError } = await televotingAdmin.from("round_entries").delete().eq("id", data.entryId);
  if (deleteError) throw new Error(deleteError.message);

  await normalizeOrders(data.roundId);
  const participantMode = await syncParticipantMode(data.roundId);
  await audit(actor, "delete_custom_round_entry", data.entryId, before, null);
  return { ok: true, participantMode };
}

export async function reorderMergedRoundEntriesServer(data: { roundId: string; entryIds: string[] }) {
  const actor = await requireMergedTelevotingAdminServer();
  await assertEditableRound(data.roundId);

  const { data: before, error: beforeError } = await televotingAdmin
    .from("round_entries")
    .select("id,entry_key,display_order")
    .eq("round_id", data.roundId)
    .order("display_order");
  if (beforeError) throw new Error(beforeError.message);

  const existingIds = (before ?? []).map((row) => row.id);
  if (
    existingIds.length !== data.entryIds.length ||
    data.entryIds.some((id) => !existingIds.includes(id))
  ) {
    throw new Error("Entry list changed. Refresh and try again.");
  }

  for (let index = 0; index < data.entryIds.length; index += 1) {
    const { error } = await televotingAdmin
      .from("round_entries")
      .update({ display_order: index + 1 })
      .eq("id", data.entryIds[index]!)
      .eq("round_id", data.roundId);
    if (error) throw new Error(error.message);
  }

  await audit(
    actor,
    "reorder_round_entries",
    data.roundId,
    before,
    data.entryIds.map((id, index) => ({ id, display_order: index + 1 })),
  );
  return { ok: true };
}

export async function setMergedRoundSelfVotingModeServer(data: {
  roundId: string;
  mode: "country_match" | "linked_identity" | "disabled" | "unrestricted";
}) {
  const actor = await requireMergedTelevotingAdminServer();
  const round = await assertEditableRound(data.roundId);

  const { error } = await televotingAdmin
    .from("rounds")
    .update({ self_voting_mode: data.mode })
    .eq("id", data.roundId);
  if (error) throw new Error(error.message);

  await audit(
    actor,
    "set_self_voting_mode",
    data.roundId,
    { self_voting_mode: round.self_voting_mode },
    { self_voting_mode: data.mode },
  );
  return { ok: true };
}
