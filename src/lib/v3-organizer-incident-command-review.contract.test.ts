import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const route = source('src/routes/_authenticated/admin/incidents.tsx');

describe('V3 Organizer Incident Command consequence reviews', () => {
  it('keeps routine incident creation fast but reviews SEV-1 creation before crisis activation', () => {
    expect(route).toContain("if (severity === 'sev1')");
    expect(route).toContain('setPendingCreateReview(command)');
    expect(route).toContain('createIncident.mutate(command)');
    expect(route).toContain("severity === 'sev1' ? 'Review SEV-1 incident' : 'Open incident'");
    expect(route).toContain('Open SEV-1 incident');
    expect(route).toContain('immediately activates crisis treatment in Incident Command');
    expect(route).toContain('persistent crisis warning in Control Room until the incident is resolved');
  });

  it('freezes exact creation payload and rechecks the shell Edition before opening an incident', () => {
    expect(route).toContain('type IncidentCreateCommand = {');
    expect(route).toContain('editionId: resolvedEditionId');
    expect(route).toContain('editionLabel: resolvedEditionLabel');
    expect(route).toContain('title: title.trim()');
    expect(route).toContain('description: description.trim()');
    expect(route).toContain('affectedSystems: parseSystems(systems)');
    expect(route).toContain('command.editionId !== editionId');
    expect(route).toContain('command.editionId !== resolvedEditionId');
    expect(route).toContain('Edition context changed before the incident was opened.');
    expect(route).toContain('studio2Persistence.createIncidentFull({');
    expect(route).toContain('editionId: command.editionId');
    expect(route).toContain('title: command.title');
    expect(route).toContain('severity: command.severity');
    expect(route).not.toContain('createIncident.mutate()');
  });

  it('requires typed incident-title confirmation for SEV-1 creation', () => {
    expect(route).toContain('confirmationText={pendingCreateReview?.title}');
    expect(route).toContain('Type ${pendingCreateReview.title} exactly to confirm this SEV-1 incident');
    expect(route).toContain('pendingCreateReview.editionLabel} · {pendingCreateReview.title');
    expect(route).toContain('Edition ID:');
    expect(route).toContain('await createIncident.mutateAsync(pendingCreateReview)');
  });

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
    expect(route).toContain('studio2Persistence.createIncidentFull');
    expect(route).toContain('studio2Persistence.declareIncidentCrisis');
    expect(route).toContain('studio2Persistence.transitionIncident');
    expect(route).toContain('studio2Persistence.updateIncident');
    expect(route).not.toContain("from('studio2_incidents')");
    expect(route).not.toContain('.rpc(');
  });
});
