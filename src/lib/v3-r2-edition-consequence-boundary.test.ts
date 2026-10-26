import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { v3DomainConsequence } from "./v3-domain-consequence-registry";

const source = (path: string) => readFileSync(path, "utf8");

const transition = source(
  "supabase/migrations/20261019112300_v3_s14_transition_http409.sql",
);
const anniversaryDate = source(
  "supabase/migrations/20261026190000_v3_anniversary_date_operation.sql",
);

describe("Worker 3 R2 Edition consequence boundary", () => {
  it("keeps edition.transitioned as the precise lifecycle event vocabulary", () => {
    expect(transition).toContain("'edition.transitioned'");
    expect(transition).toContain("Canonical edition.state_changed DomainEvent remains");
    expect(transition).not.toContain("'edition.changed'");
  });

  it("proves edition.changed cannot be collapsed into the lifecycle event", () => {
    expect(anniversaryDate).toContain("create or replace function public.studio2_apply_anniversary_date(");
    expect(anniversaryDate).toContain("update public.editions edition");
    expect(anniversaryDate).toContain("set event_date = p_event_date");
    expect(anniversaryDate).toContain("private.studio2_complete_operation");
    expect(anniversaryDate).not.toContain("v3_emit_domain_event");
    expect(anniversaryDate).not.toContain("'edition.transitioned'");
  });

  it("leaves the generic non-transition Edition finding unresolved until System owns a precise runtime contract", () => {
    const changed = v3DomainConsequence("edition.changed");
    expect(changed?.ownerDomain).toBe("edition");
    expect(changed?.implementationState).toBe("declared");
    expect(changed?.replacement).toBeNull();
  });
});
