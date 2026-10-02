import { supabase } from "@/integrations/supabase/client";

export type AppPushState = {
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
};

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
  return {
    supported: true,
    configured: Boolean(key),
    permission: Notification.permission,
    subscribed: Boolean(subscription),
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

  await storeSubscription(userId, subscription);
  return subscription;
}

export async function disableAppPush(userId: string) {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  const endpoint = subscription?.endpoint ?? null;

  if (subscription) await subscription.unsubscribe();

  if (endpoint) {
    const { error } = await (supabase as any)
      .from("app_push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
    if (error) throw error;
  }
}

export async function refreshAppPushSubscription(userId: string) {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) await storeSubscription(userId, subscription);
}
