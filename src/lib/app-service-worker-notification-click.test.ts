import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

const swSource = () => readFileSync("public/sw.js", "utf8");

type PushClient = {
  navigate?: (target: string) => Promise<PushClient | null>;
  focus?: () => Promise<unknown>;
};

type PushClients = {
  matchAll: (options: {
    type: "window";
    includeUncontrolled: boolean;
  }) => Promise<PushClient[]>;
  openWindow?: (target: string) => Promise<PushClient | null>;
};

type OpenOrFocusPushTarget = (target: string) => Promise<unknown>;

function loadOpenOrFocusPushTarget(clients: PushClients): OpenOrFocusPushTarget {
  const source = swSource();
  const start = source.indexOf("async function openOrFocusPushTarget");
  const end = source.indexOf(
    '\n\nself.addEventListener("notificationclick"',
    start,
  );

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  const functionSource = source.slice(start, end);
  const factory = new Function(
    "self",
    `${functionSource}; return openOrFocusPushTarget;`,
  ) as (scope: { clients: PushClients }) => OpenOrFocusPushTarget;

  return factory({ clients });
}

describe("PWA notification-click navigation lifetime", () => {
  it("keeps notificationclick waitUntil responsible for the deep-link task", () => {
    const source = swSource();
    const clickStart = source.indexOf(
      'self.addEventListener("notificationclick"',
    );
    const clickBlock = source.slice(clickStart);

    expect(clickStart).toBeGreaterThanOrEqual(0);
    expect(clickBlock).toContain("event.waitUntil(");
    expect(clickBlock).toContain("openOrFocusPushTarget(target)");
    expect(clickBlock).not.toContain("client.navigate?.(target)");
  });

  it("awaits existing-client navigation before focusing the navigated route", async () => {
    const target = "https://solaris.test/results#solaris-push-open";
    let resolveNavigate: (client: PushClient | null) => void = () => undefined;
    const staleFocus = vi.fn(async () => "stale-focused");
    const navigatedFocus = vi.fn(async () => "navigated-focused");
    const navigatedClient: PushClient = { focus: navigatedFocus };
    const navigate = vi.fn(
      () =>
        new Promise<PushClient | null>((resolve) => {
          resolveNavigate = resolve;
        }),
    );
    const openWindow = vi.fn(async () => null);
    const openOrFocus = loadOpenOrFocusPushTarget({
      matchAll: vi.fn(async () => [{ navigate, focus: staleFocus }]),
      openWindow,
    });

    const task = openOrFocus(target);
    await Promise.resolve();
    await Promise.resolve();

    expect(navigate).toHaveBeenCalledWith(target);
    expect(staleFocus).not.toHaveBeenCalled();
    expect(navigatedFocus).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();

    resolveNavigate(navigatedClient);

    await expect(task).resolves.toBe("navigated-focused");
    expect(navigatedFocus).toHaveBeenCalledTimes(1);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("falls back to opening the target when existing clients reject navigation", async () => {
    const target = "https://solaris.test/me#solaris-push-open";
    const staleFocus = vi.fn(async () => "wrong-route");
    const openedFocus = vi.fn(async () => "opened-focused");
    const openWindow = vi.fn(async () => ({ focus: openedFocus }));
    const openOrFocus = loadOpenOrFocusPushTarget({
      matchAll: vi.fn(async () => [
        {
          navigate: vi.fn(async () => {
            throw new Error("stale client");
          }),
          focus: staleFocus,
        },
      ]),
      openWindow,
    });

    await expect(openOrFocus(target)).resolves.toBe("opened-focused");
    expect(staleFocus).not.toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledWith(target);
    expect(openedFocus).toHaveBeenCalledTimes(1);
  });

  it("does not focus a wrong-route client that cannot navigate", async () => {
    const target = "https://solaris.test/participate#solaris-push-open";
    const staleFocus = vi.fn(async () => "wrong-route");
    const openedFocus = vi.fn(async () => "opened-focused");
    const openWindow = vi.fn(async () => ({ focus: openedFocus }));
    const openOrFocus = loadOpenOrFocusPushTarget({
      matchAll: vi.fn(async () => [{ focus: staleFocus }]),
      openWindow,
    });

    await expect(openOrFocus(target)).resolves.toBe("opened-focused");
    expect(staleFocus).not.toHaveBeenCalled();
    expect(openWindow).toHaveBeenCalledWith(target);
  });

  it("settles cleanly when platform policy rejects opening a window", async () => {
    const openOrFocus = loadOpenOrFocusPushTarget({
      matchAll: vi.fn(async () => []),
      openWindow: vi.fn(async () => {
        throw new Error("activation denied");
      }),
    });

    await expect(
      openOrFocus("https://solaris.test/#solaris-push-open"),
    ).resolves.toBeUndefined();
  });
});
