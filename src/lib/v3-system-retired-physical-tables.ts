// Machine-readable V3 retirement registry.
//
// V3_SYSTEM_PHYSICAL_AUDIT_SOURCE records what was actually observed in hosted
// production. This registry records physical objects that remain present in
// that historical audit but are intentionally removed by later canonical V3
// migrations. Keeping the two concepts separate avoids rewriting evidence.
export const V3_RETIRED_PHYSICAL_TABLES = new Set<string>([
  "public.studio2_permission_state_versions",
]);
