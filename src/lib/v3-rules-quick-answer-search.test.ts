import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { findRuleSearchQuickAnswer, normalizeRuleQuestion } from './v3-rules-quick-answer-search';

describe('Rules search quick-answer evidence', () => {
  it('preserves exact authored questions and synonyms across both rule groups', () => {
    expect(findRuleSearchQuickAnswer("Can I invade another HOD's country?")?.id).toBe('invade-country');
    expect(findRuleSearchQuickAnswer('invasion')?.id).toBe('invade-country');
    expect(findRuleSearchQuickAnswer('Can I vote highly for a friend\'s song?')?.id).toBe('friend-vote');
    expect(findRuleSearchQuickAnswer('trade points')?.id).toBe('vote-exchange');
    expect(findRuleSearchQuickAnswer('What if my country has no HOD?')?.id).toBe('annex-hodless-country');
  });

  it('does not manufacture Yes/No/Depends answers from broad or unrelated terms', () => {
    expect(findRuleSearchQuickAnswer('country')).toBeNull();
    expect(findRuleSearchQuickAnswer('How do I find another country?')).toBeNull();
    expect(findRuleSearchQuickAnswer('Can I annex a country with an active HOD?')).toBeNull();
    expect(findRuleSearchQuickAnswer('hello world')).toBeNull();
    expect(findRuleSearchQuickAnswer('')).toBeNull();
  });

  it('matches whole normalized tokens rather than accidental substrings', () => {
    expect(findRuleSearchQuickAnswer('an and of')).toBeNull();
    expect(findRuleSearchQuickAnswer('Can I vote for a friend?')?.id).toBe('friend-vote');
    expect(findRuleSearchQuickAnswer('Can I annex a HODless country?')?.id).toBe('annex-hodless-country');
    expect(normalizeRuleQuestion('ÅLAND and Öland')).toBe('aland and oland');
  });

  it('keeps the official rulebook search alongside controlled quick answers', () => {
    const route = readFileSync(resolve(process.cwd(), 'src/routes/rules/search.tsx'), 'utf8');
    expect(route).toContain('findRuleSearchQuickAnswer(q)');
    expect(route).toContain('key={q}');
    expect(route).toContain('defaultValue={q}');
    expect(route).toContain('searchSscRules(q).slice(0, 20)');
    expect(route).not.toContain('findGovernanceQuickAnswer(q)');
    expect(route).not.toContain('findRoleplayQuickAnswer(q)');
  });
});
