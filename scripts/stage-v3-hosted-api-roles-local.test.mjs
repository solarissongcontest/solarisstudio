import test from "node:test";
import assert from "node:assert/strict";
import { stageHostedApiRoles } from "./stage-v3-hosted-api-roles-local.mjs";
test("reconstruct actual API bypass attributes without changing production or owner roles", () => {
  const sql = stageHostedApiRoles();
  assert.match(
    sql,
    /service_role nologin nosuperuser nocreatedb nocreaterole noreplication inherit bypassrls/,
  );
  for (const name of ["anon", "authenticated"])
    assert.ok(
      sql.includes(
        name + " nologin nosuperuser nocreatedb nocreaterole noreplication inherit nobypassrls",
      ),
    );
  assert.ok(sql.indexOf("NEVER hosted") < sql.indexOf("alter role anon"));
  assert.doesNotMatch(sql, /alter role (postgres|supabase_auth_admin|dashboard_user)/);
  assert.match(sql, /pg_auth_members/);
});
