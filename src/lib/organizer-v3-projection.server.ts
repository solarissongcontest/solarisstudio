import { requireSolarisCapabilityServer } from "@/integrations/supabase/capabilities.server";
import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import { loadOrganizerTasksV5 } from "@/lib/admin-tasks-v5";
import { loadControlRoomModelServer } from "@/lib/control-room.server";
import {
  buildV3OrganizerProjection,
  type V3OrganizerEditionProjection,
  type V3OrganizerHealthInput,
  type V3OrganizerProjection,
  type V3OrganizerRecentChange,
  type V3OrganizerUpcomingItem,
} from "@/lib/v3-organizer-projection";

function validEditionId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function missingSchema(error: unknown) {
  const text = String((error as { message?: string; code?: string })?.message ?? error ?? "").toLowerCase();
  const code = String((error as { code?: string })?.code ?? "").toLowerCase();
  return (
    code === "pgrst202" ||
    code === "pgrst205" ||
    text.includes("does not exist") ||
    text.includes("schema cache") ||
    text.includes("could not find")
  );
}

function future(value: string | null | undefined, now: number) {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= now;
}

function activeShowFromRows(rows: Array<Record<string, unknown>>) {
  const candidates = [...rows].sort(
    (a, b) => Number(a.sort_order ?? Number.MAX_SAFE_INTEGER) - Number(b.sort_order ?? Number.MAX_SAFE_INTEGER),
  );
  const row =
    candidates.find((show) => ["live", "active", "open", "in_progress"].includes(String(show.status ?? "").toLowerCase())) ??
    null;
  if (!row?.id) return undefined;
  return {
    id: String(row.id),
    label: String(row.name ?? "Show"),
    status: String(row.status ?? "unknown"),
    kind: String(row.kind ?? "other"),
  };
}

async function loadHealth(db: ReturnType<typeof createSolarisAuthenticatedClientServer>, editionId: string) {
  const { data, error } = await (db as any).rpc("admin_edition_health_summary", {
    _edition_id: editionId,
  });
  if (error) {
    if (missingSchema(error)) return null;
    throw error;
  }
  return (data ?? null) as V3OrganizerHealthInput | null;
}

async function loadRecentChanges(
  db: ReturnType<typeof createSolarisAuthenticatedClientServer>,
  editionId: string,
): Promise<V3OrganizerRecentChange[]> {
  const { data, error } = await (db as any)
    .from("admin_audit_log")
    .select("id,actor_id,action,table_name,record_id,created_at")
    .eq("edition_id", editionId)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) {
    if (missingSchema(error)) return [];
    throw error;
  }

  return (data ?? [])
    .map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ""),
      action: String(row.action ?? "Updated"),
      subject:
        [row.table_name, row.record_id].filter(Boolean).map(String).join(" · ") ||
        "Organizer state",
      createdAt: String(row.created_at ?? ""),
      actorId: row.actor_id == null ? null : String(row.actor_id),
    }))
    .filter((item: V3OrganizerRecentChange) => item.id && item.createdAt);
}

