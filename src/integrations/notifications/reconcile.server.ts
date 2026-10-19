export const V3_NOTIFICATION_RECONCILIATION_DEFAULT_BATCH = 25;
export const V3_NOTIFICATION_RECONCILIATION_MAX_BATCH = 100;
export const V3_NOTIFICATION_RECONCILIATION_VERIFY_MAX_ROWS = 100;

export const V3_NOTIFICATION_TASK_EVENT_TYPES = [
  "confirmation.opens_soon",
  "confirmation.opened",
  "confirmation.deadline_3d",
  "confirmation.deadline_24h",
  "confirmation.deadline_3h",
  "confirmation.deadline_1h",
  "jury.opened",
  "televote.opened",
] as const;

export type ReconciledNotificationDelivery = {
  id: string;
  user_id: string;
  event_type: string;
  subject_id: string;
  status: string;
};

type PendingDeliveryPage = {
  rows: ReconciledNotificationDelivery[];
  total: number;
};

export type NotificationDeliveryTruth = {
  suppress: boolean;
  reason: string | null;
};

export type ActorNotificationReconciliationDependencies = {
  loadPendingTaskDeliveries: (userId: string, limit: number) => Promise<PendingDeliveryPage>;
  evaluateDeliveryTruth: (
    userId: string,
    delivery: ReconciledNotificationDelivery,
  ) => Promise<NotificationDeliveryTruth>;
  suppressPendingDelivery: (
    userId: string,
    deliveryId: string,
    reason: string,
  ) => Promise<boolean>;
};

export type ActorNotificationReconciliationResult = {
  userId: string;
  limit: number;
  totalPendingTaskDeliveries: number;
  scanned: number;
  suppressed: number;
  unchanged: number;
  failed: number;
  hasMore: boolean;
  failures: readonly { deliveryId: string; message: string }[];
};

export type ActorNotificationVerificationResult = {
  userId: string;
  state: "consistent" | "drift" | "unknown";
  reason: "verified" | "verification_bound_exceeded";
  totalPendingTaskDeliveries: number;
  stalePendingDeliveryIds: readonly string[];
  verifiedAt: string;
};

function boundedBatch(value: number | undefined) {
  const resolved = value ?? V3_NOTIFICATION_RECONCILIATION_DEFAULT_BATCH;
  if (
    !Number.isInteger(resolved) ||
    resolved < 1 ||
    resolved > V3_NOTIFICATION_RECONCILIATION_MAX_BATCH
  ) {
    throw new Error(
      `Expected notification reconciliation batch between 1 and ${V3_NOTIFICATION_RECONCILIATION_MAX_BATCH}.`,
    );
  }
  return resolved;
}

function safeError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : String(caught ?? "Unknown error");
  return message.slice(0, 240);
}

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function ensureUserId(userId: string) {
  const value = userId.trim();
  if (!value) throw new Error("Notification reconciliation requires a user id.");
  return value;
}

async function activeCountryIdentity(db: any, userId: string) {
  const accounts = await db
    .from("country_accounts")
    .select("country_id")
    .eq("user_id", userId)
    .eq("status", "active");
  if (accounts.error) throw new Error(accounts.error.message);

  const countryIds = [
    ...new Set((accounts.data ?? []).map((row: any) => row.country_id).filter(Boolean)),
  ];
  if (!countryIds.length) {
    return { countryIds: [] as string[], countryNames: new Set<string>() };
  }

  const countries = await db.from("countries").select("id,name").in("id", countryIds);
  if (countries.error) throw new Error(countries.error.message);

  return {
    countryIds,
    countryNames: new Set(
      (countries.data ?? []).map((row: any) => normalized(row.name)).filter(Boolean),
    ),
  };
}

