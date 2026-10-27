import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { V3_EDITION_TRANSITION_CONSEQUENCE as trace } from "./v3-edition-transition-consequence";
import { classifyV3ConsequenceRelease } from "./v3-consequence-release-classification";
import { classifyV3ReleaseFinding } from "./v3-release-risk";
const read = (path:string) => readFileSync(path,"utf8");
it("keeps canonical transition authority synchronous and transactional, outside the derived consumer",()=>{
 const sql=read(trace.evidence[0]);
 const transition=sql.slice(sql.indexOf("create or replace function public.studio2_transition_edition_v3("),sql.indexOf("revoke all on function public.studio2_transition_edition_v2"));
 for(const contract of ["p_expected_version", "v_approval.approved_by = v_actor", "update public.studio2_edition_runtime", "and version = p_expected_version", "private.studio2_complete_operation", "insert into public.studio2_contest_events"]) expect(transition).toContain(contract);
 expect(transition.indexOf("update public.studio2_edition_runtime")).toBeLessThan(transition.indexOf("perform private.v3_emit_domain_event"));
 const emission=transition.slice(transition.indexOf("perform private.v3_emit_domain_event"),transition.indexOf("if p_to = 'archived' then",transition.indexOf("perform private.v3_emit_domain_event")));
 expect(emission).toContain("array[]::text[]");
 expect(emission).toContain("'lifecycleAuthority', 'studio2_edition_runtime'");
 expect(read(trace.evidence[1])).toContain("Canonical edition.transitioned DomainEvent was not installed");
});
it("retains the separately required Archive consumer and persisted event/audit verification",()=>{
 const sql=read(trace.evidence[0]);
 expect(sql).toContain("v_event.event_type <> 'edition.archived'");
 expect(sql).toContain("perform private.studio2_reconcile_all_organizer_tasks(v_event.edition_id)");
 expect(sql).toContain("private.v3_domain_event_consumer_receipts");
 const rehearsal=read(trace.evidence[2]);
 expect(rehearsal).toContain("expected 3 canonical edition.transitioned events");
 expect(rehearsal).toContain("expected 3 legacy edition.state_changed audit events");
 expect(rehearsal).toContain("semantic edition.archived event is missing");
});
it("moves only remaining derived transition maturity to debt without resolving or suppressing inventory",()=>{
 expect(classifyV3ConsequenceRelease(trace.event)).toBe("derived");
 expect(classifyV3ReleaseFinding("DOMAIN_CONSEQUENCE_DECLARED edition.transitioned owner=edition").releaseRisk).toBe("tracked_migration_debt");
 for(const event of ["edition.changed","edition.archived","session.revoked","integrity.case_changed","show.changed"]) expect(classifyV3ConsequenceRelease(event)).toBe("integrity_critical");
});
