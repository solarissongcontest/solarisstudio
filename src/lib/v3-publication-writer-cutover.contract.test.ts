import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(path:string)=>readFileSync(path,"utf8");
describe("Publication authority and lost-response recovery",()=>{
  it("pins request identity and revalidates scope/session before returning a committed result",()=>{
    const migration=read("supabase/migrations/20261028112308_v3_publication_direct_write_cutover.sql");
    expect(migration).toContain("revoke insert,update,delete,truncate");
    expect(migration).toContain("from public,anon,authenticated,service_role");
    const admission=migration.split("$admission$")[1];
    for(const guard of ["private.v3_require_active_auth_session()","studio2_access_allowed('edition.manage',v_show.edition_id,false)","studio2_access_allowed('results.publish',v_show.edition_id,false)","v_prior_receipt.actor_id is distinct from v_actor","v_prior_receipt.scope->'request' is distinct from v_publication_request","'config',private.studio2_normalise_publication_config(p_config)","'scheduledFor',p_scheduled_for,'expectedVersion',p_expected_version"]) expect(admission).toContain(guard);
    expect(admission.indexOf("private.v3_require_active_auth_session()")).toBeLessThan(admission.indexOf("return v_prior_receipt.result"));
    expect(migration).toContain("Unrecognized canonical publication command");
  });
  it("executes scoped publication, exact replay, changed-request denial and raw-write denial in PostgreSQL",()=>{
    const sql=read(".github/tests/v3-publication-writer-cutover.sql");
    for(const proof of ["Canonical publication replay diverged","Changed publication request replayed","Foreign edition publisher mutated show","Service raw publication control write accepted","Service raw publication execution delete accepted","has_table_privilege","Scheduler must retain pinned owner authority","Publication event lost or duplicated"])expect(sql).toContain(proof);
    expect(read(".github/scripts/v3-canonical-writer-rehearsal.sh")).toContain("v3-publication-writer-cutover.sql");
  });
});
