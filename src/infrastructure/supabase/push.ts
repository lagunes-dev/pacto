import type { PushStatus, PushSubscriptionPort } from "../../features/push/port";

type BrowserSubscription = {
  endpoint: string;
  toJSON(): { keys?: { p256dh?: string; auth?: string } };
  unsubscribe(): Promise<boolean>;
};

type PushBrowser = {
  notification?: {
    permission: NotificationPermission;
    requestPermission(): Promise<NotificationPermission>;
  };
  serviceWorker?: {
    ready: Promise<{ pushManager: {
      getSubscription(): Promise<BrowserSubscription | null>;
      subscribe(options: { userVisibleOnly: true; applicationServerKey: BufferSource }): Promise<BrowserSubscription>;
    } }>;
  };
  supportsPush: boolean;
};

type PushClient = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  from(table: "push_subscriptions"): {
    upsert(values: Record<string, string | null>, options: { onConflict: "endpoint" }): PromiseLike<{ error: unknown }>;
    update(values: { revoked_at: string }): { eq(column: "endpoint", value: string): PromiseLike<{ error: unknown }> };
  };
};

function browserDefaults(): PushBrowser {
  return {
    notification: typeof Notification === "undefined" ? undefined : Notification,
    serviceWorker: typeof navigator === "undefined" ? undefined : navigator.serviceWorker,
    supportsPush: typeof PushManager !== "undefined",
  };
}

function decodeApplicationServerKey(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const bytes = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const decoded = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) decoded[index] = bytes.charCodeAt(index);
  return decoded.buffer;
}

export function createSupabasePushPort(
  clientInput: unknown,
  publicKey: string,
  browser: PushBrowser = browserDefaults(),
): PushSubscriptionPort {
  const client = clientInput as PushClient;
  const supportStatus = (): PushStatus | null => {
    if (!browser.notification || !browser.serviceWorker || !browser.supportsPush) return "unsupported";
    if (browser.notification.permission === "denied") return "denied";
    if (!publicKey) return "unavailable";
    return null;
  };

  return {
    async status() {
      const fixedStatus = supportStatus();
      if (fixedStatus) return fixedStatus;
      if (browser.notification!.permission !== "granted") return "default";
      try {
        const registration = await browser.serviceWorker!.ready;
        return await registration.pushManager.getSubscription() ? "enabled" : "default";
      } catch {
        return "unavailable";
      }
    },

    async activate() {
      const fixedStatus = supportStatus();
      if (fixedStatus) return fixedStatus;
      try {
        const permission = await browser.notification!.requestPermission();
        if (permission !== "granted") return permission === "denied" ? "denied" : "default";

        const registration = await browser.serviceWorker!.ready;
        const existing = await registration.pushManager.getSubscription();
        const subscription = existing ?? await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(publicKey),
        });
        const keys = subscription.toJSON().keys;
        const { data, error: authError } = await client.auth.getUser();
        if (authError || !data.user || !keys?.p256dh || !keys.auth) {
          if (!existing) await subscription.unsubscribe();
          return "unavailable";
        }

        const { error } = await client.from("push_subscriptions").upsert({
          user_id: data.user.id,
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          revoked_at: null,
        }, { onConflict: "endpoint" });
        if (error) {
          if (!existing) await subscription.unsubscribe();
          return "unavailable";
        }
        return "enabled";
      } catch {
        return "unavailable";
      }
    },

    async revoke() {
      const fixedStatus = supportStatus();
      if (fixedStatus) return fixedStatus;
      try {
        const registration = await browser.serviceWorker!.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return "default";
        const { error } = await client.from("push_subscriptions")
          .update({ revoked_at: new Date().toISOString() })
          .eq("endpoint", subscription.endpoint);
        if (error) return "unavailable";
        await subscription.unsubscribe();
        return "default";
      } catch {
        return "unavailable";
      }
    },
  };
}
