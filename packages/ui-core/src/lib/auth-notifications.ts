const AUTH_NOTIFICATION_CHANNEL = "kubernaut-console-auth-lifecycle";
const AUTH_NOTIFICATION_TYPE = "kubernaut-console-auth-changed";
const AUTH_NOTIFICATION_STORAGE_KEY = "kubernaut-console-auth-notification"; // pre-commit:allow-sensitive (storage key name)

type AuthNotification = {
  type: typeof AUTH_NOTIFICATION_TYPE;
  action?: "signout-started";
};
type NotificationCallback = (notification?: AuthNotification) => void;

function isAuthNotification(value: unknown): value is AuthNotification {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.type === AUTH_NOTIFICATION_TYPE &&
    (record.action === undefined || record.action === "signout-started");
}

/** Broadcasts only an opaque prompt to revalidate; it never carries auth data. */
export function notifyAuthLifecycleChanged(action: "revalidate" | "signout-started" = "revalidate"): void {
  const notification: AuthNotification = {
    type: AUTH_NOTIFICATION_TYPE,
    ...(action === "signout-started" ? { action } : {}),
  };
  try {
    if (typeof BroadcastChannel === "function") {
      const channel = new BroadcastChannel(AUTH_NOTIFICATION_CHANNEL);
      channel.postMessage(notification satisfies AuthNotification);
      channel.close();
      return;
    }
  } catch {
    // Fall through to the volatile storage-event transport.
  }

  try {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(AUTH_NOTIFICATION_STORAGE_KEY, JSON.stringify({ ...notification, nonce }));
    localStorage.removeItem(AUTH_NOTIFICATION_STORAGE_KEY);
  } catch {
    // A notification is advisory; the receiving tab still revalidates on its
    // next host-driven lifecycle event or navigation.
  }
}

/** Subscribes to opaque notifications; recipients must query the host again. */
export function subscribeAuthLifecycleNotifications(callback: NotificationCallback): () => void {
  let channel: BroadcastChannel | undefined;
  try {
    if (typeof BroadcastChannel === "function") {
      channel = new BroadcastChannel(AUTH_NOTIFICATION_CHANNEL);
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (isAuthNotification(event.data)) callback(event.data);
      };
    }
  } catch {
    channel?.close();
    channel = undefined;
  }

  const storageListener = (event: StorageEvent) => {
    if (event.key !== AUTH_NOTIFICATION_STORAGE_KEY || event.newValue === null) return;
    try {
      const parsed = JSON.parse(event.newValue) as unknown;
      callback(isAuthNotification(parsed) ? parsed : undefined);
    } catch {
      callback();
    }
  };
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("storage", storageListener);
  }

  return () => {
    channel?.close();
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      window.removeEventListener("storage", storageListener);
    }
  };
}