async function loadUpcoming(
  db: ReturnType<typeof createSolarisAuthenticatedClientServer>,
  editionId: string,
  editionSlug: string,
  eventDate: string | null,
  shows: Array<Record<string, unknown>>,
): Promise<V3OrganizerUpcomingItem[]> {
  const now = Date.now();
  const [
    roundsResult,
    juryWindowsResult,
    televoteBindingsResult,
    entriesResult,
    noticesResult,
    remindersResult,
  ] = await Promise.all([
    (db as any)
      .from("submission_rounds")
      .select("id,name,status,opens_at,closes_at")
      .eq("edition_id", editionId),
    (db as any)
      .from("jury_voting_windows")
      .select("show_id,status,opened_at,closed_at")
      .eq("edition_id", editionId),
    (db as any)
      .from("televoting_round_bindings")
      .select("remote_round_id,show_id")
      .eq("edition_id", editionId),
    (db as any)
      .from("participants")
      .select("id,artist,song,publication_status,scheduled_publish_at")
      .eq("edition_id", editionId)
      .is("show_id", null)
      .eq("publication_status", "scheduled")
      .not("scheduled_publish_at", "is", null),
    (db as any)
      .from("studio2_official_notices")
      .select("id,title,status,scheduled_at")
      .eq("edition_id", editionId)
      .eq("status", "scheduled")
      .not("scheduled_at", "is", null),
    (db as any)
      .from("admin_deadlines")
      .select("id,label,due_at,notes,completed_at")
      .eq("edition_id", editionId)
      .is("completed_at", null),
  ]);

  const scheduleResults = [
    ["submission rounds", roundsResult],
    ["jury voting", juryWindowsResult],
    ["televote bindings", televoteBindingsResult],
    ["entry publication", entriesResult],
    ["communications", noticesResult],
    ["custom reminders", remindersResult],
  ] as const;
  const failed = scheduleResults.find(([, result]) => Boolean(result.error));
  if (failed) {
    const [source, result] = failed;
    throw new Error(
      `Operational schedule could not be verified: ${source}: ${String(result.error?.message ?? result.error)}`,
    );
  }

  const remoteRoundIds = (televoteBindingsResult.data ?? [])
    .map((binding: { remote_round_id?: string | null }) => binding.remote_round_id)
    .filter((value: string | null | undefined): value is string => Boolean(value));

  const televoteRoundsResult = remoteRoundIds.length
    ? await (db as any)
        .schema("televoting")
        .from("rounds")
        .select("id,name,status,opened_at,closed_at")
        .in("id", remoteRoundIds)
    : { data: [], error: null };
  if (televoteRoundsResult.error) {
    throw new Error(
      `Operational schedule could not be verified: televote rounds: ${String(televoteRoundsResult.error?.message ?? televoteRoundsResult.error)}`,
    );
  }

  const showNameById = new Map(
    shows
      .filter((show) => show.id)
      .map((show) => [String(show.id), String(show.name ?? "Show")] as const),
  );
  const televoteBindingByRemoteId = new Map<
    string,
    { remote_round_id: string; show_id: string | null }
  >(
    (televoteBindingsResult.data ?? []).map(
      (binding: { remote_round_id: string; show_id: string | null }) => [
        binding.remote_round_id,
        binding,
      ],
    ),
  );

  const items: V3OrganizerUpcomingItem[] = [];

  for (const round of roundsResult.data ?? []) {
    if (future(round.opens_at, now)) {
      items.push({
        id: `submission-open:${round.id}`,
        label: `${round.name ?? "Confirmation round"} opens`,
        detail: "Confirmation submission round",
        at: String(round.opens_at),
        route: "/confirmations/admin/rounds",
      });
    }
    if (future(round.closes_at, now)) {
      items.push({
        id: `submission-close:${round.id}`,
        label: `${round.name ?? "Confirmation round"} closes`,
        detail: "Confirmation submission round",
        at: String(round.closes_at),
        route: "/confirmations/admin/rounds",
      });
    }
  }

  for (const window of juryWindowsResult.data ?? []) {
    const showName = window.show_id ? showNameById.get(String(window.show_id)) : null;
    const label = showName ? `Jury voting · ${showName}` : "Jury voting";
    if (future(window.opened_at, now)) {
      items.push({
        id: `jury-open:${window.show_id ?? editionId}`,
        label: `${label} opens`,
        detail: "Jury voting window",
        at: String(window.opened_at),
        route: `/admin/jury/${editionSlug}`,
      });
    }
    if (future(window.closed_at, now)) {
      items.push({
        id: `jury-close:${window.show_id ?? editionId}`,
        label: `${label} closes`,
        detail: "Jury voting window",
        at: String(window.closed_at),
        route: `/admin/jury/${editionSlug}`,
      });
    }
  }

  for (const round of televoteRoundsResult.data ?? []) {
    const binding = televoteBindingByRemoteId.get(String(round.id));
    const showName = binding?.show_id ? showNameById.get(binding.show_id) : null;
    const label = showName
      ? `Televote · ${showName}`
      : round.name
        ? `Televote · ${round.name}`
        : "Televote";
    if (future(round.opened_at, now)) {
      items.push({
        id: `televote-open:${round.id}`,
        label: `${label} opens`,
        detail: "Public voting round",
        at: String(round.opened_at),
        route: "/televoting/admin/rounds",
      });
    }
    if (future(round.closed_at, now)) {
      items.push({
        id: `televote-close:${round.id}`,
        label: `${label} closes`,
        detail: "Public voting round",
        at: String(round.closed_at),
        route: "/televoting/admin/rounds",
      });
    }
  }

  for (const entry of entriesResult.data ?? []) {
    if (!future(entry.scheduled_publish_at, now)) continue;
    const entryLabel = [entry.artist, entry.song].filter(Boolean).join(" — ");
    items.push({
      id: `entry-reveal:${entry.id}`,
      label: entryLabel ? `Reveal: ${entryLabel}` : "Scheduled entry reveal",
      detail: "Entry publication schedule",
      at: String(entry.scheduled_publish_at),
      route: `/admin/entries/${editionSlug}`,
    });
  }

  for (const notice of noticesResult.data ?? []) {
    if (!future(notice.scheduled_at, now)) continue;
    items.push({
      id: `notice:${notice.id}`,
      label: `Send: ${notice.title ?? "Official communication"}`,
      detail: "Official communication",
      at: String(notice.scheduled_at),
      route: "/admin/communications",
    });
  }

  if (eventDate) {
    const at = `${eventDate}T12:00:00`;
    if (future(at, now)) {
      items.push({
        id: `edition-event:${editionId}`,
        label: "Edition event date",
        detail: "Edition schedule",
        at,
        route: `/admin/shows/${editionSlug}`,
      });
    }
  }

  for (const reminder of remindersResult.data ?? []) {
    if (!future(reminder.due_at, now)) continue;
    items.push({
      id: `reminder:${reminder.id}`,
      label: `Reminder · ${reminder.label ?? "Organizer reminder"}`,
      detail: reminder.notes
        ? `Organizer reminder · ${reminder.notes}`
        : "Organizer reminder · does not control a Solaris workflow",
      at: String(reminder.due_at),
      route: "/admin/system",
    });
  }

  return items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(0, 6);
}

