-- Confirmations project: xwvnrpuqehqcatowxfpx
-- Keeps per-response editing in sync with edition/round editing controls.
-- Applied to production on 2026-08-20.

create or replace function public.sync_submission_editing_from_round()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.editing_enabled is distinct from old.editing_enabled then
    update public.submissions s
    set editing_allowed = (
      new.editing_enabled
      and not coalesce(s.locked, false)
      and exists (
        select 1
        from public.editions e
        where e.id = new.edition_id
          and coalesce(e.editing_enabled, false)
      )
    ),
    updated_at = now()
    where s.round_id = new.id;
  end if;
  return new;
end;
$function$;

create or replace function public.sync_submission_editing_from_edition()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.editing_enabled is distinct from old.editing_enabled then
    update public.submissions s
    set editing_allowed = (
      new.editing_enabled
      and not coalesce(s.locked, false)
      and exists (
        select 1
        from public.submission_rounds r
        where r.id = s.round_id
          and coalesce(r.editing_enabled, false)
      )
    ),
    updated_at = now()
    where s.edition_id = new.id;
  end if;
  return new;
end;
$function$;

create or replace function public.keep_submission_editable_after_open_edit()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- submit_confirmation historically switches editing_allowed off after each edit.
  -- If the edition and round are still open for editing, keep the unlocked response editable.
  -- Admin-only per-response changes do not increment edit_count, so an intentional individual
  -- editing override can still be applied without this trigger undoing it.
  if coalesce(new.edit_count, 0) > coalesce(old.edit_count, 0)
     and not coalesce(new.locked, false)
     and not coalesce(new.editing_allowed, false)
     and exists (
       select 1
       from public.submission_rounds r
       join public.editions e on e.id = r.edition_id
       where r.id = new.round_id
         and coalesce(r.editing_enabled, false)
         and coalesce(e.editing_enabled, false)
     ) then
    update public.submissions
    set editing_allowed = true
    where id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_sync_submission_editing_from_round on public.submission_rounds;
create trigger trg_sync_submission_editing_from_round
after update of editing_enabled on public.submission_rounds
for each row
execute function public.sync_submission_editing_from_round();

drop trigger if exists trg_sync_submission_editing_from_edition on public.editions;
create trigger trg_sync_submission_editing_from_edition
after update of editing_enabled on public.editions
for each row
execute function public.sync_submission_editing_from_edition();

drop trigger if exists trg_keep_submission_editable_after_open_edit on public.submissions;
create trigger trg_keep_submission_editable_after_open_edit
after update of editing_allowed, edit_count on public.submissions
for each row
execute function public.keep_submission_editable_after_open_edit();

-- Repair responses that were left individually closed while their edition and round are open.
update public.submissions s
set editing_allowed = true,
    updated_at = now()
from public.submission_rounds r
join public.editions e on e.id = r.edition_id
where s.round_id = r.id
  and s.edition_id = e.id
  and coalesce(r.editing_enabled, false)
  and coalesce(e.editing_enabled, false)
  and not coalesce(s.locked, false)
  and not coalesce(s.editing_allowed, false);
