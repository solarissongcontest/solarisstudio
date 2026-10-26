import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isContestEventType } from "./contest-events";
import {
  isV3CanonicalEventConsequenceReplacement,
  v3DomainConsequence,
  v3DomainConsequenceImplementationErrors,
  type V3CanonicalEventConsequenceReplacement,
  type V3DomainConsequence,
} from "./v3-domain-consequence-registry";
import { v3ProjectionsInvalidatedByEvent } from "./v3-projection-reconciliation-registry";

const source = (path: string) => readFileSync(path, "utf8");
const storytelling = source(
  "supabase/migrations/20260912194100_studio2_storytelling_anniversary.sql",
);
const hardening = source(
  "supabase/migrations/20260912194200_studio2_storytelling_hardening.sql",
);
const vocabulary = source("src/lib/contest-events.ts");

function canonicalReplacement(eventType: "story.changed" | "story.published") {
  const consequence = v3DomainConsequence(eventType);
  expect(consequence).not.toBeNull();
  expect(isV3CanonicalEventConsequenceReplacement(consequence!)).toBe(true);
  expect(consequence?.replacement?.kind).toBe("canonical-event");
  return consequence as V3DomainConsequence & {
    replacement: V3CanonicalEventConsequenceReplacement;
  };
}

describe("Worker 3 R2 Story consequence vocabulary", () => {
  it("maps the obsolete umbrella labels to the exact Storytelling vocabulary", () => {
    const changed = canonicalReplacement("story.changed");
    const published = canonicalReplacement("story.published");

    expect(changed.implementationState).toBe("replaced-by-canonical-event");
    expect(changed.replacement.canonicalEvents).toEqual([
      "storyline.updated",
      "storyline.unpublished",
    ]);
    expect(published.replacement.canonicalEvents).toEqual(["storyline.published"]);
    expect(changed.replacement.canonicalEvents.every(isContestEventType)).toBe(true);
    expect(published.replacement.canonicalEvents.every(isContestEventType)).toBe(true);
    expect(changed.replacement.ownerDomain).toBe("story");
    expect(changed.replacement.aggregateType).toBe("storyline");
    expect(published.replacement.aggregateType).toBe("storyline");
  });

  it("proves one canonical producer writes precise storyline events after the durable state mutation", () => {
    expect(storytelling).toContain(
      "create or replace function public.studio2_execute_story_operation(",
    );
    expect(storytelling).toContain("v_event_type text := 'storyline.updated'");
    expect(storytelling).toContain("v_event_type := 'storyline.published'");
    expect(storytelling).toContain("v_event_type := 'storyline.unpublished'");
    expect(storytelling).toContain("insert into public.studio2_contest_events");
    expect(vocabulary).toContain('"storyline.updated"');
    expect(vocabulary).toContain('"storyline.published"');
    expect(vocabulary).toContain('"storyline.unpublished"');
    expect(hardening).toContain("storyline.published");

    expect(storytelling).not.toContain("'story.changed'");
    expect(storytelling).not.toContain("'story.published'");
  });

  it("keeps public Story visibility derived from canonical published storyline state", () => {
    expect(storytelling).toContain("create or replace function public.studio2_public_storyline(");
    expect(storytelling).toContain("where e.slug = p_edition_slug and e.published and s.status = 'published'");
    expect(storytelling).toContain("where s.status = 'published' and e.published");
  });

  it("uses canonical storyline events for projection invalidation and never the obsolete aliases", () => {
    expect(v3ProjectionsInvalidatedByEvent("story.changed")).toEqual([]);
    expect(v3ProjectionsInvalidatedByEvent("story.published")).toEqual([]);
    expect(v3ProjectionsInvalidatedByEvent("storyline.updated").length).toBeGreaterThan(0);
    expect(v3ProjectionsInvalidatedByEvent("storyline.unpublished").length).toBeGreaterThan(0);
    expect(v3ProjectionsInvalidatedByEvent("storyline.published").length).toBeGreaterThan(0);
  });

  it("rejects arbitrary aliases, missing events, wrong owners, producers, effect parity and duplicate runtime effects", () => {
    const published = canonicalReplacement("story.published");
    const baseReplacement = published.replacement;

    const mutation = (
      consequencePatch: Partial<V3DomainConsequence> = {},
      replacementPatch: Partial<V3CanonicalEventConsequenceReplacement> = {},
    ): V3DomainConsequence => ({
      ...published,
      ...consequencePatch,
      replacement: { ...baseReplacement, ...replacementPatch },
    });

    expect(isContestEventType("storyline.does_not_exist")).toBe(false);
    expect(
      v3DomainConsequenceImplementationErrors(
        mutation({}, { canonicalEvents: ["storyline.does_not_exist"] }),
      ),
    ).not.toEqual([]);
    expect(
      v3DomainConsequenceImplementationErrors(
        mutation({}, { canonicalEvents: ["storyline.updated"] }),
      ),
    ).not.toEqual([]);
    expect(
      v3DomainConsequenceImplementationErrors(mutation({ ownerDomain: "publication" })),
    ).not.toEqual([]);
    expect(
      v3DomainConsequenceImplementationErrors(
        mutation({}, { producer: "public.some_other_operation()" }),
      ),
    ).not.toEqual([]);
    expect(
      v3DomainConsequenceImplementationErrors(
        mutation({}, { consumerParity: "trust me" }),
      ),
    ).not.toEqual([]);
    expect(
      v3DomainConsequenceImplementationErrors(
        mutation({}, { declaredEvent: "story.changed" }),
      ),
    ).not.toEqual([]);
    expect(
      v3DomainConsequenceImplementationErrors(
        mutation({}, { canonicalEvents: ["story.published"] }),
      ),
    ).not.toEqual([]);
    expect(
      v3DomainConsequenceImplementationErrors(
        mutation({}, { evidence: baseReplacement.evidence.slice(0, -1) }),
      ),
    ).not.toEqual([]);
    expect(
      v3DomainConsequenceImplementationErrors(
        mutation({
          realtimeEffects: [
            { effect: "invalidate-projection", projection: "invented duplicate effect" },
          ],
        }),
      ),
    ).not.toEqual([]);
  });
});
