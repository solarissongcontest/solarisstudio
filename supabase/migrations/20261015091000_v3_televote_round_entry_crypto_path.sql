-- System V3 Televote compatibility hardening.
--
-- pgcrypto is intentionally installed in the `extensions` schema. The legacy
-- round-entry normalization trigger used an unqualified gen_random_bytes()
-- reference while pinning its search_path to `televoting, pg_temp`, so the
-- custom-entry fallback key path could fail at runtime. Preserve the existing
-- immutable-key semantics while resolving pgcrypto explicitly.

begin;

create or replace function televoting.round_entries_normalize()
returns trigger
language plpgsql
set search_path = televoting, pg_temp
as $$
begin
  if new.entry_type = 'country' then
    new.entry_key := new.country_code;
  elsif tg_op = 'INSERT' then
    new.entry_key := coalesce(
      nullif(btrim(new.entry_key), ''),
      'x_' || encode(extensions.gen_random_bytes(6), 'hex')
    );
  else
    new.entry_key := old.entry_key;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

commit;
