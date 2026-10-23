import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const countryDetail = readFileSync(
  'src/routes/_authenticated/admin/countries.$countryId.tsx',
  'utf8',
);

describe('V3 Organizer country participant-view convergence', () => {
  it('keeps read-only delegation inspection inside the Organizer country cockpit', () => {
    expect(countryDetail).toContain('if (tab === "participant-view")');
    expect(countryDetail).toContain('loadStudio2HodWorkspace');
    expect(countryDetail).toContain('Read-only organizer inspection');
    expect(countryDetail).toContain('What this delegation currently sees');
    expect(countryDetail).toContain('snapshot.model.actions');
    expect(countryDetail).toContain('snapshot.model.outstandingAcknowledgements');
    expect(countryDetail).toContain('snapshot.model.readiness');
  });

  it('does not escape to the legacy MySolaris Tasks compatibility surface', () => {
    expect(countryDetail).not.toContain('/my-solaris/tasks');
    expect(countryDetail).not.toContain('Open exact HOD projection');
    expect(countryDetail).not.toContain('HOD inspection');
  });
});
