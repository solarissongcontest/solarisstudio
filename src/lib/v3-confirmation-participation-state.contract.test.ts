import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildParticipationTasks } from "./participation-os";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = () =>
  read("supabase/migrations/20261012015000_v3_confirmation_participation_state.sql");

const response = (input: {
  id: string;
  participating: boolean;
  updatedAt: string;
  roundName?: string;
}) => ({
  submission_id: input.id,
  round_id: `round-${input.id}`,
  round_name: input.roundName ?? `Round ${input.id}`,
  edition_id: "edition-22",
  edition_name: "SSC 22",
  edition_number: 22,
  country: "Oland",
  participating: input.participating,
  submitted_at: input.updatedAt,
  updated_at: input.updatedAt,
  can_edit: false,
  reason: "editing_closed",
});

const satisfiedRequirement = {
  id: "requirement-1",
  edition_id: "edition-22",
  country_id: "oland",
  generation: 1,
  status: "satisfied" as const,
  reason: "Edition confirmation required by TSBC",
  valid_from: "2026-09-20T12:00:00.000Z",
  resolved_by_submission_id: "submission-withdrawn",
  resolved_at: "2026-09-29T18:01:00.000Z",
  created_at: "2026-09-20T12:00:00.000Z",
};

describe("V3 Confirmation participation-state projection", () => {
  it("projects participating from canonical submissions without weakening the read RPC", () => {
    const sql = migration();
    const client = read("src/lib/confirmation-country-account.ts");

    expect(sql).toContain("'participating', s.participating");
    expect(sql).toContain("language plpgsql\nstable\nsecurity definer");
    expect(sql).toContain(
      "grant execute on function public.public_country_account_confirmation_access() to authenticated, service_role;",
    );
    expect(sql).toContain("anon must not execute public_country_account_confirmation_access");
    expect(sql).toContain("public_country_account_confirmation_access must remain STABLE");
    expect(client).toContain("participating?: boolean | null;");
  });

  it("uses the response that actually satisfied the requirement, not a later sibling response", () => {
    const tasks = buildParticipationTasks({
      editionId: "edition-22",
      responses: [
        response({
          id: "submission-withdrawn",
          participating: false,
          updatedAt: "2026-09-29T18:01:00.000Z",
          roundName: "Confirmation wave",
        }),
        response({
          id: "submission-later",
          participating: true,
          updatedAt: "2026-10-01T18:01:00.000Z",
          roundName: "Later sibling wave",
        }),
      ],
      requirements: [satisfiedRequirement],
      rounds: [],
      now: new Date("2026-10-02T18:00:00.000Z").getTime(),
    });

    expect(tasks[0]).toMatchObject({
      id: "confirmation:edition-22:g1",
      title: "Not participating",
      state: "completed",
      actionRequired: false,
      blocking: false,
    });
    expect(tasks[0]?.description).toContain("not participating");
    expect(tasks[0]?.why).toContain("Confirmation wave");
    expect(tasks[0]?.why).not.toContain("Later sibling wave");
  });

  it("keeps legacy response-only completion truthful when no requirement record exists", () => {
    const tasks = buildParticipationTasks({
      editionId: "edition-22",
      responses: [
        response({
          id: "legacy-withdrawn",
          participating: false,
          updatedAt: "2026-09-20T12:00:00.000Z",
        }),
      ],
      requirements: [],
      rounds: [],
    });

    expect(tasks[0]).toMatchObject({
      id: "confirmation:edition-22",
      title: "Not participating",
      state: "completed",
      actionRequired: false,
    });
  });
});