export async function loadV3OrganizerProjectionServer(
  editionId: string,
): Promise<V3OrganizerProjection> {
  if (!validEditionId(editionId)) throw new Error("Invalid edition id");

  const capability = await requireSolarisCapabilityServer("edition.read", editionId);
  const db = createSolarisAuthenticatedClientServer();

  const [editionResult, showsResult] = await Promise.all([
    (db as any)
      .from("editions")
      .select("id,slug,name,edition_number,status,event_date")
      .eq("id", editionId)
      .single(),
    (db as any)
      .from("shows")
      .select("id,name,status,kind,sort_order")
      .eq("edition_id", editionId),
  ]);

  const editionRow = editionResult.data;
  if (editionResult.error || !editionRow) {
    throw new Error(editionResult.error?.message || "Edition could not be loaded");
  }
  if (showsResult.error && !missingSchema(showsResult.error)) throw showsResult.error;

  const edition: V3OrganizerEditionProjection = {
    id: String(editionRow.id),
    slug: String(editionRow.slug ?? ""),
    name: String(editionRow.name ?? ""),
    editionNumber: Number.isFinite(Number(editionRow.edition_number))
      ? Number(editionRow.edition_number)
      : null,
    status: editionRow.status == null ? null : String(editionRow.status),
  };
  if (!edition.slug) throw new Error("Edition is missing its canonical slug");

  const showRows = (showsResult.data ?? []) as Array<Record<string, unknown>>;
  const [tasks, live, health, recentChanges, upcoming] = await Promise.all([
    loadOrganizerTasksV5(editionId, "all", db as any),
    loadControlRoomModelServer(editionId),
    loadHealth(db, editionId),
    loadRecentChanges(db, editionId),
    loadUpcoming(
      db,
      editionId,
      edition.slug,
      editionRow.event_date == null ? null : String(editionRow.event_date),
      showRows,
    ),
  ]);

  return buildV3OrganizerProjection({
    edition,
    tasks,
    live,
    actorId: capability.userId,
    health,
    activeShow: activeShowFromRows(showRows),
    upcoming,
    recentChanges,
    serverTime: new Date().toISOString(),
  });
}
