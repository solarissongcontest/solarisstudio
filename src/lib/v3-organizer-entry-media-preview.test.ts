import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveOrganizerEntryMediaPreview } from "./v3-organizer-entry-media-preview";

describe("Organizer Entry Review opt-in media inspection", () => {
  it("recognizes direct audio for a song without contacting the source", () => {
    const url = "https://cdn.example.test/audio/entry.MP3?token=secret&expires=42";
    expect(resolveOrganizerEntryMediaPreview(url, "song")).toEqual({
      url, host: "cdn.example.test", kind: "audio",
    });
  });

  it("supports browser-native direct video for songs and replacement videos", () => {
    for (const role of ["song", "replacement_video"] as const) {
      expect(resolveOrganizerEntryMediaPreview(
        "https://cdn.example.test/recording.webm", role,
      )?.kind).toBe("video");
    }
  });

  it("does not pretend a normal YouTube/watch link is an embeddable direct video", () => {
    expect(resolveOrganizerEntryMediaPreview(
      "https://youtube.example.test/watch?v=123", "song",
    )).toBeNull();
    expect(resolveOrganizerEntryMediaPreview(
      "https://cdn.example.test/file?download=entry.mp4", "replacement_video",
    )).toBeNull();
  });

  it("rejects an audio source as replacement video even when directly playable", () => {
    expect(resolveOrganizerEntryMediaPreview(
      "https://cdn.example.test/entry.mp3", "replacement_video",
    )).toBeNull();
  });

  it("never previews unsupported pages or image/svg/script source content", () => {
    for (const url of [
      "https://cdn.example.test/artist.png", "https://cdn.example.test/embedded.svg",
      "https://cdn.example.test/file.pdf", "https://cdn.example.test/playlist.m3u8",
      "javascript:alert(1)", "data:video/mp4;base64,AAAA", "blob:https://example.test/id",
    ]) {
      expect(resolveOrganizerEntryMediaPreview(url, "song")).toBeNull();
    }
  });

  it("rejects malformed, relative, credentialed and control-character URL forms", () => {
    for (const url of [
      "/song.mp3", "//example.test/song.mp3", "not a URL",
      "https://user:secret@cdn.example.test/entry.mp3",
      "https://cdn.example.test/dir/\n@attacker.test/x.mp3",
      "\thttps://cdn.example.test/entry.mp3",
    ]) {
      expect(resolveOrganizerEntryMediaPreview(url, "song")).toBeNull();
    }
  });

  it("never loads an inline source until deliberately requested", () => {
    const code = readFileSync(resolve(process.cwd(),
      "src/components/admin/OrganizerEntryMediaPreview.tsx"), "utf8");
    expect(code).toContain("const [loadRequested, setLoadRequested] = useState(false)");
    expect(code).toContain("!loadRequested ? (");
    expect(code).toContain("onClick={() => setLoadRequested(true)}");
    expect(code).toContain("onClick={() => setLoadRequested(false)}");
    expect(code).toContain('preload="none"');
    expect(code).not.toContain("autoPlay");
    expect(code).not.toContain("<iframe");
  });

  it("shows media only while the exact review sheet is open", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses/$id.tsx"), "utf8");
    expect(route).toContain("{open && editionId ? (");
    expect(route).toContain("<OrganizerEntryMediaPreview");
    expect(route).toContain("entry.current_version_id ?? \"unbound\"");
    expect(route).toContain("entry.song_url ?? \"no-song\"");
    expect(route).toContain("entry.replacement_video_url ?? \"no-video\"");
  });
});
