import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20261016065000_v3_s8_next_in_line_protection.sql",
);
const client = source("src/lib/confirmation-next-in-line.functions.ts");
const rehearsal = source(
  ".github/scripts/v3-s8-next-in-line-protection-rehearsal.sh",
);
const workflow = source(
  ".github/workflows/v3-s8-next-in-line-protection-rehearsal.yml",
);

describe("System V3 S8 Next in Line protection", () => {
  it("enforces the existing public client field ceilings on the server", () => {
    expect(client).toContain("country: z.string().trim().min(1).max(80)");
    expect(client).toContain("artist: z.string().trim().max(160)");
    expect(client).toContain("song_title: z.string().trim().max(160)");
    expect(client).toContain("song_url: z.string().trim().max(500)");
    expect(client).toContain("preview_start: z.string().trim().max(10)");
    expect(client).toContain("preview_end: z.string().trim().max(10)");

    expect(migration).toContain("length(v_country) > 80");
    expect(migration).toContain("length(v_artist) > 160");
    expect(migration).toContain("length(v_song) > 160");
    expect(migration).toContain("length(v_url) > 500");
    expect(migration).toContain("length(v_preview_start) > 10");
    expect(migration).toContain("length(v_preview_end) > 10");
  });

  it("rejects payload expansion outside the canonical request contract", () => {
    expect(migration).toContain("payload - array[");
    expect(migration).toContain("Next in Line payload contains unsupported fields");
    expect(rehearsal).toContain("unknown payload key");
  });

  it("makes edition/source identity unique and keeps the existing advisory lock", () => {
    expect(migration).toContain("next_in_line_submissions_edition_source_v3_uidx");
    expect(migration).toContain("on public.next_in_line_submissions (edition_id, source_submission_id)");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(rehearsal).toContain("Concurrent first-write retries collapse to one canonical row");
  });

  it("turns identical network retries into no-op replays", () => {
    expect(migration).toContain("v_existing.selection_type is not distinct from v_selection_type");
    expect(migration).toContain("'replayed', true");
    expect(migration).toContain("'submitted_at', v_existing.submitted_at");
    expect(rehearsal).toContain("replay rewrote submitted_at");
    expect(rehearsal).toContain("changed semantic request intentionally updates the same canonical row");
  });

  it("backs browser validation with validated database constraints", () => {
    for (const name of [
      "country",
      "artist",
      "song",
      "url",
      "preview_start",
      "preview_end",
    ]) {
      expect(migration).toContain(`next_in_line_submissions_${name}_length_v3_check`);
      expect(migration).toContain(
        `validate constraint next_in_line_submissions_${name}_length_v3_check`,
      );
    }
    expect(rehearsal).toContain("direct over-limit update rejected");
  });

  it("keeps all automated database traffic on isolated local Supabase", () => {
    expect(rehearsal).toContain('http://127.0.0.1:*|http://localhost:*');
    expect(rehearsal).toContain("Refusing hosted Supabase rehearsal");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase migration up --local --include-all");
    expect(workflow).not.toContain("supabase.co");
  });
});
