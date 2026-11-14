// Reconstruct source-derived routines against existing observed tables. LOCAL
// only; frozen 9 Nov function hashes are evidence, not fresh owner/trigger proof.
import fs from "node:fs";
import { extractDefinition } from "./v3-s13-s14-authorization-dependencies.mjs";
const sources = [
  [
    "public.claim_country_from_signup",
    "supabase/migrations/20260820144500_country_account_username_auth.sql",
    "()",
  ],
  [
    "public.submit_country_jury_ballot",
    "supabase/migrations/20260821204500_country_account_jury_voting.sql",
    "(uuid,jsonb,uuid)",
  ],
  ...[
    "v3_load_jury_draft",
    "v3_save_jury_draft",
    "v3_submit_jury_ballot",
    "v3_reconcile_jury_submission",
    "v3_jury_receipt",
  ].map((n) => [
    "public." + n,
    "supabase/migrations/20261014132819_v3_jury_reliability_foundation.sql",
    {
      v3_load_jury_draft: "(uuid)",
      v3_save_jury_draft: "(uuid,jsonb,bigint,text,text)",
      v3_submit_jury_ballot: "(uuid,jsonb,uuid,uuid,text)",
      v3_reconcile_jury_submission: "(uuid)",
      v3_jury_receipt: "(uuid)",
    }[n],
  ]),
];
const evidence = JSON.parse(
  fs.readFileSync(
    "docs/v3/recovery-candidates/evidence/s02-hosted-727-routine-fingerprints-2026-11-09.json",
    "utf8",
  ),
);
console.log(
  `begin;do $local$ begin if current_database()<>'recovery_operator_baseline' or current_user<>'postgres' then raise exception 'LOCAL reconstruction only';end if;end $local$;`,
);
for (const [name, file, args] of sources) {
  const observations = evidence.functions.filter((x) => x.id.startsWith(name + "("));
  if (observations.length !== 1) throw Error("Ambiguous observed signature: " + name);
  const o = observations[0];
  console.log(extractDefinition(fs.readFileSync(file, "utf8"), name));
  console.log(`revoke all on function ${name}${args} from public,anon,authenticated,service_role;`);
  const roles = Object.entries(o.exec)
    .filter(([, yes]) => yes)
    .map(([role]) => role);
  if (roles.length) console.log(`grant execute on function ${name}${args} to ${roles.join(",")};`);
  console.log(
    `do $verify$ begin if encode(sha256(convert_to(pg_get_functiondef('${name}${args}'::regprocedure),'UTF8')),'hex')<>'${o.sha256}' then raise exception 'Source-derived routine differs from observed 9 Nov definition: ${name}';end if;end $verify$;`,
  );
}
console.log(
  `create trigger on_solaris_country_signup after insert on auth.users for each row execute function public.claim_country_from_signup();\ncommit;`,
);
