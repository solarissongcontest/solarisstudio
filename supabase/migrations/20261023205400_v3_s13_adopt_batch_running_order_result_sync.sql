begin;

-- System V3 S13 forward adoption for immutable migration history.
--
-- 20261022151607_batch_running_order_result_sync.sql was merged after the S13
-- framework boundary without a concrete migration contract. Its bytes may
-- already exist in deployed migration history, so rewriting that file would
-- create checksum/history divergence. Register its semantic contract forward
-- instead; the static adoption audit carries one exact-path reviewed exception
-- tied to this migration.
select public.v3_register_migration_contract(
  'v3.results.batch-running-order-result-sync-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Forward S13 adoption for immutable merged migration 20261022151607_batch_running_order_result_sync.sql. The migration batches running-order-only participant result synchronization per statement and replaces admin_set_show_running_order with a set-based write. Historical migration bytes are intentionally preserved; future fixes must repair forward.'
);

commit;
