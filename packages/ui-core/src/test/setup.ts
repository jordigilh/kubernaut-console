import "@testing-library/jest-dom/vitest";

// Node 22+'s built-in `localStorage` global (gated behind `--localstorage-file`,
// which nothing in this repo sets) shadows jsdom's real Storage implementation
// with a broken stub missing setItem/clear/etc. Replace it with a proper
// in-memory implementation so lib/preferences.ts and friends are testable.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return [...this.store.keys()][index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}
for (const target of [globalThis, window] as const) {
  Object.defineProperty(target, "localStorage", { value: new MemoryStorage(), writable: true, configurable: true });
}

HTMLDialogElement.prototype.showModal = HTMLDialogElement.prototype.showModal || function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = HTMLDialogElement.prototype.close || function (this: HTMLDialogElement) {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
};
