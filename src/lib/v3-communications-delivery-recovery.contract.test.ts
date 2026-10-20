import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const migration = source(
  'supabase/migrations/20261020065000_v3_communications_delivery_recovery.sql',
);
const noticeConsequences = source(
  'supabase/migrations/20261016062000_v3_s5_notice_consequences.sql',
);
const notificationConsequences = source(
  'supabase/migrations/20261016064100_v3_s5_notification_consequences.sql',
);
const operationContract = source(
  'supabase/migrations/20261002203000_organisation_os_v5_operation_contract.sql',
);

describe('V3 Official Communications delivery recovery', () => {
  it('is an additive S13 forward-fix contract', () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.communications.delivery-recovery'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain(
      'notification_deliveries_official_subject_status_idx',
    );
  });

  it('uses one recipient universe for preview and publication materialization', () => {
    expect(migration).toContain(
      'private.v3_notice_eligible_recipient_ids(',
    );
    expect(migration).toContain('from public.country_accounts account');
    expect(migration).toContain('from public.studio2_role_assignments assignment');
    expect(migration).toContain('from public.studio2_capability_grants grant_row');
    expect(migration).toContain(
      'private.studio2_user_can_receive_notice_as_recipient(',
    );

    const materializerStart = migration.indexOf(
      'create or replace function private.v3_materialize_notice_recipients(',
    );
    const previewStart = migration.indexOf(
      'create or replace function public.studio2_notice_recipient_preview(',
    );
    const materializer = migration.slice(materializerStart, previewStart);
    expect(materializer).toContain(
      'from private.v3_notice_eligible_recipient_ids(v_notice.id) eligible',
    );

    expect(noticeConsequences).toContain(
      'v_materialized := private.v3_materialize_notice_recipients(new.id);',
    );
  });

  it('keeps preview advisory and never materializes fake receipts or deliveries', () => {
    const previewStart = migration.indexOf(
      'create or replace function public.studio2_notice_recipient_preview(',
    );
    const summaryStart = migration.indexOf(
      'create or replace function private.v3_safe_notification_error_summary(',
    );
    const preview = migration.slice(previewStart, summaryStart);

    expect(preview).toContain("'eligibleRecipients', v_eligible");
    expect(preview).toContain("'deliveryChannels', jsonb_build_array('in_app', 'push')");
    expect(preview).toContain("'pushEligible', v_push_eligible");
    expect(preview).toContain("'stateVersion', v_notice.revision");
    expect(preview).toContain("'advisoryOnly', true");
    expect(preview).toContain("'publishRevalidatesRecipients', true");
    expect(preview).not.toMatch(/insert\s+into\s+public\.studio2_notice_receipts/i);
    expect(preview).not.toMatch(/insert\s+into\s+public\.notification_deliveries/i);
  });

  it('binds preview and delivery reads to exact notice + edition scope', () => {
    expect(migration.match(/notice\.edition_id is not distinct from p_edition_id/g)?.length)
      .toBeGreaterThanOrEqual(3);
    expect(migration).toContain(
      'perform private.studio2_require_communications_access(v_notice.edition_id);',
    );
    expect(migration).toContain(
      "'retryCapability', 'system.manage'",
    );
    expect(migration).toContain(
      "v_can_retry := public.studio2_access_allowed('system.manage', null, false);",
    );
  });

  it('returns notice-scoped delivery stages without recipient or endpoint material', () => {
    const summaryStart = migration.indexOf(
      'create or replace function public.studio2_notice_delivery_summary(',
    );
    const retryIdentityStart = migration.indexOf(
      'create or replace function private.v3_notice_retry_child_operation_id(',
    );
    const summary = migration.slice(summaryStart, retryIdentityStart);

    expect(summary).toContain("delivery.category = 'official'");
    expect(summary).toContain('delivery.subject_id = v_notice.id::text');
    expect(summary).toContain("'providerAccepted', v_provider_accepted");
    expect(summary).toContain("'received', v_received");
    expect(summary).toContain("'displayed', v_displayed");
    expect(summary).toContain("'opened', v_opened");
    expect(summary).toContain("'failedDeliveries', v_failed");
    expect(summary).toContain('limit 100');
    expect(summary).not.toContain('user_id');
    expect(summary).not.toContain('endpoint');
    expect(summary).not.toContain('p256dh');
    expect(summary).not.toContain('auth_secret');
  });

  it('sanitizes failed delivery errors instead of leaking raw provider diagnostics', () => {
    expect(migration).toContain(
      'private.v3_safe_notification_error_summary(p_error text)',
    );
    expect(migration).toContain("'Push subscription is no longer valid'");
    expect(migration).toContain("'Push provider rate limit'");
    expect(migration).toContain("'Notification delivery failed'");

    const summaryStart = migration.indexOf(
      'create or replace function public.studio2_notice_delivery_summary(',
    );
    const retryIdentityStart = migration.indexOf(
      'create or replace function private.v3_notice_retry_child_operation_id(',
    );
    const summary = migration.slice(summaryStart, retryIdentityStart);
    expect(summary).toContain(
      "'errorSummary', private.v3_safe_notification_error_summary(failed.error)",
    );
    expect(summary).not.toContain("'error', failed.error");
  });

  it('uses the existing system.manage per-delivery retry authority under a bounded S2 parent', () => {
    expect(operationContract).toContain(
      'create or replace function public.admin_retry_failed_notification_delivery(',
    );
    expect(operationContract).toContain(
      "if v_delivery.status <> 'failed' then",
    );

    const retryStart = migration.indexOf(
      'create or replace function public.studio2_retry_failed_notice_deliveries(',
    );
    const retry = migration.slice(retryStart);

    expect(retry).toContain(
      "public.studio2_access_allowed('system.manage', null, false)",
    );
    expect(retry).toContain('p_limit > 50');
    expect(retry).toContain("delivery.status = 'failed'");
    expect(retry).toContain('for update skip locked');
    expect(retry).toContain('private.studio2_claim_operation(');
    expect(retry).toContain("'system.push.retry_failed'");
    expect(retry).toContain(
      'public.admin_retry_failed_notification_delivery(',
    );
    expect(retry).toContain('public.studio2_reconcile_operation(v_operation_id)');
    expect(retry).not.toContain("delivery.status = 'sent'\n    order by");
  });

  it('preserves notification failure-task auto-resolution and adds immediate reconciliation', () => {
    expect(notificationConsequences).toContain(
      "if old.status = 'failed' and new.status = 'pending' then",
    );
    expect(notificationConsequences).toContain(
      "v_event_type := 'notification.queued';",
    );
    expect(notificationConsequences).toContain(
      'private.v3_reconcile_notification_delivery_task(',
    );
    expect(migration).toContain(
      'perform private.v3_reconcile_notification_delivery_task(v_delivery_id);',
    );
  });

  it('keeps service-role execution out of Organizer-facing read/retry RPCs', () => {
    expect(migration).toContain(
      'revoke all on function public.studio2_notice_recipient_preview(uuid, uuid)\n  from public, anon, service_role;',
    );
    expect(migration).toContain(
      'revoke all on function public.studio2_notice_delivery_summary(uuid, uuid)\n  from public, anon, service_role;',
    );
    expect(migration).toContain(
      ') from public, anon, service_role;\ngrant execute on function public.studio2_retry_failed_notice_deliveries(',
    );
  });
});
