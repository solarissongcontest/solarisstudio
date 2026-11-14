import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  stageRecoveryOwner,
  OWNER_OBSERVATION,
  PLATFORM_OBSERVATION,
} from "./stage-v3-recovery-owner-local.mjs";
function withObservation(change, fn) {
  const root = mkdtempSync(join(tmpdir(), "solaris-owner-profile-"));
  try {
    for (const file of [OWNER_OBSERVATION, PLATFORM_OBSERVATION]) {
      const data = JSON.parse(readFileSync(file, "utf8"));
      if (file === OWNER_OBSERVATION) change(data);
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), JSON.stringify(data));
    }
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test("uses actual nonsuperuser operator and exact schema ACLs only after isolated bootstrap checks", () => {
  const sql = stageRecoveryOwner();
  assert.match(sql, /current_database\(\)<>'recovery_operator_baseline'/);
  assert.match(sql, /oid=10 and rolsuper/);
  assert.match(
    sql,
    /alter role postgres login nosuperuser bypassrls inherit createdb createrole replication/,
  );
  assert.ok(sql.indexOf("NEVER hosted") < sql.indexOf("alter role"));
  assert.doesNotMatch(sql, /grant solaris_recovery_bootstrap|grant supabase_admin/);
  assert.match(sql, /Observed schema owner\/ACL mismatch/);
  assert.match(sql, /Recovery operator inherited an unobserved superuser/);
  assert.match(sql, /Unexpected API role membership/);
  assert.match(sql, /grant "service_role" to "postgres" with admin true, inherit true, set true/);
  assert.match(sql, /begin;[\s\S]*commit;\s*$/);
});
for (const [name, change] of [
  [
    "unbound project",
    (d) => {
      d.projectRef = "oxtbskojiexkaspputvo";
    },
  ],
  [
    "superuser operator",
    (d) => {
      d.roles.find((x) => x.name === "postgres").superuser = true;
    },
  ],
  [
    "incomplete schema evidence",
    (d) => {
      d.schemas.pop();
    },
  ],
  [
    "unknown membership edge",
    (d) => {
      d.memberships.push({ role: "unknown", member: "postgres" });
    },
  ],
  [
    "privileged API membership",
    (d) => {
      d.memberships.push({ role: "supabase_admin", member: "authenticated" });
    },
  ],
])
  test("refuses " + name, () =>
    withObservation(change, (root) => assert.throws(() => stageRecoveryOwner(root))),
  );
