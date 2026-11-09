const AUTH_NOTIFICATION_CHANNEL = "kubernaut-console-auth-lifecycle";
const AUTH_NOTIFICATION_TYPE = "kubernaut-console-auth-changed";
const AUTH_NOTIFICATION_STORAGE_KEY = "kubernaut-console-auth-notification"; // pre-commit:allow-sensitive (storage key name)

type AuthNotification = { type: typeof AUTH_NOTIFICATION_TYPE };
type NotificationCallback = () => void;

function isAuthNotification(value: unknown): value is AuthNotification {
  return Boolean(value && typeof value === "object" && (value as Record<string, unknown>).type === AUTH_NOTIFICATION_TYPE);
}

/** Broadcasts only an opaque prompt to revalidate; it never carries auth data. */
export function notifyAuthLifecycleChanged(): void {
  try {
    if (typeof BroadcastChannel === "function") {
      const channel = new BroadcastChannel(AUTH_NOTIFICATION_CHANNEL);
      channel.postMessage({ type: AUTH_NOTIFICATION_TYPE } satisfies AuthNotification);
      channel.close();
      return;
    }
  } catch {
    // Fall through to the volatile storage-event transport.
  }

  try {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(AUTH_NOTIFICATION_STORAGE_KEY, nonce);
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
        if (isAuthNotification(event.data)) callback();
      };
    }
  } catch {
    channel?.close();
    channel = undefined;
  }

  const storageListener = (event: StorageEvent) => {
    if (event.key === AUTH_NOTIFICATION_STORAGE_KEY && event.newValue !== null) callback();
  };
  if (!channel && typeof window !== "undefined") {
    window.addEventListener("storage", storageListener);
  }

  return () => {
    channel?.close();
    if (!channel && typeof window !== "undefined") {
      window.removeEventListener("storage", storageListener);
    }
  };
}
