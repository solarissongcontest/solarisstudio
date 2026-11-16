import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  verifyPublicationExecution, ROLES, TABLES, ACTIONS, EVENTS,
} from "./v3-s16-publication-execution-manifest.mjs";

const sha = "a".repeat(40);
const fixture = () => ({
  sha, expectedSha: sha, version: 170011, network: "none", ports: false,
  denials: ROLES.flatMap(role => TABLES.flatMap(table => ACTIONS.map(action =>
    [role, table, action, "42501"].join("\t")
  ))),
  events: [...EVENTS],
  archiveLog: "NOTICE: PASS: real publication Archive guard rejects INSERT/UPDATE/DELETE; canonical control remains intact\narchive-state-unchanged",
  readback: {
    candidateSha: sha, serverVersionNum: 170011, currentUser: "postgres",
    sessionUser: "postgres", operatorSuperuser: false,
    showState: "public", controlVersion: 2, showPublished: true,
    participantsPublished: true, receiptCount: 1, auditCount: 1,
    actorId: "71000000-0000-4000-8000-000000000001",
    operationId: "71000000-0000-4000-8000-000000000005",
    archiveGuard: {
      identity: "private.v3_guard_archived_edition_workflow_write()",
      owner: "postgres", securityDefiner: true, type: 31, enabled: "O",
      searchPath: "pg_catalog, public, private", apiRoleExecute: false,
    },
  },
  catalogPublicationFindings: [],
});
test("only complete PG17.11 exact-SHA executed Publication evidence passes", () => {
  const result = verifyPublicationExecution(fixture());
  assert.equal(result.status, "PASS");
  assert.equal(result.actualExecution.directDmlDenials, 24);
  assert.equal(result.actualExecution.noCompetingDirectPublicationWriter, true);
});
test("missing or duplicate real-role denials cannot certify Publication", () => {
  const original = fixture();
  for (const denials of [original.denials.slice(1), [original.denials[0], ...original.denials.slice(1).fill(original.denials[0], 1, 2)]]) {
    assert.throws(() => verifyPublicationExecution({ ...original, denials }), /24 real-role/);
  }
});
test("API-role SQLSTATE must be exactly insufficient_privilege 42501", () => {
  const input = fixture(); input.denials[0] = input.denials[0].replace("42501", "23503");
  assert.throws(() => verifyPublicationExecution(input), /42501/);
});
test("candidate, network and PostgreSQL minor version are mandatory", () => {
  for (const change of [
    {expectedSha:"b".repeat(40)}, {version:170006}, {network:"bridge"}, {ports:true},
    {readback:{...fixture().readback,candidateSha:"b".repeat(40)}},
  ]) assert.throws(() => verifyPublicationExecution({...fixture(),...change}));
});
test("every positive proof and committed receipt is mandatory", () => {
  const base = fixture();
  for (const data of [
    {...base,events:base.events.slice(1)},
    {...base,readback:{...base.readback,receiptCount:0}},
    {...base,readback:{...base.readback,showPublished:false}},
    {...base,readback:{...base.readback,controlVersion:3}},
    {...base,readback:{...base.readback,operatorSuperuser:true}},
  ]) assert.throws(() => verifyPublicationExecution(data));
});
test("Archive trigger/function identity, owner, ACL and real denial are mandatory", () => {
  const base = fixture();
  for (const change of [
    {owner:"supabase_admin"}, {type:30}, {enabled:"D"},
    {apiRoleExecute:true}, {securityDefiner:false},
  ]) {
    const readback = {...base.readback,archiveGuard:{...base.readback.archiveGuard,...change}};
    assert.throws(() => verifyPublicationExecution({...base,readback}));
  }
  assert.throws(() => verifyPublicationExecution({...base,archiveLog:"source-only test listed"}));
});
test("catalog writer failures must never be reclassified into a successful certificate", () => {
  const base = fixture();
  assert.throws(() => verifyPublicationExecution({
    ...base,catalogPublicationFindings:[{kind:"competing_legacy_writer",subject:"unsafe_publication_rpc"}],
  }), /competing writers/);
});