async function confirmationTruth(db: any, userId: string, subjectId: string) {
  const round = await db
    .from("submission_rounds")
    .select("id,status")
    .eq("id", subjectId)
    .maybeSingle();
  if (round.error) throw new Error(round.error.message);
  if (!round.data || ["closed", "auto_closed"].includes(round.data.status)) {
    return {
      suppress: true,
      reason: "Confirmation round is no longer actionable.",
    } satisfies NotificationDeliveryTruth;
  }

  const identity = await activeCountryIdentity(db, userId);
  if (!identity.countryIds.length) {
    return {
      suppress: true,
      reason: "Recipient no longer owns an active delegation.",
    } satisfies NotificationDeliveryTruth;
  }

  const submissions = await db
    .from("submissions")
    .select("country,country_account")
    .eq("round_id", subjectId);
  if (submissions.error) throw new Error(submissions.error.message);

  const alreadySubmitted = (submissions.data ?? []).some((submission: any) => {
    const country = normalized(submission.country);
    const account = normalized(submission.country_account);
    return identity.countryNames.has(country) || identity.countryNames.has(account);
  });

  return alreadySubmitted
    ? {
        suppress: true,
        reason: "Confirmation requirement is already satisfied.",
      }
    : { suppress: false, reason: null };
}

async function juryTruth(db: any, userId: string, subjectId: string) {
  const window = await db
    .from("jury_voting_windows")
    .select("show_id")
    .eq("show_id", subjectId)
    .eq("status", "open")
    .limit(1);
  if (window.error) throw new Error(window.error.message);
  if (!(window.data ?? []).length) {
    return {
      suppress: true,
      reason: "Jury voting window is no longer open.",
    } satisfies NotificationDeliveryTruth;
  }

  const identity = await activeCountryIdentity(db, userId);
  if (!identity.countryIds.length) {
    return {
      suppress: true,
      reason: "Recipient no longer owns an active delegation.",
    } satisfies NotificationDeliveryTruth;
  }

  const [ballots, votes] = await Promise.all([
    db
      .from("jury_ballot_submissions")
      .select("id")
      .eq("show_id", subjectId)
      .in("voter_country_id", identity.countryIds)
      .eq("status", "submitted")
      .limit(1),
    db
      .from("jury_votes")
      .select("id")
      .eq("show_id", subjectId)
      .in("voter_country_id", identity.countryIds)
      .limit(1),
  ]);
  if (ballots.error) throw new Error(ballots.error.message);
  if (votes.error) throw new Error(votes.error.message);

  return (ballots.data ?? []).length || (votes.data ?? []).length
    ? { suppress: true, reason: "Jury requirement is already satisfied." }
    : { suppress: false, reason: null };
}

async function televoteTruth(db: any, subjectId: string) {
  const rounds = await db
    .schema("televoting")
    .from("rounds")
    .select("id")
    .eq("id", subjectId)
    .eq("status", "open")
    .limit(1);
  if (rounds.error) throw new Error(rounds.error.message);
  return (rounds.data ?? []).length
    ? { suppress: false, reason: null }
    : { suppress: true, reason: "Televoting round is no longer open." };
}

export function createActorNotificationReconciliationDependencies(
  db: any,
): ActorNotificationReconciliationDependencies {
  return {
    async loadPendingTaskDeliveries(userId, limit) {
      const page = await db
        .from("notification_deliveries")
        .select("id,user_id,event_type,subject_id,status", { count: "exact" })
        .eq("user_id", userId)
        .eq("status", "pending")
        .in("event_type", [...V3_NOTIFICATION_TASK_EVENT_TYPES])
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(limit);
      if (page.error) throw new Error(page.error.message);
      return {
        rows: (page.data ?? []) as ReconciledNotificationDelivery[],
        total: page.count ?? (page.data ?? []).length,
      };
    },

    async evaluateDeliveryTruth(userId, delivery) {
      if (
        delivery.event_type === "confirmation.opens_soon" ||
        delivery.event_type === "confirmation.opened" ||
        delivery.event_type.startsWith("confirmation.deadline_")
      ) {
        return confirmationTruth(db, userId, delivery.subject_id);
      }
      if (delivery.event_type === "jury.opened") {
        return juryTruth(db, userId, delivery.subject_id);
      }
      if (delivery.event_type === "televote.opened") {
        return televoteTruth(db, delivery.subject_id);
      }
      return { suppress: false, reason: null };
    },

    async suppressPendingDelivery(userId, deliveryId, reason) {
      const update = await db
        .from("notification_deliveries")
        .update({ status: "suppressed", error: reason.slice(0, 240) })
        .eq("id", deliveryId)
        .eq("user_id", userId)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (update.error) throw new Error(update.error.message);
      return Boolean(update.data?.id);
    },
  };
}

