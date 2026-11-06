import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { auditWorldBallotEventSql, sqlCallArguments, stripSqlComments } from "./check-v3-world-ballot-event-privacy.mjs";

const safe = `begin;
  perform private.v3_emit_domain_event(
    'world.vote.ballot_cast','world_vote',p_vote_id::text,1,
    v_operation_id,null,null,
    jsonb_build_object('voteId',p_vote_id),
    1,array[]::text[]
  );
end;`;
const source = (content = safe) => [{ name: "tg8_commands.sql", content }];

test("accepts only the canonical vote-ID event without a network call", () => {
  assert.deepEqual(auditWorldBallotEventSql(source()), {
    ok: true, event: "world.vote.ballot_cast",
    source: "tg8_commands.sql", payloadKeys: ["voteId"], occurrences: 1,
  });
});

test("refuses payload additions carrying a ballot choice or account identity", () => {
  for (const payload of [
    "jsonb_build_object('voteId',p_vote_id,'choice',p_choice)",
    "jsonb_build_object('voteId',p_vote_id,'actor',auth.uid())",
    "jsonb_build_object('voteId',p_vote_id,'proxyId',p_proxy_id)",
    "p_client_supplied_json",
  ]) {
    assert.throws(() => auditWorldBallotEventSql(source(
      safe.replace("jsonb_build_object('voteId',p_vote_id)", payload)
    )), /payload/);
  }
});

test("refuses private actor fields even outside the main JSON payload", () => {
  assert.throws(() => auditWorldBallotEventSql(source(
    safe.replace("v_operation_id,null,null", "v_operation_id,p_choice,null")
  )), /envelope field 6/);
});

test("strictly allowlists metadata and event version, not just private field names", () => {
  const replacements = [
    ["v_operation_id,null,null", "v_operation_id,p_secret_email,null"],
    ["v_operation_id,null,null", "v_operation_id,null,p_audit_context"],
    ["v_operation_id,null,null", "auth.uid(),null,null"],
    ["1,array[]::text[]", "1,array['userId']::text[]"],
    ["1,array[]::text[]", "2,array[]::text[]"],
  ];
  for (const [original, unsafe] of replacements) {
    assert.throws(() => auditWorldBallotEventSql(source(safe.replace(original, unsafe))),
      /envelope field/);
  }
});

test("fails closed on absent, duplicate, and malformed emission contracts", () => {
  assert.throws(() => auditWorldBallotEventSql(source("select 1;")), /found 0/);
  assert.throws(() => auditWorldBallotEventSql(source(safe + safe)), /found 2/);
  assert.throws(() => auditWorldBallotEventSql([]), /sources required/);
  assert.throws(() => auditWorldBallotEventSql(source(
    safe.replace("'world_vote'", "'country'")
  )), /envelope field 2/);
});

test("does not mistake fake event calls in SQL comments for published producers", () => {
  assert.throws(() => auditWorldBallotEventSql(source(
    "-- " + safe.trim().replace(/\n/g, "\n-- ") + "\n"
  )), /found 0/);
  assert.equal(stripSqlComments("select '--still text'; -- comment\nselect 1;")
    .includes("'--still text'"), true);
  assert.equal(sqlCallArguments("f('vote,a', func(1,2),3)", 1).args.length, 3);
});

test("CLI verifies fixture locally, refuses unsafe input and never invokes Supabase", () => {
  const dir = mkdtempSync(join(tmpdir(), "world-event-privacy-"));
  const filename = join(dir, "sample.sql");
  const runner = resolve("scripts/check-v3-world-ballot-event-privacy.mjs");
  try {
    writeFileSync(filename, safe, "utf8");
    const good = spawnSync(process.execPath, [runner, filename], { encoding: "utf8" });
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /"payloadKeys"/);
    writeFileSync(filename, safe.replace(
      "jsonb_build_object('voteId',p_vote_id)",
      "jsonb_build_object('voteId',p_vote_id,'choice',p_choice)"
    ), "utf8");
    const bad = spawnSync(process.execPath, [runner, filename], { encoding: "utf8" });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Ballot outbox payload/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
