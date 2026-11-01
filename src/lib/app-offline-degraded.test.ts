import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  clearOfflinePublicIndex,
  readOfflinePublicIndex,
  writeOfflinePublicIndex,
  type OfflinePublicIndex,
} from "./app-offline-snapshot";

function expectSanitizedPublicIndexShape(snapshot: OfflinePublicIndex) {
  expect(Object.keys(snapshot).sort()).toEqual(["countries", "editions", "savedAt", "shows"]);
  for (const item of [...snapshot.editions, ...snapshot.shows, ...snapshot.countries]) {
    expect(Object.keys(item).sort()).toEqual(["id", "label", "path"]);
  }
}

describe("installed app degraded public archive", () => {
  it("stores only a small sanitized public index rather than stale HTML or private state", () => {
    let value = "";
    const storage = {
      setItem: (_key: string, next: string) => { value = next; },
      getItem: () => value,
    };
    writeOfflinePublicIndex({
      editions: [{ id: "e1", name: "Email Ballot Showcase", slug: "edition", edition_number: 22 }],
      shows: [{ id: "s1", name: "Ballot Showcase" }],
      countries: [{ id: "c1", name: "Emailia", short_code: "EM" }],
    }, storage);
    const snapshot = readOfflinePublicIndex(storage);
    expect(snapshot?.editions[0]).toEqual({
      id: "e1",
      label: "SSC 22 · Email Ballot Showcase",
      path: "/editions/edition",
    });
    expect(snapshot?.shows[0]?.label).toBe("Ballot Showcase");
    expect(snapshot?.countries[0]?.label).toBe("Emailia");
    expect(snapshot).not.toBeNull();
    expectSanitizedPublicIndexShape(snapshot!);
  });

  it("keeps navigation HTML network-only while the offline fallback reads the safe index", () => {
    const worker = readFileSync("public/sw.js", "utf8");
    const offline = readFileSync("public/offline.html", "utf8");
    expect(worker).toContain("return await fetch(request)");
    expect(worker).not.toContain("cache.put(request, response.clone())\n    return response;\n  } catch");
    expect(offline).toContain("solaris:offline-public-index:v1");
    expect(offline).toContain("safe read-only mode");
    expect(offline).toContain("never queued without a live server acknowledgement");
  });

  it("shows exact local date, time and timezone alongside task countdowns", () => {
    const tasks = readFileSync("src/components/app/AppTaskCenter.tsx", "utf8");
    expect(tasks).toContain("Intl.DateTimeFormat().resolvedOptions().timeZone");
    expect(tasks).toContain('dateStyle: "medium"');
    expect(tasks).toContain("<time");
  });
  it("clears only the safe public offline index through the settings action", () => {
    const values = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string) => values.set(key, value),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    };

    writeOfflinePublicIndex({
      editions: [{ id: "e1", name: "Edition", slug: "edition", edition_number: 22 }],
      shows: [],
      countries: [],
    }, storage);
    values.set("solaris:confirmation-draft:test", "critical-local-draft");

    clearOfflinePublicIndex(storage);

    expect(readOfflinePublicIndex(storage)).toBeNull();
    expect(values.get("solaris:confirmation-draft:test")).toBe("critical-local-draft");
  });

});
