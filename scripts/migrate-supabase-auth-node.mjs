#!/usr/bin/env node
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const SOURCE_PROJECT_REF = "oxtbskojiexkaspputvo";
const TARGET_PROJECT_REF = "dkxmnvekiopyesuzggeu";
const EXPECTED = { users: 31, identities: 31, passwords: 31 };

function fail(message) {
  throw new Error(message);
}

function requireUrl(name, expectedRef) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is not set.`);
  if (!value.includes(expectedRef)) {
    fail(`${name} does not look like project ${expectedRef}. Aborting.`);
  }
  return value;
}

function qi(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

async function connect(url, label) {
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    return client;
  } catch (error) {
    throw new Error(`${label} connection failed: ${error.message}`);
  }
}

async function authCounts(client) {
  const { rows } = await client.query(`
    select
      (select count(*)::int from auth.users) as users,
      (select count(*)::int from auth.identities) as identities,
      (select count(*)::int
       from auth.users
       where coalesce(encrypted_password, '') <> '') as passwords
  `);
  return rows[0];
}

async function columns(client, table) {
  const { rows } = await client.query(
    `
      select column_name, data_type, udt_schema, udt_name, is_nullable,
             coalesce(column_default, '') as column_default,
             ordinal_position
      from information_schema.columns
      where table_schema = 'auth' and table_name = $1
      order by ordinal_position
    `,
    [table],
  );
  return rows;
}

function schemaSignature(rows) {
  return JSON.stringify(
    rows.map(({ column_name, data_type, udt_schema, udt_name, is_nullable, column_default }) => ({
      column_name,
      data_type,
      udt_schema,
      udt_name,
      is_nullable,
      column_default,
    })),
  );
}

async function fetchRows(client, table, columnNames) {
  const selectList = columnNames.map(qi).join(", ");
  const orderColumn = table === "users" ? "id" : "id";
  const { rows } = await client.query(
    `select ${selectList} from auth.${qi(table)} order by ${qi(orderColumn)}`,
  );
  return rows;
}

async function insertRows(client, table, columnNames, rows) {
  if (!rows.length) return;

  const cols = columnNames.map(qi).join(", ");
  const chunkSize = 50;

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const params = [];
    const tuples = chunk.map((row, rowIndex) => {
      const placeholders = columnNames.map((name, colIndex) => {
        params.push(row[name]);
        return `$${rowIndex * columnNames.length + colIndex + 1}`;
      });
      return `(${placeholders.join(", ")})`;
    });

    await client.query(
      `insert into auth.${qi(table)} (${cols}) values ${tuples.join(", ")}`,
      params,
    );
  }
}

async function fingerprint(client, table) {
  const order = table === "users" ? "id" : "id";
  const { rows } = await client.query(
    `
      select md5(
        coalesce(
          string_agg(to_jsonb(t)::text, E'\\n' order by ${qi(order)}),
          ''
        )
      ) as fp
      from auth.${qi(table)} t
    `,
  );
  return rows[0].fp;
}

async function verifyNoAuthOrphans(client) {
  const { rows: refs } = await client.query(`
    select
      n.nspname as schema_name,
      c.relname as table_name,
      a.attname as column_name
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join unnest(con.conkey) with ordinality ck(attnum, ord) on true
    join unnest(con.confkey) with ordinality fk(attnum, ord) using (ord)
    join pg_attribute a on a.attrelid = c.oid and a.attnum = ck.attnum
    join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = fk.attnum
    where con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and ra.attname = 'id'
      and n.nspname in ('public', 'televoting')
    order by 1, 2, 3
  `);

  for (const ref of refs) {
    const { schema_name, table_name, column_name } = ref;
    const { rows } = await client.query(`
      select count(*)::int as count
      from ${qi(schema_name)}.${qi(table_name)} t
      left join auth.users u on u.id = t.${qi(column_name)}
      where t.${qi(column_name)} is not null
        and u.id is null
    `);
    if (rows[0].count !== 0) {
      fail(
        `Auth migration would leave ${rows[0].count} orphan row(s) in ` +
          `${schema_name}.${table_name}.${column_name}`,
      );
    }
  }
}

async function main() {
  const sourceUrl = requireUrl("SOURCE_DB_URL", SOURCE_PROJECT_REF);
  const targetUrl = requireUrl("TARGET_DB_URL", TARGET_PROJECT_REF);

  if (sourceUrl === targetUrl) fail("SOURCE_DB_URL and TARGET_DB_URL are identical.");

  console.log("Connecting to both Supabase databases...");
  const source = await connect(sourceUrl, "Source");
  const target = await connect(targetUrl, "Target");

  try {
    const [sourceCounts, targetCounts] = await Promise.all([
      authCounts(source),
      authCounts(target),
    ]);

    console.log(
      `Source Auth: ${sourceCounts.users} users, ${sourceCounts.identities} identities, ${sourceCounts.passwords} password credentials`,
    );
    console.log(
      `Target Auth: ${targetCounts.users} users, ${targetCounts.identities} identities, ${targetCounts.passwords} password credentials`,
    );

    if (
      sourceCounts.users !== EXPECTED.users ||
      sourceCounts.identities !== EXPECTED.identities ||
      sourceCounts.passwords !== EXPECTED.passwords
    ) {
      fail("Source Auth is not the expected 31 / 31 / 31 state.");
    }

    if (
      targetCounts.users !== EXPECTED.users ||
      targetCounts.identities !== 0 ||
      targetCounts.passwords !== 0
    ) {
      fail("Target Auth is not the expected 31 / 0 / 0 placeholder state.");
    }

    console.log("Checking Auth schema compatibility...");
    const [su, tu, si, ti] = await Promise.all([
      columns(source, "users"),
      columns(target, "users"),
      columns(source, "identities"),
      columns(target, "identities"),
    ]);

    if (schemaSignature(su) !== schemaSignature(tu)) {
      fail("auth.users schema differs between source and target.");
    }
    if (schemaSignature(si) !== schemaSignature(ti)) {
      fail("auth.identities schema differs between source and target.");
    }

    const userColumns = su.map((x) => x.column_name);
    const identityColumns = si.map((x) => x.column_name);

    console.log("Reading Auth rows locally (credentials are never printed)...");
    const [users, identities, sourceUsersFp, sourceIdentitiesFp] = await Promise.all([
      fetchRows(source, "users", userColumns),
      fetchRows(source, "identities", identityColumns),
      fingerprint(source, "users"),
      fingerprint(source, "identities"),
    ]);

    console.log("Starting target transaction...");
    await target.query("begin");
    try {
      await target.query("set local session_replication_role = replica");
      await target.query("delete from auth.identities");
      await target.query("delete from auth.users");

      await insertRows(target, "users", userColumns, users);
      await insertRows(target, "identities", identityColumns, identities);

      await target.query("set local session_replication_role = origin");

      const after = await authCounts(target);
      if (
        after.users !== EXPECTED.users ||
        after.identities !== EXPECTED.identities ||
        after.passwords !== EXPECTED.passwords
      ) {
        fail(
          `Target verification failed: got ${after.users} / ${after.identities} / ${after.passwords}, expected 31 / 31 / 31.`,
        );
      }

      const [targetUsersFp, targetIdentitiesFp] = await Promise.all([
        fingerprint(target, "users"),
        fingerprint(target, "identities"),
      ]);

      if (sourceUsersFp !== targetUsersFp) {
        fail("auth.users fingerprint differs after copy.");
      }
      if (sourceIdentitiesFp !== targetIdentitiesFp) {
        fail("auth.identities fingerprint differs after copy.");
      }

      console.log("Checking Solaris foreign-key references...");
      await verifyNoAuthOrphans(target);

      await target.query("commit");
    } catch (error) {
      await target.query("rollback");
      throw error;
    }

    const finalCounts = await authCounts(target);

    console.log("");
    console.log("Auth migration verified successfully.");
    console.log(`  users:      ${finalCounts.users}`);
    console.log(`  identities: ${finalCounts.identities}`);
    console.log(`  passwords:  ${finalCounts.passwords}`);
    console.log("  full auth.users fingerprint: match");
    console.log("  full auth.identities fingerprint: match");
    console.log("  application Auth references: valid");
    console.log("");
    console.log(
      "Users may need to sign in again because the new project has different JWT signing configuration.",
    );
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

main().catch((error) => {
  console.error("");
  console.error(`Migration aborted: ${error.message}`);
  console.error("No password or password hash was printed.");
  process.exitCode = 1;
});