export async function reconcileActorPendingTaskNotificationsWithDependencies(
  userId: string,
  options: { limit?: number },
  dependencies: ActorNotificationReconciliationDependencies,
): Promise<ActorNotificationReconciliationResult> {
  const actor = ensureUserId(userId);
  const limit = boundedBatch(options.limit);
  const page = await dependencies.loadPendingTaskDeliveries(actor, limit);
  let suppressed = 0;
  let unchanged = 0;
  const failures: Array<{ deliveryId: string; message: string }> = [];

  // Sequential by design. Repairing one recipient must never create a service-
  // role fanout burst against voting, Confirmation, or notification state.
  for (const delivery of page.rows) {
    try {
      if (delivery.user_id !== actor) {
        failures.push({
          deliveryId: delivery.id,
          message: "Scoped loader returned a delivery owned by another actor.",
        });
        continue;
      }
      const truth = await dependencies.evaluateDeliveryTruth(actor, delivery);
      if (!truth.suppress) {
        unchanged += 1;
        continue;
      }
      const changed = await dependencies.suppressPendingDelivery(
        actor,
        delivery.id,
        truth.reason ?? "Canonical workflow state no longer permits this reminder.",
      );
      if (changed) suppressed += 1;
      else unchanged += 1;
    } catch (caught) {
      failures.push({ deliveryId: delivery.id, message: safeError(caught) });
    }
  }

  return {
    userId: actor,
    limit,
    totalPendingTaskDeliveries: page.total,
    scanned: page.rows.length,
    suppressed,
    unchanged,
    failed: failures.length,
    hasMore: page.total > page.rows.length,
    failures,
  };
}

export async function verifyActorPendingTaskNotificationsWithDependencies(
  userId: string,
  dependencies: Pick<
    ActorNotificationReconciliationDependencies,
    "loadPendingTaskDeliveries" | "evaluateDeliveryTruth"
  >,
): Promise<ActorNotificationVerificationResult> {
  const actor = ensureUserId(userId);
  const page = await dependencies.loadPendingTaskDeliveries(
    actor,
    V3_NOTIFICATION_RECONCILIATION_VERIFY_MAX_ROWS + 1,
  );

  if (page.total > V3_NOTIFICATION_RECONCILIATION_VERIFY_MAX_ROWS) {
    return {
      userId: actor,
      state: "unknown",
      reason: "verification_bound_exceeded",
      totalPendingTaskDeliveries: page.total,
      stalePendingDeliveryIds: [],
      verifiedAt: new Date().toISOString(),
    };
  }

  const stalePendingDeliveryIds: string[] = [];
  for (const delivery of page.rows) {
    if (delivery.user_id !== actor) {
      throw new Error("Scoped notification verifier received another actor's delivery.");
    }
    const truth = await dependencies.evaluateDeliveryTruth(actor, delivery);
    if (truth.suppress) stalePendingDeliveryIds.push(delivery.id);
  }

  return {
    userId: actor,
    state: stalePendingDeliveryIds.length ? "drift" : "consistent",
    reason: "verified",
    totalPendingTaskDeliveries: page.total,
    stalePendingDeliveryIds,
    verifiedAt: new Date().toISOString(),
  };
}

export async function reconcileActorPendingTaskNotificationsInternal(
  userId: string,
  options: { limit?: number } = {},
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return reconcileActorPendingTaskNotificationsWithDependencies(
    userId,
    options,
    createActorNotificationReconciliationDependencies(supabaseAdmin as any),
  );
}

export async function verifyActorPendingTaskNotificationsInternal(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const dependencies = createActorNotificationReconciliationDependencies(supabaseAdmin as any);
  return verifyActorPendingTaskNotificationsWithDependencies(userId, dependencies);
}
