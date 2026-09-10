import { describe, expect, it } from 'vitest';
import {
  assertEditionTransition,
  canTransitionEdition,
  defaultSubsystemStatesForEdition,
  getEditionTransition,
  normalizeLegacyEditionStatus,
} from './edition-state';

describe('edition state engine', () => {
  it('allows normal forward transitions', () => {
    expect(canTransitionEdition('planning', 'confirmations')).toBe(true);
    expect(canTransitionEdition('jury_voting', 'live_show')).toBe(true);
    expect(canTransitionEdition('vote_verification', 'results')).toBe(true);
  });

  it('rejects impossible jumps', () => {
    expect(canTransitionEdition('planning', 'results')).toBe(false);
    expect(canTransitionEdition('archived', 'planning')).toBe(false);
    expect(() => assertEditionTransition('submissions', 'results')).toThrow(/Illegal edition state transition/);
  });

  it('marks sensitive rollback transitions as elevated or critical', () => {
    expect(getEditionTransition('submissions', 'confirmations')?.risk).toBe('elevated');
    expect(getEditionTransition('vote_verification', 'televoting')?.risk).toBe('critical');
  });

  it('maps legacy statuses without breaking existing editions', () => {
    expect(normalizeLegacyEditionStatus('active')).toBe('submissions');
    expect(normalizeLegacyEditionStatus('voting')).toBe('televoting');
    expect(normalizeLegacyEditionStatus('completed')).toBe('post_edition');
    expect(normalizeLegacyEditionStatus(null)).toBe('planning');
  });

  it('derives safe subsystem defaults from the edition lifecycle', () => {
    const live = defaultSubsystemStatesForEdition('televoting');
    expect(live.confirmations).toBe('locked');
    expect(live.submissions).toBe('locked');
    expect(live.juryVoting).toBe('locked');
    expect(live.televoting).toBe('open');
    expect(live.results).toBe('not_started');
    expect(live.predictions).toBe('locked');

    const results = defaultSubsystemStatesForEdition('results');
    expect(results.televoting).toBe('locked');
    expect(results.results).toBe('published');
  });
});
