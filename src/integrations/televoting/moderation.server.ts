import { requireSolarisCapabilityServer } from "@/integrations/supabase/capabilities.server";
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
  version: number;
  entries: Array<{
    target_country_code: string;
    points: number;
    target_name: string;
    target_code: string;
    target_image: string | null;
    target_flag: string | null;
  }>;
};

type ModerationCommandInput = {
  id: string;
  expectedVersion?: number;
  operationId: string;
  idempotencyKey: string;
};

async function requireModerationReadServer() {
  await requireSolarisCapabilityServer("integrity.read", null);
  await requireMergedTelevotingAdminServer();
}

async function requireModerationManageServer() {
  await requireSolarisCapabilityServer("integrity.manage", null);
  await requireMergedTelevotingAdminServer();
}

async function resolveSubmissionVersion(id: string, expectedVersion?: number) {
  if (expectedVersion !== undefined) return expectedVersion;
  const { data, error } = await televotingAdmin.rpc("admin_submission_versions", {
    p_submission_ids: [id],
  });
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as Array<{ submission_id: string; version: number }>).find(
    (candidate) => candidate.submission_id === id,
  );
  if (!row) throw new Error("Ballot revision is unavailable; refresh before editing");
  return Number(row.version ?? 0);
}

async function applyModerationCommand(
  data: ModerationCommandInput,
  action: "set_status" | "soft_delete" | "restore" | "update_note" | "replace_entries",
  payload: Record<string, unknown>,
  reason?: string,
) {
  await requireModerationManageServer();
  const expectedVersion = await resolveSubmissionVersion(data.id, data.expectedVersion);
  const { data: result, error } = await televotingAdmin.rpc("v3_moderate_submission", {
    p_submission_id: data.id,
    p_action: action,
    p_payload: payload,
    p_reason: reason?.trim() || null,
    p_expected_version: expectedVersion,
    p_operation_id: data.operationId,
    p_idempotency_key: data.idempotencyKey,
    p_correlation_id: data.operationId,
  });
  if (error) throw new Error(error.message);
  return result;
}

export async function listMergedModerationSubmissionsServer(roundId?: string | null): Promise<MergedModerationSubmission[]> {
  await requireModerationReadServer();

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

  const [entryResult, roundResult, countryResult, roundEntryResult, versionResult] = await Promise.all([
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
    televotingAdmin.rpc("admin_submission_versions", { p_submission_ids: submissionIds }),
  ]);

  if (entryResult.error) throw new Error(entryResult.error.message);
  if (roundResult.error) throw new Error(roundResult.error.message);
  if (countryResult.error) throw new Error(countryResult.error.message);
  if (roundEntryResult.error) throw new Error(roundEntryResult.error.message);
  if (versionResult.error) throw new Error(versionResult.error.message);

  const roundMap = new Map((roundResult.data ?? []).map((row) => [row.id, row.name]));
  const countryMap = new Map((countryResult.data ?? []).map((row) => [row.code, row]));
  const versionMap = new Map(
    ((versionResult.data ?? []) as Array<{ submission_id: string; version: number }>).map((row) => [
      row.submission_id,
      Number(row.version ?? 0),
    ]),
  );

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
      version: versionMap.get(row.id) ?? 0,
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

export async function setMergedSubmissionStatusServer(data: ModerationCommandInput & {
  status: "active" | "suspicious" | "verified";
  reason?: string;
}) {
  return applyModerationCommand(data, "set_status", { status: data.status }, data.reason);
}

export async function softDeleteMergedSubmissionServer(data: ModerationCommandInput & {
  reason: string;
}) {
  return applyModerationCommand(data, "soft_delete", {}, data.reason);
}

export async function restoreMergedSubmissionServer(data: ModerationCommandInput & {
  reason?: string;
}) {
  return applyModerationCommand(data, "restore", {}, data.reason);
}

export async function updateMergedSubmissionNoteServer(data: ModerationCommandInput & {
  note: string;
}) {
  return applyModerationCommand(data, "update_note", { note: data.note });
}

export async function editMergedSubmissionEntriesServer(data: ModerationCommandInput & {
  entries: Array<{ target_country_code: string; points: number }>;
  reason: string;
}) {
  return applyModerationCommand(data, "replace_entries", { entries: data.entries }, data.reason);
}

export async function getMergedModerationAlertsCountServer() {
  await requireModerationReadServer();
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
