import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { publicBroadcastHref } from "./v3-public-broadcast-url";

describe("Published show broadcast URL safety", () => {
  it("accepts absolute web broadcast links without rewriting their path", () => {
    expect(publicBroadcastHref("https://broadcast.example/watch/ssc21?live=1"))
      .toBe("https://broadcast.example/watch/ssc21?live=1");
    expect(publicBroadcastHref("http://broadcast.example/watch"))
      .toBe("http://broadcast.example/watch");
  });

  it("rejects active content, relative paths, credentials and invalid raw values", () => {
    for (const raw of [
      null, undefined, false, {}, "", " ", "/watch", "//broadcast.example/watch",
      "javascript:alert(1)", "data:text/html,hello", "file:///etc/passwd",
      "https://user:password@broadcast.example/stream",
      "https://broadcast.example/\nwatch", "https://broadcast.example/\\watch",
      "https://broadcast.example/ watch", "https://broadcast.example/" + "a".repeat(2050),
    ]) {
      expect(publicBroadcastHref(raw)).toBeNull();
    }
  });

  it("ensures public Show links use only sanitized broadcast URLs", () => {
    const show = readFileSync("src/components/v3/V3ShowsDiscoveryScreen.tsx", "utf8");
    expect(show).toContain("const broadcastHref = publicBroadcastHref(item.broadcastUrl)");
    expect(show).toContain("{broadcastHref ? (");
    expect(show).toContain("href={broadcastHref}");
    expect(show).toContain('rel="noopener noreferrer"');
    expect(show).not.toContain("href={item.broadcastUrl}");
    expect(show).toContain('allowsReleased("/editions")');
  });
});
