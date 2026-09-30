import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  clearOfflinePublicIndex,
  readOfflinePublicIndex,
  writeOfflinePublicIndex,
} from "./app-offline-snapshot";

describe("installed app degraded public archive", () => {
  it("stores only a small sanitized public index rather than stale HTML or private state", () => {
    let value = "";
    const storage = {
      setItem: (_key: string, next: string) => { value = next; },
      getItem: () => value,
    };
    writeOfflinePublicIndex({
      editions: [{ id: "e1", name: "Edition", slug: "edition", edition_number: 22 }],
      shows: [{ id: "s1", name: "Grand Final" }],
      countries: [{ id: "c1", name: "Oland", short_code: "OL" }],
    }, storage);
    const snapshot = readOfflinePublicIndex(storage);
    expect(snapshot?.editions[0]).toEqual({
      id: "e1",
      label: "SSC 22 · Edition",
      path: "/editions/edition",
    });
    expect(JSON.stringify(snapshot)).not.toContain("email");
    expect(JSON.stringify(snapshot)).not.toContain("ballot");
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
