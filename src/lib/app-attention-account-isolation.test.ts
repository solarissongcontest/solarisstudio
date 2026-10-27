import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { ModuleKind, transpileModule } from "typescript";
import { describe, expect, it } from "vitest";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() {
    return this.values.size;
  }
  clear() {
    this.values.clear();
  }
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
type Summary = { participate: number; me: number; osBadge: number; updatedAt: string };
type AttentionModule = {
  readAppAttentionSummary(storage: Storage | null | undefined, viewerId?: string | null): Summary;
  writeAppAttentionSummary(
    patch: Partial<Summary>,
    storage?: Storage | null,
    viewerId?: string | null,
  ): Summary;
  resetAppAttentionSummary(viewerId: string | null, storage?: Storage | null): Summary;
  useAppAttentionSummary(): Summary;
};

/** Execute the production storage, event handlers and hook with deterministic
 * React dependency timing and the existing fan-session identity contract.
 * There are no SDK credentials, database clients or network bindings. */
function fixture() {
  const storage = new MemoryStorage();
  const badges: number[] = [];
  let storageBlocked = false;
  const listeners = new Map<
    string,
    Set<(event: { type: string; detail?: unknown; key?: string | null }) => void>
  >();
  const dispatch = (type: string, detail?: unknown) => {
    for (const callback of listeners.get(type) ?? []) callback({ type, detail });
  };
  let session: { data: { id: string } | null; isSuccess: boolean } = {
    data: null,
    isSuccess: false,
  };
  let state: unknown;
  let hasState = false;
  let previousDependencies = "";
  let cleanup: (() => void) | undefined;
  let pendingEffect: (() => void | (() => void)) | undefined;
  const module = {} as AttentionModule;
  const source = readFileSync("src/lib/app-attention.ts", "utf8").replace(
    /^import[\s\S]*?;\n/gm,
    "",
  );
  runInNewContext(
    transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText,
    {
      exports: module,
      useFanSession: () => session,
      useState<T>(initial: T | (() => T)) {
        if (!hasState) {
          state = typeof initial === "function" ? (initial as () => T)() : initial;
          hasState = true;
        }
        return [
          state as T,
          (value: T) => {
            state = value;
          },
        ];
      },
      useEffect(effect: () => void | (() => void), dependencies: unknown[] = []) {
        const next = JSON.stringify(dependencies);
        if (next !== previousDependencies) {
          previousDependencies = next;
          pendingEffect = effect;
        }
      },
      setSolarisAppBadge: async (count: number) => {
        badges.push(count);
      },
      CustomEvent: class {
        constructor(
          public type: string,
          public options: { detail: unknown },
        ) {}
        get detail() {
          return this.options.detail;
        }
      },
      window: {
        get localStorage() {
          if (storageBlocked) throw new Error("Storage access blocked");
          return storage;
        },
        addEventListener(
          type: string,
          callback: (event: { type: string; detail?: unknown }) => void,
        ) {
          const group = listeners.get(type) ?? new Set();
          group.add(callback);
          listeners.set(type, group);
        },
        removeEventListener(
          type: string,
          callback: (event: { type: string; detail?: unknown }) => void,
        ) {
          listeners.get(type)?.delete(callback);
        },
        dispatchEvent(event: { type: string; detail: unknown }) {
          dispatch(event.type, event.detail);
        },
      },
    },
  );
  return {
    module,
    storage,
    badges,
    dispatch,
    blockStorage() {
      storageBlocked = true;
    },
    render(viewerId: string | null, ready = true) {
      session = { data: viewerId ? { id: viewerId } : null, isSuccess: ready };
      const result = module.useAppAttentionSummary();
      if (pendingEffect) {
        cleanup?.();
        cleanup = pendingEffect() ?? undefined;
        pendingEffect = undefined;
      }
      return result;
    },
  };
}

