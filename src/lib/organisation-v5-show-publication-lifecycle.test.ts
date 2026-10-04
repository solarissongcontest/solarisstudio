import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organisation OS V5 show publication lifecycle", () => {
  const migration = source(
    "supabase/migrations/20261003203000_organisation_os_v5_show_publication_lifecycle.sql",
  );
  const client = source("src/lib/show-publication-lifecycle.ts");
  const publication = source("src/routes/_authenticated/admin/publication/$slug.tsx");
  const shows = source("src/routes/_authenticated/admin/shows/$slug.tsx");
  const editions = source("src/routes/_authenticated/admin/editions.tsx");

  it("models Draft, Scheduled, Public and Hidden as canonical server state", () => {
    expect(migration).toContain("studio2_show_publication_controls");
    expect(migration).toContain(
      "check (state in ('draft', 'scheduled', 'public', 'hidden'))",
    );
    expect(migration).toContain("studio2_show_publication_transition_allowed");
    expect(migration).toContain(
      "when 'draft' then p_to in ('scheduled', 'public')",
    );
    expect(migration).toContain(
      "when 'scheduled' then p_to in ('draft', 'public', 'hidden')",
    );
    expect(migration).toContain(
      "when 'public' then p_to in ('scheduled', 'hidden')",
    );
    expect(migration).toContain(
      "when 'hidden' then p_to in ('draft', 'scheduled', 'public')",
    );
  });

  it("freezes scheduled publication intent and revalidates it at execution", () => {
    expect(migration).toContain("frozen_config");
    expect(migration).toContain("source_show_updated_at");
    expect(migration).toContain("source_result_version");
    expect(migration).toContain("scheduled_by");
    expect(migration).toContain("permissionStillValid");
    expect(migration).toContain("platformAllowsPublication");
    expect(migration).toContain("integrityClear");
    expect(migration).toContain("resultVersionMatches");
    expect(migration).toContain("resultReleaseReady");
    expect(migration).toContain("studio2_show_publication_executions");
    expect(migration).toContain("'blocked'");
  });

  it("creates canonical Organizer work instead of publishing stale scheduled intent", () => {
    expect(migration).toContain("source_kind");
    expect(migration).toContain("'publication_schedule'");
    expect(migration).toContain("studio2_organizer_tasks");
    expect(migration).toContain("studio2_sync_task_notifications");
    expect(migration).toContain(
      "The current platform operational mode blocks publication.",
    );
    expect(migration).toContain(
      "The exact scheduled result version is no longer reviewed, locked and reveal ready.",
    );
  });

  it("uses preview, optimistic concurrency, idempotency and fresh auth for R3 outcomes", () => {
    expect(migration).toContain("studio2_show_publication_change_preview");
    expect(migration).toContain("studio2_apply_show_publication_change");
    expect(migration).toContain("p_expected_version bigint");
    expect(migration).toContain("using errcode = '40001'");
    expect(migration).toContain("private.studio2_claim_operation");
    expect(migration).toContain("'publication.show.change'");
    expect(migration).toContain("private.studio2_require_fresh_auth(300)");
    expect(client).toContain("reauthenticateShowPublicationR3");
    expect(client).toContain("supabase.auth.signInWithPassword");
    expect(client).toContain("operationId: input.operationId");
    expect(client).toContain("idempotencyKey: input.idempotencyKey");
  });

  it("closes browser visibility/config writes and routes all Organizer surfaces through the lifecycle", () => {
    expect(migration).toContain(
      "Show publication must use the Organisation OS V5 publication operation contract.",
    );
    expect(migration).toContain(
      "before update of published, publication_config",
    );

    expect(publication).toContain("previewShowPublicationChange");
    expect(publication).toContain("applyShowPublicationChange");
    expect(publication).toContain("loadShowPublicationControls");
    expect(publication).toContain("Schedule exact frozen release");
    expect(editions).toContain("loadShowPublicationControls");
    expect(editions).toContain("applyShowPublicationChange");

    for (const [path, code] of [
      ["Publication", publication],
      ["Shows", shows],
      ["Editions", editions],
    ] as const) {
      expect(code, path).not.toMatch(
        /from\(["']shows["']\)[\s\S]{0,180}\.update\(\{[^}]*\bpublished\s*:/,
      );
      expect(code, path).not.toMatch(
        /\.update\(\{[^}]*publication_config\s*:/,
      );
    }
  });

  it("keeps scheduled execution on the existing pg_cron infrastructure", () => {
    expect(migration).toContain("studio2_publish_due_show_publications");
    expect(migration).toContain("'solaris-studio2-publish-due-shows'");
    expect(migration).toContain("'* * * * *'");
    expect(migration).toContain(
      "'select public.studio2_publish_due_show_publications();'",
    );
  });
});
