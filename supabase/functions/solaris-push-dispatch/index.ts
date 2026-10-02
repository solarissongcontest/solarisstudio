import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type Delivery = {
  id: string;
  user_id: string;
  category: string;
  event_type: string;
  subject_id: string;
  route: string;
  title: string;
  body: string;
  dedupe_key: string;
};

type Preference = {
  external_enabled: boolean;
  categories: string[];
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  urgent_deadline_reminders: boolean;
  timezone: string | null;
};

type SubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function localMinutes(timeZone: string, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
    return hour * 60 + minute;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

function parseClock(value: string | null, fallback: number) {
  if (!value) return fallback;
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return fallback;
  }
  return hour * 60 + minute;
}

function inQuietHours(preference: Preference, now = new Date()) {
  const start = parseClock(preference.quiet_hours_start, 23 * 60);
  const end = parseClock(preference.quiet_hours_end, 8 * 60);
  if (start === end) return false;
  const current = localMinutes(preference.timezone || "UTC", now);
  return start < end
    ? current >= start && current < end
    : current >= start || current < end;
}

function isUrgentDelivery(delivery: Delivery) {
  return (
    /deadline_(?:3h|1h)$/.test(delivery.event_type) ||
    delivery.event_type === "organizer_task.critical"
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Push delivery service credentials are unavailable." }, 500);
  }

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: runtimeRows, error: runtimeError } = await service.rpc(
    "solaris_get_push_runtime_secrets",
  );
  if (runtimeError) {
    console.error("[solaris-push-dispatch] runtime configuration load failed", runtimeError);
  }

  const runtime =
    Array.isArray(runtimeRows) && runtimeRows.length
      ? (runtimeRows[0] as {
          dispatch_secret?: string | null;
          vapid_public_key?: string | null;
          vapid_private_key?: string | null;
          vapid_subject?: string | null;
        })
      : null;

  const dispatchSecret =
    Deno.env.get("SOLARIS_PUSH_DISPATCH_SECRET") ??
    runtime?.dispatch_secret ??
    "";
  const suppliedSecret = req.headers.get("x-solaris-push-secret") ?? "";
  if (!dispatchSecret || suppliedSecret !== dispatchSecret) {
    return json({ error: "Push dispatcher access denied." }, 401);
  }

  const vapidPublicKey =
    Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") ??
    runtime?.vapid_public_key ??
    "";
  const vapidPrivateKey =
    Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") ??
    runtime?.vapid_private_key ??
    "";
  const vapidSubject =
    Deno.env.get("WEB_PUSH_VAPID_SUBJECT") ??
    runtime?.vapid_subject ??
    "mailto:notifications@solaris-song-contest.workers.dev";

  if (!vapidPublicKey || !vapidPrivateKey) {
    return json({ error: "Push delivery is not fully configured." }, 500);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const { error: organizerTaskError } = await service.rpc(
    "solaris_prepare_organizer_task_delivery",
  );
  if (organizerTaskError) {
    console.error("[solaris-push-dispatch] Organizer Task reconciliation failed", organizerTaskError);
    return json({ error: "Organizer task notifications could not be prepared." }, 500);
  }

  const { data: enqueueCount, error: enqueueError } = await service.rpc(
    "solaris_enqueue_app_notifications",
    { p_now: new Date().toISOString() },
  );
  if (enqueueError) {
    console.error("[solaris-push-dispatch] enqueue failed", enqueueError);
    return json({ error: "Notification candidates could not be prepared." }, 500);
  }

  const { data: deliveries, error: deliveryError } = await service.rpc(
    "solaris_claim_pending_notification_deliveries",
    {
      p_now: new Date().toISOString(),
      p_limit: 100,
    },
  );

  if (deliveryError) return json({ error: "Pending notifications could not be claimed." }, 500);

  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  let deferred = 0;

  for (const delivery of (deliveries ?? []) as Delivery[]) {
    if (delivery.category === "organizer_tasks") {
      const { data: task, error: taskError } = await service
        .from("studio2_organizer_tasks")
        .select("state,resolved_at")
        .eq("id", delivery.subject_id)
        .maybeSingle();

      if (taskError) {
        console.error("[solaris-push-dispatch] Organizer Task lookup failed", delivery.id, taskError);
        await service
          .from("notification_deliveries")
          .update({
            status: "pending",
            processing_started_at: null,
            scheduled_for: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            error: "Organizer Task lookup failed; retry scheduled.",
          })
          .eq("id", delivery.id)
          .eq("status", "processing");
        continue;
      }

      if (!task || task.state === "resolved" || task.resolved_at) {
        await service
          .from("notification_deliveries")
          .update({
            status: "suppressed",
            processing_started_at: null,
            error: "Organizer Task resolved before delivery.",
          })
          .eq("id", delivery.id)
          .eq("status", "processing");
        suppressed += 1;
        continue;
      }
    }

    const { data: preferenceData, error: preferenceError } = await service
      .from("notification_preferences")
      .select("external_enabled,categories,quiet_hours_start,quiet_hours_end,urgent_deadline_reminders,timezone")
      .eq("profile_id", delivery.user_id)
      .maybeSingle();

    if (preferenceError) {
      console.error("[solaris-push-dispatch] preference load failed", delivery.id, preferenceError);
      await service
        .from("notification_deliveries")
        .update({
          status: "pending",
          processing_started_at: null,
          scheduled_for: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          error: "Preference lookup failed; retry scheduled.",
        })
        .eq("id", delivery.id)
        .eq("status", "processing");
      continue;
    }

    const preference = preferenceData as Preference | null;
    const categoryEnabled =
      delivery.category === "organizer_tasks" ||
      (Array.isArray(preference?.categories) &&
        preference.categories.includes(delivery.category));
    if (!preference?.external_enabled || !categoryEnabled) {
      await service
        .from("notification_deliveries")
        .update({
          status: "suppressed",
          processing_started_at: null,
          error: "Preference disabled",
        })
        .eq("id", delivery.id)
        .eq("status", "processing");
      suppressed += 1;
      continue;
    }

    if (
      inQuietHours(preference) &&
      !(preference.urgent_deadline_reminders && isUrgentDelivery(delivery))
    ) {
      await service
        .from("notification_deliveries")
        .update({
          status: "pending",
          processing_started_at: null,
          scheduled_for: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          error: null,
        })
        .eq("id", delivery.id)
        .eq("status", "processing");
      deferred += 1;
      continue;
    }

    const { data: subscriptions, error: subscriptionError } = await service
      .from("app_push_subscriptions")
      .select("id,endpoint,p256dh,auth_secret")
      .eq("user_id", delivery.user_id)
      .is("disabled_at", null);

    if (subscriptionError) {
      console.error("[solaris-push-dispatch] subscription load failed", delivery.id, subscriptionError);
      await service
        .from("notification_deliveries")
        .update({
          status: "pending",
          processing_started_at: null,
          scheduled_for: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          error: "Subscription lookup failed; retry scheduled.",
        })
        .eq("id", delivery.id)
        .eq("status", "processing");
      continue;
    }

    let delivered = false;
    let lastError = "No active push subscriptions";

    for (const subscription of (subscriptions ?? []) as SubscriptionRow[]) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth_secret,
            },
          },
          JSON.stringify({
            title: delivery.title,
            body: delivery.body,
            route: delivery.route,
            tag: delivery.dedupe_key,
            deliveryId: delivery.id,
          }),
          {
            TTL: 60 * 60 * 12,
            urgency: isUrgentDeadline(delivery) ? "high" : "normal",
          },
        );
        delivered = true;
      } catch (error) {
        const statusCode =
          typeof error === "object" && error && "statusCode" in error
            ? Number((error as { statusCode?: unknown }).statusCode)
            : 0;
        lastError = error instanceof Error ? error.message : "Push provider rejected the subscription";
        if (statusCode === 404 || statusCode === 410) {
          await service
            .from("app_push_subscriptions")
            .update({ disabled_at: new Date().toISOString() })
            .eq("id", subscription.id);
        } else {
          console.error("[solaris-push-dispatch] push failed", subscription.id, error);
        }
      }
    }

    if (delivered) {
      await service
        .from("notification_deliveries")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          processing_started_at: null,
          error: null,
        })
        .eq("id", delivery.id)
        .eq("status", "processing");
      sent += 1;
    } else {
      await service
        .from("notification_deliveries")
        .update({
          status: "failed",
          processing_started_at: null,
          error: lastError.slice(0, 500),
        })
        .eq("id", delivery.id)
        .eq("status", "processing");
      failed += 1;
    }
  }

  return json({
    ok: true,
    enqueued: Number(enqueueCount ?? 0),
    examined: (deliveries ?? []).length,
    sent,
    failed,
    suppressed,
    deferred,
  });
});