describe("actor-isolated app attention enhancement", () => {
  it("never recovers an unowned legacy summary into another viewer or anonymous state", () => {
    const f = fixture();
    f.storage.setItem(
      "solaris:app-attention:v1",
      JSON.stringify({ participate: 8, me: 7, osBadge: 7 }),
    );
    expect(f.module.readAppAttentionSummary(f.storage, "B")).toMatchObject({
      participate: 0,
      me: 0,
      osBadge: 0,
    });
    expect(f.module.readAppAttentionSummary(f.storage, null)).toMatchObject({
      participate: 0,
      me: 0,
      osBadge: 0,
    });
  });

  it("namespaces actual writer output by actor rather than sharing A's counts with B", () => {
    const f = fixture();
    f.module.writeAppAttentionSummary({ participate: 8, me: 7, osBadge: 7 }, f.storage, "A");
    expect(f.module.readAppAttentionSummary(f.storage, "A").me).toBe(7);
    expect(f.module.readAppAttentionSummary(f.storage, "B").me).toBe(0);
    expect(f.module.readAppAttentionSummary(f.storage, null).me).toBe(0);
  });

  it("renders zero until existing fan-session identity resolves instead of flashing persisted private counts", () => {
    const f = fixture();
    f.storage.setItem(
      "solaris:app-attention:v1",
      JSON.stringify({ participate: 8, me: 7, osBadge: 7 }),
    );
    expect(f.render(null, false)).toMatchObject({ participate: 0, me: 0, osBadge: 0 });
  });
  it("isolates A→B before effects, ignores late A writes/events, and clears the OS badge on sign-out", () => {
    const f = fixture();
    f.module.resetAppAttentionSummary("A", f.storage);
    f.module.writeAppAttentionSummary({ participate: 8, me: 7, osBadge: 7 }, f.storage, "A");
    expect(f.render("A").me).toBe(0);
    expect(f.render("A").me).toBe(7);

    f.module.resetAppAttentionSummary("B", f.storage);
    expect(f.badges.at(-1)).toBe(0);
    expect(f.render("B").me).toBe(0);
    f.module.writeAppAttentionSummary({ participate: 2, me: 3, osBadge: 3 }, f.storage, "B");
    expect(f.render("B").me).toBe(3);
    const beforeLateA = f.badges.length;
    f.module.writeAppAttentionSummary({ participate: 19, me: 19, osBadge: 19 }, f.storage, "A");
    expect(f.render("B").me).toBe(3);
    expect(f.badges.slice(beforeLateA)).toEqual([]);

    f.dispatch("solaris:app-attention-changed", { viewerId: "A", me: 88, osBadge: 88 });
    expect(f.render("B").me).toBe(3);
    f.dispatch("solaris:app-attention-changed", { viewerId: "B", me: 99, summary: { me: 99 } });
    expect(f.render("B").me).toBe(3);
    expect(f.badges.at(-1)).toBe(3);

    f.module.resetAppAttentionSummary(null, f.storage);
    expect(f.badges.at(-1)).toBe(0);
    expect(f.render(null)).toMatchObject({ participate: 0, me: 0, osBadge: 0 });
    const beforeSignedOutWriter = f.badges.length;
    f.module.writeAppAttentionSummary({ me: 90, osBadge: 90 }, f.storage, "B");
    expect(f.render(null).me).toBe(0);
    expect(f.badges.slice(beforeSignedOutWriter)).toEqual([]);
  });

  it("does not expose stored counts when identity becomes unresolved, and never accepts anonymous writes", () => {
    const f = fixture();
    f.module.resetAppAttentionSummary("A", f.storage);
    f.module.writeAppAttentionSummary({ me: 7, osBadge: 7 }, f.storage, "A");
    f.render("A");
    expect(f.render("A").me).toBe(7);
    expect(f.render("A", false).me).toBe(0);
    expect(f.module.writeAppAttentionSummary({ me: 50, osBadge: 50 }, f.storage, null).me).toBe(0);
    f.storage.setItem("solaris:app-attention:v1", JSON.stringify({ me: 99 }));
    f.module.resetAppAttentionSummary(null, f.storage);
    expect(f.storage.getItem("solaris:app-attention:v1")).toBeNull();
    expect(f.module.readAppAttentionSummary(f.storage, null).me).toBe(0);
  });
  it("clears the OS badge and publishes auth safely even when the storage getter is blocked", () => {
    const f = fixture();
    f.module.resetAppAttentionSummary("A", f.storage);
    f.module.writeAppAttentionSummary({ me: 7, osBadge: 7 }, f.storage, "A");
    expect(f.badges.at(-1)).toBe(7);
    f.blockStorage();
    expect(() => f.module.resetAppAttentionSummary(null)).not.toThrow();
    expect(f.badges.at(-1)).toBe(0);
    expect(f.module.readAppAttentionSummary(undefined, "A").me).toBe(0);
    expect(f.module.writeAppAttentionSummary({ me: 9, osBadge: 9 }, undefined, "A").me).toBe(0);
    expect(f.render(null).me).toBe(0);
    f.module.resetAppAttentionSummary("B", null);
    expect(f.badges.at(-1)).toBe(0);
    const beforeLateWriter = f.badges.length;
    f.module.writeAppAttentionSummary({ me: 88, osBadge: 88 }, f.storage, "A");
    expect(f.badges.slice(beforeLateWriter)).toEqual([]);
    f.module.resetAppAttentionSummary(null, null);
    expect(f.badges.at(-1)).toBe(0);
  });
});
