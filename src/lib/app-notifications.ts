import { supabase } from "@/integrations/supabase/client";

export type AppPushState = {
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
};

export type AppPushDeliveryMode =
  | "active"
  | "available"
  | "permission-denied"
  | "unsupported"
  | "unconfigured";

export type AppPushDeliveryStatus = {
  mode: AppPushDeliveryMode;
  title: string;
  description: string;
  requiredWorkAvailable: true;
};

/**
 * Push is delivery infrastructure, never canonical work state.
 *
 * Every returned state deliberately keeps requiredWorkAvailable=true so UI
 * cannot accidentally imply that disabling or losing push hides required
 * participant work. Tasks and Notices remain the authoritative in-app path.
 */
export function describeAppPushDelivery(
  state: AppPushState,
): AppPushDeliveryStatus {
  if (!state.configured) {
    return {
      mode: "unconfigured",
      title: "Push temporarily unavailable",
      description:
        "Solaris cannot deliver device alerts right now. Required tasks and notices still remain available inside Solaris.",
      requiredWorkAvailable: true,
    };
  }

  if (!state.supported) {
    return {
      mode: "unsupported",
      title: "Push is not supported here",
      description:
        "This browser cannot receive Solaris push alerts. Required tasks and notices still remain available inside Solaris.",
      requiredWorkAvailable: true,
    };
  }

  if (state.subscribed) {
    return {
      mode: "active",
      title: "Push is active",
      description:
        "This device is registered with Solaris for alerts. Required work still remains available inside Solaris even if delivery is delayed.",
      requiredWorkAvailable: true,
    };
  }

  if (state.permission === "denied") {
    return {
      mode: "permission-denied",
      title: "Push is blocked",
      description:
        "Your system blocks Solaris alerts on this device. Required tasks and notices still remain available inside Solaris.",
      requiredWorkAvailable: true,
    };
  }

  return {
    mode: "available",
    title: "Push is optional",
    description:
      "You can enable device alerts, but required tasks and notices remain available inside Solaris without push.",
    requiredWorkAvailable: true,
  };
}

let runtimeVapidKeyPromise: Promise<string> | null = null;

async function vapidPublicKey() {
  const buildTimeKey =
    (import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined)?.trim() ?? "";
  if (buildTimeKey) return buildTimeKey;

  if (!runtimeVapidKeyPromise) {
    runtimeVapidKeyPromise = (async () => {
      const { data, error } = await (supabase as any).rpc("solaris_web_push_public_key");
      if (error) {
        console.warn("[solaris-push] Public VAPID configuration could not be loaded", error);
        return "";
      }
      return typeof data === "string" ? data.trim() : "";
    })();
  }

  return runtimeVapidKeyPromise;
}

function base64UrlToBytes(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function serverHasSubscription(userId: string, endpoint: string) {
  const { data, error } = await (supabase as any)
    .from("app_push_subscriptions")
    .select("endpoint")
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .is("disabled_at", null)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.endpoint);
}

async function currentPushUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * `subscribed` means both the browser subscription and the current authenticated
 * user's RLS-protected Solaris registration exist. A browser-only or previous-
 * account subscription must never be presented as active Solaris delivery.
 *
 * Keep this zero-argument function compatible with React Query's queryFn slot.
 * Viewer identity is resolved from the authenticated Supabase session instead
 * of accepting React Query's QueryFunctionContext as if it were a user id.
 */
export async function getAppPushState(): Promise<AppPushState> {
  const key = await vapidPublicKey();
  if (!pushSupported()) {
    return {
      supported: false,
      configured: Boolean(key),
      permission: "unsupported",
      subscribed: false,
    };
  }
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  const resolvedUserId = subscription ? await currentPushUserId() : null;
  const subscribed =
    subscription && resolvedUserId
      ? await serverHasSubscription(resolvedUserId, subscription.endpoint)
      : false;
  return {
    supported: true,
    configured: Boolean(key),
    permission: Notification.permission,
    subscribed,
  };
}

async function storeSubscription(userId: string, subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const authSecret = json.keys?.auth;
  if (!json.endpoint || !p256dh || !authSecret) {
    throw new Error("The browser returned an incomplete push subscription.");
  }

  const { error } = await (supabase as any)
    .from("app_push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh,
        auth_secret: authSecret,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        disabled_at: null,
      },
      { onConflict: "user_id,endpoint" },
    );
  if (error) throw error;
}

export async function enableAppPush(userId: string) {
  if (!pushSupported()) throw new Error("Push notifications are not supported on this browser.");
  const key = await vapidPublicKey();
  if (!key) throw new Error("Push notifications are temporarily unavailable.");

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
  }

  const registration =
    (await navigator.serviceWorker.getRegistration("/")) ??
    (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToBytes(key) as BufferSource,
    }));

  try {
    await storeSubscription(userId, subscription);
  } catch (error) {
    // If Solaris could not register a brand-new browser subscription, remove it
    // again so a later state read cannot mistake browser-only state for active
    // Solaris delivery. Existing subscriptions are preserved for safe retry.
    if (!existing) {
      try {
        await subscription.unsubscribe();
      } catch {
        // Registration failure remains the authoritative error returned below.
      }
    }
    throw error;
  }
  return subscription;
}

export async function disableAppPush(userId: string) {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  const endpoint = subscription?.endpoint ?? null;

  // Disable server delivery first. If that fails, preserve the browser
  // subscription so the UI can truthfully report that delivery is still active.
  if (endpoint) {
    const { error } = await (supabase as any)
      .from("app_push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
    if (error) throw error;
  }

  // Once the server registration is gone, failure to remove the local browser
  // object cannot cause Solaris to deliver another notification.
  if (subscription) {
    try {
      await subscription.unsubscribe();
    } catch {
      // A future enable can reuse/re-register the browser object if it survives.
    }
  }
}

export async function refreshAppPushSubscription(userId: string) {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) await storeSubscription(userId, subscription);
}
