import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const route = source('src/routes/_authenticated/admin/incidents.tsx');

describe('V3 Organizer Incident Command consequence reviews', () => {
  it('keeps routine incident work fast while reviewing operational truth changes', () => {
    expect(route).toContain("mutate.mutate({ kind: 'ack' })");
    expect(route).toContain("mutate.mutate({ kind: incident.commanderId ? 'clear-commander' : 'assign-me' })");
    expect(route).toContain("mutate.mutate({ kind: 'save' })");
    expect(route).toContain("mutate.mutate({ kind: 'note' })");
    expect(route).toContain("setPendingReview({ kind: 'crisis' })");
    expect(route).toContain("setPendingReview({ kind: 'severity', value: escalation })");
    expect(route).toContain("setPendingReview({ kind: 'transition', value: status })");
    expect(route).toContain("setPendingReview({ kind: 'resolve' })");
  });

  it('shows exact incident, edition and before/after state before apply', () => {
    expect(route).toContain('AdminConfirmSheet');
    expect(route).toContain('Incident ID:');
    expect(route).toContain('Edition {editionId}');
    expect(route).toContain('incidentSeverityLabel(incident.severity)');
    expect(route).toContain("Severity changes from");
    expect(route).toContain("Status changes from");
  });

  it('requires typed incident confirmation for crisis declaration and resolution', () => {
    expect(route).toContain("pendingReview.kind === 'crisis' || pendingReview.kind === 'resolve'");
    expect(route).toContain('confirmationText=');
    expect(route).toContain('Type ${incident.title} exactly to confirm this incident command');
    expect(route).toContain("pendingReview?.kind === 'resolve' && !resolution.trim()");
  });

  it('makes crisis, reopen and resolution consequences explicit', () => {
    expect(route).toContain('persist as a prominent crisis warning in Control Room until the incident is resolved');
    expect(route).toContain('This reopens the incident into active operational monitoring.');
    expect(route).toContain('Resolution being recorded');
    expect(route).toContain('does not invent atomic rollback semantics');
  });

  it('keeps existing persistence authority behind the reviewed commands', () => {
    expect(route).toContain('studio2Persistence.declareIncidentCrisis');
    expect(route).toContain('studio2Persistence.transitionIncident');
    expect(route).toContain('studio2Persistence.updateIncident');
    expect(route).not.toContain("from('studio2_incidents')");
    expect(route).not.toContain('.rpc(');
  });
});
