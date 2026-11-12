import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyAuthLifecycleChanged, subscribeAuthLifecycleNotifications } from "./auth-notifications";

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  static throwOnPost = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  readonly posted: unknown[] = [];

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(message: unknown): void {
    if (FakeBroadcastChannel.throwOnPost) throw new Error("BroadcastChannel unavailable");
    this.posted.push(message);
  }

  close(): void {
    this.onmessage = null;
  }

  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe("cross-tab authentication notifications", () => {
  afterEach(() => {
    FakeBroadcastChannel.instances = [];
    FakeBroadcastChannel.throwOnPost = false;
    vi.unstubAllGlobals();
  });

  it("UT-CONSOLE-168-026: sends only an opaque lifecycle event", () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);

    notifyAuthLifecycleChanged();

    expect(FakeBroadcastChannel.instances).toHaveLength(1);
    expect(FakeBroadcastChannel.instances[0].posted).toEqual([
      { type: "kubernaut-console-auth-changed" },
    ]);
  });

  it("UT-CONSOLE-168-027: recipients trigger host revalidation without trusting payload fields", () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const revalidate = vi.fn();
    const unsubscribe = subscribeAuthLifecycleNotifications(revalidate);

    FakeBroadcastChannel.instances[0].emit({
      type: "kubernaut-console-auth-changed",
      iss: "attacker-issuer",
      sub: "attacker-subject",
      sid: "attacker-session",
      token: "browser-bearer",
    });

    expect(revalidate).toHaveBeenCalledOnce();
    unsubscribe();
    FakeBroadcastChannel.instances[0].emit({ type: "kubernaut-console-auth-changed" });
    expect(revalidate).toHaveBeenCalledOnce();
  });

  it("UT-CONSOLE-168-040: sign-out notifications carry only an opaque action", () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);

    notifyAuthLifecycleChanged("signout-started");

    expect(FakeBroadcastChannel.instances[0].posted).toEqual([
      { type: "kubernaut-console-auth-changed", action: "signout-started" },
    ]);
  });

  it("UT-CONSOLE-168-041: storage fallback remains active beside BroadcastChannel", () => {
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const revalidate = vi.fn();
    const unsubscribe = subscribeAuthLifecycleNotifications(revalidate);

    window.dispatchEvent(new StorageEvent("storage", {
      key: "kubernaut-console-auth-notification",
      newValue: JSON.stringify({ type: "kubernaut-console-auth-changed", action: "signout-started" }),
    }));

    expect(revalidate).toHaveBeenCalledWith({
      type: "kubernaut-console-auth-changed",
      action: "signout-started",
    });
    unsubscribe();
  });
});
