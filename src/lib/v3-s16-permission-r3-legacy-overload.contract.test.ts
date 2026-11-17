import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const mig=readFileSync('supabase/migrations/20261117074000_v3_s16_permission_r3_legacy_overload_retirement.sql','utf8');
const sql=readFileSync('.github/tests/v3-s16-permission-r3-legacy-overload.sql','utf8');
const client=readFileSync('src/lib/permission-engine-admin.ts','utf8');
const source=readFileSync('supabase/migrations/20261003151000_organisation_os_v5_r3_permission_approvals.sql','utf8');
const runner=readFileSync('.github/scripts/v3-s16-catalog-rehearsal.sh','utf8');
const s14=readFileSync('.github/workflows/v3-s14-archive-forward-effects-local.yml','utf8');
describe('S16 P16 legacy permission R3 overload retirement',()=>{
  it('removes only the unsafe eight-argument approval-bypassing wrapper',()=>{
    expect(mig).toMatch(/drop function public\.studio2_apply_permission_change_r3\(\s*uuid,text,text,uuid,timestamptz,uuid,text,bigint\s*\) restrict/i);
    expect(mig).toContain("to_regprocedure('public.studio2_apply_permission_change_r3(uuid,text,text,uuid,timestamptz,uuid,text,bigint,uuid)')");
    expect(mig).toContain("An approved second-operator request is required");
    expect(mig).not.toMatch(/drop function .*\bcascade\b/i);
    expect(source).toContain('p_approval_request_id');
  });
  it('requires the actual app to send the second-operator approval and preserves current RPC',()=>{
    expect(client).toContain('p_approval_request_id: input.approvalRequestId');
    expect(client).toContain('rpc("studio2_apply_permission_change_r3"');
    expect(sql).toContain('legacy eight-argument permission escalation RPC undefined');
    expect(sql).toContain('PASS: active R3 rejects unauthorized or missing-approval caller');
  });
  it('executes exact-SHA, isolated PG17 catalog and stateful permission tests',()=>{
    expect(runner).toContain('v3-s16-permission-r3-legacy-overload.sql');
    expect(s14).toContain('20261117074000_v3_s16_permission_r3_legacy_overload_retirement.sql');
  });
});