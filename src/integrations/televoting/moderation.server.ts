import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

export type MergedModerationSubmission = {
  id: string;
  round_id: string;
  round_name: string;
  username: string;
  username_normalized: string;
  country_code: string;
  country_name: string;
  country_flag: string | null;
  country_flag_url: string | null;
  ip_country: string | null;
  is_vpn: boolean;
  risk_score: number;
  status: "active" | "suspicious" | "verified" | "deleted";
  moderator_note: string | null;
  verified_at: string | null;
  verified_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  edited_at: string | null;
  edited_by: string | null;
  created_at: string;
  entries: Array<{
    target_country_code: string;
    points: number;
    target_name: string;
    target_code: string;
    target_image: string | null;
    target_flag: string | null;
  }>;
};

async function audit(
  actor: { id: string; username: string },
  action: string,
  opts: {
    target_type?: string;
    target_id?: string;
    old_values?: unknown;
    new_values?: unknown;
    reason?: string;
  } = {},
) {
  await televotingAdmin.from("admin_audit_log").insert({
    actor_admin_id: actor.id,
    actor_username: actor.username,
    action,
    target_type: opts.target_type ?? null,
    target_id: opts.target_id ?? null,
    old_values: opts.old_values ?? null,
    new_values: opts.new_values ?? null,
    reason: opts.reason ?? null,
  });
}

export async function listMergedModerationSubmissionsServer(roundId?: string | null): Promise<MergedModerationSubmission[]> {
  await requireMergedTelevotingAdminServer();

  let query = televotingAdmin
    .from("vote_submissions")
    .select("id,round_id,username,username_normalized,country_code,ip_country,is_vpn,risk_score,status,moderator_note,verified_at,verified_by,deleted_at,deleted_by,edited_at,edited_by,created_at")
    .order("created_at", { ascending: false })
    .limit(2500);
  if (roundId) query = query.eq("round_id", roundId);

  const { data: submissions, error: submissionError } = await query;
  if (submissionError) throw new Error(submissionError.message);
  if (!(submissions ?? []).length) return [];

  const submissionIds = (submissions ?? []).map((row) => row.id);
  const roundIds = [...new Set((submissions ?? []).map((row) => row.round_id))];
  const countryCodes = [...new Set((submissions ?? []).map((row) => row.country_code))];

  const [entryResult, roundResult, countryResult, roundEntryResult] = await Promise.all([
    televotingAdmin
      .from("vote_entries")
      .select("submission_id,target_country_code,points")
      .in("submission_id", submissionIds),
    televotingAdmin.from("rounds").select("id,name").in("id", roundIds),
    televotingAdmin.from("countries").select("code,name,flag,flag_url").in("code", countryCodes),
    televotingAdmin
      .from("round_entries")
      .select("entry_key,country_code,custom_name,short_name,entry_code,image_url")
      .in("round_id", roundIds),
  ]);

  if (entryResult.error) throw new Error(entryResult.error.message);
  if (roundResult.error) throw new Error(roundResult.error.message);
  if (countryResult.error) throw new Error(countryResult.error.message);
  if (roundEntryResult.error) throw new Error(roundEntryResult.error.message);

  const roundMap = new Map((roundResult.data ?? []).map((row) => [row.id, row.name]));
  const countryMap = new Map((countryResult.data ?? []).map((row) => [row.code, row]));

  const allCountriesResult = await televotingAdmin.from("countries").select("code,name,flag,flag_url");
  if (allCountriesResult.error) throw new Error(allCountriesResult.error.message);
  const allCountryMap = new Map((allCountriesResult.data ?? []).map((row) => [row.code, row]));

  const targetMap = new Map<string, {
    name: string;
    code: string;
    image: string | null;
    flag: string | null;
  }>();
  for (const entry of roundEntryResult.data ?? []) {
    const country = entry.country_code ? allCountryMap.get(entry.country_code) : undefined;
    targetMap.set(entry.entry_key, {
      name: entry.custom_name || entry.short_name || country?.name || entry.entry_key,
      code: entry.entry_code || entry.country_code || entry.entry_key,
      image: entry.image_url || country?.flag_url || null,
      flag: country?.flag || null,
    });
  }

  const entriesBySubmission = new Map<string, Array<{ target_country_code: string; points: number }>>();
  for (const entry of entryResult.data ?? []) {
    const list = entriesBySubmission.get(entry.submission_id) ?? [];
    list.push({ target_country_code: entry.target_country_code, points: Number(entry.points ?? 0) });
    entriesBySubmission.set(entry.submission_id, list);
  }

  return (submissions ?? []).map((row) => {
    const country = countryMap.get(row.country_code);
    return {
      ...row,
      round_name: roundMap.get(row.round_id) ?? "Unknown round",
      country_name: country?.name ?? row.country_code,
      country_flag: country?.flag ?? null,
      country_flag_url: country?.flag_url ?? null,
      status: row.status as MergedModerationSubmission["status"],
      entries: (entriesBySubmission.get(row.id) ?? [])
        .sort((a, b) => b.points - a.points || a.target_country_code.localeCompare(b.target_country_code))
        .map((entry) => {
          const target = targetMap.get(entry.target_country_code);
          return {
            ...entry,
            target_name: target?.name ?? entry.target_country_code,
            target_code: target?.code ?? entry.target_country_code,
            target_image: target?.image ?? null,
            target_flag: target?.flag ?? null,
          };
        }),
    };
  }) as MergedModerationSubmission[];
}

