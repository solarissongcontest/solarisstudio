import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-production-head-upgrade-rehearsal.sh"),
  "utf8",
);

describe("S13 production-head-equivalent upgrade: disposable bootstrap recovery", () => {
  it("always tears down a partially started local stack, including on first-start failure", () => {
    expect(source).toContain("trap cleanup EXIT INT TERM");
    const started = source.indexOf('STARTED=true\nstartup_ok=false');
    const launch = source.indexOf("if supabase start; then", started);
    const cleanup = source.indexOf("supabase stop --no-backup", launch);
    expect(started).toBeGreaterThanOrEqual(0);
    expect(launch).toBeGreaterThan(started);
    expect(cleanup).toBeGreaterThan(launch);
    expect(source).toContain('if [[ "$STARTED" == true ]]');
    expect(source).toContain("restore_migrations || true");
  });

  it("permits only one local startup retry and fails closed without hosted fallback", () => {
    expect(source).toContain("for attempt in 1 2; do");
    expect(source).toContain("startup_ok=true");
    expect(source).toContain('if [[ "$attempt" == "1" ]]; then');
    expect(source).toContain("sleep 8");
    expect(source).toContain('[[ "$startup_ok" == true ]]');
    expect(source).toContain("Disposable local Supabase failed twice; no hosted fallback");
    expect(source).not.toContain("supabase start --linked");
    expect(source).not.toContain("supabase db reset --linked");
    expect(source).not.toContain("--db-url https://");
  });

  it("retains migration immutability, the local-only SQL upgrade and verified target head", () => {
    expect(source).toContain('baseline_fingerprint" == "$PRODUCTION_BASELINE_SHA256');
    expect(source).toContain("A migration at or before hosted production head was added or changed");
    expect(source).toContain("supabase db reset --local --no-seed");
    expect(source).toContain("supabase migration up --local --include-all");
    expect(source).toContain('[[ "$baseline_head" == "$PRODUCTION_HEAD" ]]');
    expect(source).toContain('[[ "$upgraded_head" == "$LATEST_HEAD" ]]');
    expect(source).toContain('[[ "$applied_delta" == "$expected_delta" ]]');
    expect(source).toContain("http://127.0.0.1:*");
    expect(source).toContain("postgres://postgres:postgres@127.0.0.1:*");
    expect(source).toContain("Refusing hosted Supabase rehearsal");
    expect(source).toContain("Refusing non-local database rehearsal");
  });
});
