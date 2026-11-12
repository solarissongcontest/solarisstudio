-- S02 local-only hosted-observed S14 Archive two additional dependency relations.

-- These were NOT in donor preflight and were discovered by actual local forward rehearsal.

-- Schema-only, no application rows or production deployment authority.

BEGIN;

SET search_path=public,private,auth,televoting,pg_catalog;

SET check_function_bodies=off;

CREATE TABLE "private"."v3_domain_event_consumer_receipts" (
  "event_id" uuid NOT NULL,
  "consumer_key" text NOT NULL,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "result_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE "public"."studio2_transition_approval_requests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "edition_id" uuid NOT NULL,
  "from_state" text NOT NULL,
  "to_state" text NOT NULL,
  "reason" text NOT NULL,
  "requested_by" uuid NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "consumed_at" timestamp with time zone
);

CREATE OR REPLACE FUNCTION private.reconcile_organizer_notification_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
declare
  v_resolved boolean := false;
  v_source_key text := tg_table_name || ':' || new.id::text;
begin
  case tg_table_name
    when 'integrity_cases' then
      v_resolved := new.status like 'closed%';
    when 'integrity_case_appeals' then
      v_resolved := new.status in (
        'upheld', 'reduced', 'increased', 'overturned',
        'rejected_late', 'rejected_ineligible'
      );
    when 'integrity_identity_disclosure_requests' then
      v_resolved := new.status in ('rejected', 'used', 'expired');
    when 'studio2_transition_approval_requests' then
      v_resolved := new.consumed_at is not null;
    else
      return new;
  end case;

  update public.admin_notifications
  set resolved_at = case when v_resolved then coalesce(resolved_at, now()) else null end
  where source_key = v_source_key;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.route_organizer_transition_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  perform private.notify_solaris_organizers(
    'critical',
    'Edition transition approval required',
    format(
      'A critical edition transition from %s to %s needs a second organizer approval.',
      replace(new.from_state, '_', ' '),
      replace(new.to_state, '_', ' ')
    ),
    '/admin/control-room',
    'studio2_transition_approval_requests:' || new.id::text
  );

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.sync_organizer_inbox_transition_resolution()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
begin
  if new.approved_at is not null or new.consumed_at is not null or new.expires_at <= now() then
    update public.admin_notifications
    set resolved_at = coalesce(resolved_at, now())
    where source_key = 'studio2_transition_approval_requests:' || new.id::text;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.v3_reject_domain_event_receipt_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'private'
AS $function$
begin
  raise exception 'Domain event consumer receipts are immutable' using errcode = '55000';
end
$function$;

ALTER TABLE "private"."v3_domain_event_consumer_receipts" ADD CONSTRAINT "v3_domain_event_consumer_receipts_consumer_check" CHECK (consumer_key ~ '^[a-z][a-z0-9_.:-]{0,159}$'::text);

ALTER TABLE "private"."v3_domain_event_consumer_receipts" ADD CONSTRAINT "v3_domain_event_consumer_receipts_pkey" PRIMARY KEY (event_id, consumer_key);

ALTER TABLE "private"."v3_domain_event_consumer_receipts" ADD CONSTRAINT "v3_domain_event_consumer_receipts_result_check" CHECK (jsonb_typeof(result_metadata) = 'object'::text AND pg_column_size(result_metadata) <= 8192);

ALTER TABLE "public"."studio2_transition_approval_requests" ADD CONSTRAINT "studio2_transition_approval_approver_check" CHECK (approved_by IS NULL OR approved_by <> requested_by);

ALTER TABLE "public"."studio2_transition_approval_requests" ADD CONSTRAINT "studio2_transition_approval_expiry_check" CHECK (expires_at > requested_at);

ALTER TABLE "public"."studio2_transition_approval_requests" ADD CONSTRAINT "studio2_transition_approval_reason_check" CHECK (length(btrim(reason)) > 0);

ALTER TABLE "public"."studio2_transition_approval_requests" ADD CONSTRAINT "studio2_transition_approval_requests_pkey" PRIMARY KEY (id);

ALTER TABLE "public"."studio2_transition_approval_requests" ADD CONSTRAINT "studio2_transition_approval_state_check" CHECK ((from_state = ANY (ARRAY['planning'::text, 'confirmations'::text, 'submissions'::text, 'jury_voting'::text, 'televoting'::text, 'live_show'::text, 'vote_verification'::text, 'results'::text, 'post_edition'::text, 'archived'::text])) AND (to_state = ANY (ARRAY['planning'::text, 'confirmations'::text, 'submissions'::text, 'jury_voting'::text, 'televoting'::text, 'live_show'::text, 'vote_verification'::text, 'results'::text, 'post_edition'::text, 'archived'::text])));

CREATE INDEX studio2_transition_approval_active_idx ON public.studio2_transition_approval_requests USING btree (edition_id, from_state, to_state, requested_at DESC) WHERE (consumed_at IS NULL);

CREATE INDEX studio2_transition_approval_approved_by_idx ON public.studio2_transition_approval_requests USING btree (approved_by);

CREATE INDEX studio2_transition_approval_requested_by_idx ON public.studio2_transition_approval_requests USING btree (requested_by);

ALTER TABLE "private"."v3_domain_event_consumer_receipts" ADD CONSTRAINT "v3_domain_event_consumer_receipts_event_id_fkey" FOREIGN KEY (event_id) REFERENCES private.v3_domain_events(id) ON DELETE RESTRICT;

ALTER TABLE "public"."studio2_transition_approval_requests" ADD CONSTRAINT "studio2_transition_approval_requests_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE "public"."studio2_transition_approval_requests" ADD CONSTRAINT "studio2_transition_approval_requests_edition_id_fkey" FOREIGN KEY (edition_id) REFERENCES editions(id) ON DELETE CASCADE;

ALTER TABLE "public"."studio2_transition_approval_requests" ADD CONSTRAINT "studio2_transition_approval_requests_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE TRIGGER v3_domain_event_consumer_receipts_immutable BEFORE DELETE OR UPDATE ON private.v3_domain_event_consumer_receipts FOR EACH ROW EXECUTE FUNCTION private.v3_reject_domain_event_receipt_mutation();

CREATE TRIGGER organizer_inbox_transition_approval_insert AFTER INSERT ON studio2_transition_approval_requests FOR EACH ROW EXECUTE FUNCTION private.route_organizer_transition_approval();

CREATE TRIGGER organizer_inbox_transition_resolution AFTER UPDATE ON studio2_transition_approval_requests FOR EACH ROW EXECUTE FUNCTION private.sync_organizer_inbox_transition_resolution();

CREATE TRIGGER organizer_inbox_transition_state AFTER UPDATE OF consumed_at ON studio2_transition_approval_requests FOR EACH ROW EXECUTE FUNCTION private.reconcile_organizer_notification_state();

ALTER TABLE "private"."v3_domain_event_consumer_receipts" DISABLE ROW LEVEL SECURITY;

ALTER TABLE "private"."v3_domain_event_consumer_receipts" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_transition_approval_requests" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."studio2_transition_approval_requests" NO FORCE ROW LEVEL SECURITY;

CREATE POLICY "studio2_transition_approval_capability_read" ON "public"."studio2_transition_approval_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (studio2_access_allowed('edition.manage'::text, edition_id, false));

SET check_function_bodies=on;

COMMIT;