export async function setMergedSubmissionStatusServer(data: {
  id: string;
  status: "active" | "suspicious" | "verified";
  reason?: string;
}) {
  const actor = await requireMergedTelevotingAdminServer();
  const { data: before, error: readError } = await televotingAdmin
    .from("vote_submissions")
    .select("id,status,verified_at,verified_by")
    .eq("id", data.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!before) throw new Error("Vote not found");

  const patch: Record<string, unknown> = { status: data.status };
  if (data.status === "verified") {
    patch.verified_at = new Date().toISOString();
    patch.verified_by = actor.id;
  } else {
    patch.verified_at = null;
    patch.verified_by = null;
  }

  const { error } = await televotingAdmin.from("vote_submissions").update(patch).eq("id", data.id);
  if (error) throw new Error(error.message);

  await audit(actor, "moderate_vote_status", {
    target_type: "vote_submission",
    target_id: data.id,
    old_values: before,
    new_values: patch,
    reason: data.reason,
  });
  return { ok: true };
}

export async function softDeleteMergedSubmissionServer(data: { id: string; reason: string }) {
  const actor = await requireMergedTelevotingAdminServer();
  const { data: before, error: readError } = await televotingAdmin
    .from("vote_submissions")
    .select("id,status,moderator_note")
    .eq("id", data.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!before) throw new Error("Vote not found");

  const { error } = await televotingAdmin
    .from("vote_submissions")
    .update({
      status: "deleted",
      deleted_at: new Date().toISOString(),
      deleted_by: actor.id,
      moderator_note: data.reason,
    })
    .eq("id", data.id);
  if (error) throw new Error(error.message);

  await audit(actor, "delete_vote", {
    target_type: "vote_submission",
    target_id: data.id,
    old_values: before,
    new_values: { status: "deleted" },
    reason: data.reason,
  });
  return { ok: true };
}

export async function restoreMergedSubmissionServer(data: { id: string; reason?: string }) {
  const actor = await requireMergedTelevotingAdminServer();
  const { data: before, error: readError } = await televotingAdmin
    .from("vote_submissions")
    .select("id,status,deleted_at,deleted_by")
    .eq("id", data.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!before) throw new Error("Vote not found");

  const { error } = await televotingAdmin
    .from("vote_submissions")
    .update({ status: "active", deleted_at: null, deleted_by: null })
    .eq("id", data.id);
  if (error) throw new Error(error.message);

  await audit(actor, "restore_vote", {
    target_type: "vote_submission",
    target_id: data.id,
    old_values: before,
    new_values: { status: "active" },
    reason: data.reason,
  });
  return { ok: true };
}

export async function updateMergedSubmissionNoteServer(data: { id: string; note: string }) {
  const actor = await requireMergedTelevotingAdminServer();
  const { data: before, error: readError } = await televotingAdmin
    .from("vote_submissions")
    .select("moderator_note")
    .eq("id", data.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!before) throw new Error("Vote not found");

  const { error } = await televotingAdmin
    .from("vote_submissions")
    .update({ moderator_note: data.note })
    .eq("id", data.id);
  if (error) throw new Error(error.message);

  await audit(actor, "update_vote_note", {
    target_type: "vote_submission",
    target_id: data.id,
    old_values: before,
    new_values: { moderator_note: data.note },
  });
  return { ok: true };
}

export async function editMergedSubmissionEntriesServer(data: {
  id: string;
  entries: Array<{ target_country_code: string; points: number }>;
  reason: string;
}) {
  const actor = await requireMergedTelevotingAdminServer();

  const { data: submission, error: submissionError } = await televotingAdmin
    .from("vote_submissions")
    .select("id,round_id")
    .eq("id", data.id)
    .maybeSingle();
  if (submissionError) throw new Error(submissionError.message);
  if (!submission) throw new Error("Vote not found");

  const { data: validEntries, error: validError } = await televotingAdmin
    .from("round_entries")
    .select("entry_key")
    .eq("round_id", submission.round_id);
  if (validError) throw new Error(validError.message);
  const validKeys = new Set((validEntries ?? []).map((entry) => entry.entry_key));
  const invalid = data.entries.filter((entry) => !validKeys.has(entry.target_country_code));
  if (invalid.length) throw new Error("Ballot contains an entry that is not eligible in this round");

  const { data: before, error: beforeError } = await televotingAdmin
    .from("vote_entries")
    .select("target_country_code,points")
    .eq("submission_id", data.id);
  if (beforeError) throw new Error(beforeError.message);

  const { error: deleteError } = await televotingAdmin.from("vote_entries").delete().eq("submission_id", data.id);
  if (deleteError) throw new Error(deleteError.message);

  const { error: insertError } = await televotingAdmin.from("vote_entries").insert(
    data.entries.map((entry) => ({
      submission_id: data.id,
      target_country_code: entry.target_country_code,
      points: entry.points,
    })),
  );
  if (insertError) throw new Error(insertError.message);

  const { error: markError } = await televotingAdmin
    .from("vote_submissions")
    .update({ edited_at: new Date().toISOString(), edited_by: actor.id })
    .eq("id", data.id);
  if (markError) throw new Error(markError.message);

  await audit(actor, "edit_vote_entries", {
    target_type: "vote_submission",
    target_id: data.id,
    old_values: before,
    new_values: data.entries,
    reason: data.reason,
  });
  return { ok: true };
}

export async function getMergedModerationAlertsCountServer() {
  await requireMergedTelevotingAdminServer();
  const [suspicious, events] = await Promise.all([
    televotingAdmin
      .from("vote_submissions")
      .select("id", { count: "exact", head: true })
      .eq("status", "suspicious"),
    televotingAdmin
      .from("anti_abuse_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);
  if (suspicious.error) throw new Error(suspicious.error.message);
  if (events.error) throw new Error(events.error.message);
  return (suspicious.count ?? 0) + (events.count ?? 0);
}
