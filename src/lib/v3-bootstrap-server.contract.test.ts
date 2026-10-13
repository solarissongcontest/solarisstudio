import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./v3-bootstrap-server.ts', import.meta.url), 'utf8');

describe('V3 server bootstrap architecture boundary', () => {
  it('does not create another database/network client inside the bootstrap orchestrator', () => {
    for (const forbidden of [
      '@supabase',
      'supabase.',
      'fetch(',
      'useQuery',
      'useMutation',
      'localStorage',
      'sessionStorage',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('has no polling, realtime or device-clock ownership', () => {
    for (const forbidden of ['setInterval(', 'setTimeout(', '.channel(', 'Date.now(', 'new Date(']) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('keeps deduplication request-scoped rather than in module-global state', () => {
    expect(source).toContain('export function createV3BootstrapRequestLoader');
    expect(source).toContain('const loads = new Map<string, Promise<V3BootstrapProjection>>()');
    expect(source.indexOf('const loads = new Map')).toBeGreaterThan(source.indexOf('createV3BootstrapRequestLoader'));
  });

  it('reuses the foundation existing-data adapter instead of creating a second projection model', () => {
    expect(source).toContain('v3BootstrapSourceFromExistingData');
    expect(source).toContain('projectV3Bootstrap');
  });
});
