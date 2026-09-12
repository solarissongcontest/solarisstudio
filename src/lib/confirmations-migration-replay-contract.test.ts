import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = resolve(process.cwd(), "supabase/migrations");
const restoredName = "20260816200158_integrate_confirmations_schema.sql";
const pulseName = "20260821173000_national_final_pulse_events.sql";
const historicalName = "20260822142000_country_historical_national_finals.sql";
const nextInLineName = "20260822203000_historical_nf_next_in_line.sql";
const publicationName = "20260823002000_nf_publication_layers_and_result_order.sql";

const restored = readFileSync(resolve(migrations, restoredName), "utf8");
const pulse = readFileSync(resolve(migrations, pulseName), "utf8");
const historical = readFileSync(resolve(migrations, historicalName), "utf8");
const nextInLine = readFileSync(resolve(migrations, nextInLineName), "utf8");
const publication = readFileSync(resolve(migrations, publicationName), "utf8");

function tableDefinition(table: string, nextMarker: string) {
  const start = restored.indexOf(`create table if not exists public.${table}`);
  const end = restored.indexOf(nextMarker, start + 1);
  expect(start, `${table} should exist in the restored Confirmations foundation`).toBeGreaterThanOrEqual(0);
  expect(end, `${table} definition should have a stable end marker`).toBeGreaterThan(start);
  return restored.slice(start, end);
}

describe("Confirmations migration replay compatibility", () => {
  it("restores the missing production-ledger schema before national-final Pulse depends on it", () => {
    expect(restoredName.slice(0, 14) < pulseName.slice(0, 14)).toBe(true);
    expect(restored).toContain("create table if not exists public.submissions");
    expect(restored).toContain("create table if not exists public.national_finals");
    expect(restored).toContain("create table if not exists public.national_final_entries");
    expect(pulse).toContain("v_nf public.national_finals");
    expect(pulse).toContain("v_winner public.national_final_entries");
    expect(pulse).toContain("create trigger national_final_pulse");
    expect(pulse).toContain("create trigger national_final_entry_pulse");
  });

  it("keeps later national-final schema ownership in the later migrations", () => {
    const finals = tableDefinition(
      "national_finals",
      "create table if not exists public.national_final_entries",
    );
    const entries = tableDefinition("national_final_entries", "do $$");

    expect(finals).not.toContain("country_id");
    expect(finals).not.toContain("edition_id");
    expect(finals).not.toContain("nf_date");
    expect(finals).not.toContain("result_date");
    expect(finals).not.toContain("lineup_published");
    expect(finals).not.toContain("results_published");
    expect(entries).not.toContain("next_in_line");
    expect(entries).not.toContain("result_position");

    expect(historical).toContain("add column if not exists country_id");
    expect(historical).toContain("add column if not exists edition_id");
    expect(nextInLine).toContain("add column if not exists next_in_line");
    expect(publication).toContain("add column if not exists result_position");
    expect(publication).toContain("add column if not exists lineup_published");
    expect(publication).toContain("add column if not exists results_published");
  });

  it("enables RLS immediately on every restored public table", () => {
    const restoredTables = [
      "submission_rounds",
      "submissions",
      "internal_entries",
      "national_finals",
      "national_final_entries",
      "submission_versions",
      "submission_ip_history",
      "submission_drafts",
      "edit_tokens",
      "round_stats",
      "submission_browser_sessions",
      "submission_review_history",
      "next_in_line_submissions",
      "next_in_line_responses",
    ];

    for (const table of restoredTables) {
      expect(restored).toContain(`alter table public.${table} enable row level security;`);
    }
  });
});
