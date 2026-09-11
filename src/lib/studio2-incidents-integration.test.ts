import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { STUDIO2_PRODUCT_SURFACES } from './studio2-product-surfaces';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const nav = source('src/components/admin/AdminNav.tsx');
const route = source('src/routes/_authenticated/admin/incidents.tsx');
const model = source('src/lib/studio2-incidents.ts');
const persistence = source('src/lib/studio2-persistence.ts');
const controlRoom = source('src/routes/_authenticated/admin/control-room-v2.tsx');
const migration = source('supabase/migrations/20260911180500_studio2_incident_command_full.sql');

describe('Studio 2 Incident Command integration', () => {
  it('is a first-class Organizer operations surface', () => {
    expect(nav).toContain('label: "Incidents"');
    expect(nav).toContain('to: "/admin/incidents"');
    expect(nav).toContain('label="Operations"');

    expect(STUDIO2_PRODUCT_SURFACES.incident_command).toMatchObject({
      state: 'product_surface',
      audience: 'organizer',
      route: '/admin/incidents',
    });
  });

  it('keeps incident lifecycle semantics in the shared incident domain model', () => {
    expect(model).toContain("from './incident-command'");
    expect(model).toContain('canTransitionIncident(status, candidate)');
    expect(route).toContain('availableIncidentTransitions(incident.status)');
    expect(route).not.toContain('const NEXT_INCIDENT_STATES');
  });

  it('keeps incident inspection and filters URL-addressable', () => {
    expect(route).toContain('validateSearch:');
    expect(route).toContain("status?: IncidentStatus | 'active'");
    expect(route).toContain('severity?: IncidentSeverity');
    expect(route).toContain('category?: IncidentCategory');
    expect(route).toContain("ack?: 'yes' | 'no'");
    expect(route).toContain('q?: string');
    expect(route).toContain('incident?: string');
  });

  it('routes all authoritative mutations through the Studio 2 persistence service', () => {
    expect(route).toContain('studio2Persistence.createIncidentFull');
    expect(route).toContain('studio2Persistence.acknowledgeIncident');
    expect(route).toContain('studio2Persistence.updateIncident');
    expect(route).toContain('studio2Persistence.addIncidentTimelineEvent');
    expect(route).toContain('studio2Persistence.transitionIncident');
    expect(route).not.toContain("from('studio2_incidents')");
    expect(route).not.toContain('.rpc(');
    expect(route).not.toContain('.insert(');
    expect(route).not.toContain('.update(');
  });

  it('persists the complete Phase 4 incident record and operator history', () => {
    for (const field of [
      'category',
      'affectedSystems',
      'description',
      'commanderId',
      'acknowledgedAt',
      'resolution',
      'postmortem',
      'createdBy',
      'createdAt',
    ]) {
      expect(persistence).toContain(field);
    }

    expect(route).toContain('incidentTimeline(events, incident.id)');
    expect(route).toContain("action.kind === 'resolve'");
    expect(route).toContain("action.kind === 'assign-me'");
    expect(route).toContain("action.kind === 'crisis'");
  });

  it('enforces Incident Command mutations on the server and writes canonical events', () => {
    expect(migration).toContain('security definer');
    expect(migration).toContain("private.studio2_user_has_capability(v_actor, 'incident.manage'");
    expect(migration).toContain("public.has_role(v_actor, 'organizer'::public.app_role)");
    expect(migration).toContain('private.studio2_incident_transition_allowed');
    expect(migration).toContain('studio2_contest_events');
    expect(migration).toContain("'incident.created'");
    expect(migration).toContain("'incident.updated'");
    expect(migration).toContain("'incident.resolved'");
  });

  it('keeps active incidents and SEV-1 crisis state prominent in Control Room', () => {
    expect(controlRoom).toContain('snapshot.incidentSummary.crisisMode');
    expect(controlRoom).toContain('Crisis mode required');
    expect(controlRoom).toContain('Active incidents');
    expect(controlRoom).toContain('snapshot.incidentSummary.criticalCount');
  });
});
