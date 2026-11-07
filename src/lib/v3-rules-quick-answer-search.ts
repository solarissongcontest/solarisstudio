import { GOVERNANCE_QUICK_ANSWERS } from './governance-v5';
import { ROLEPLAY_QUICK_ANSWERS } from './ssc-rules/roleplay';

/**
 * Quick answers are controlled interpretations, not a full-text search result.
 * Only show one when an explicit curated phrase matches meaningfully. Ordinary
 * fuzzy searches still go through the complete official rulebook search.
 */
const QUICK_ANSWERS = [...ROLEPLAY_QUICK_ANSWERS, ...GOVERNANCE_QUICK_ANSWERS] as const;

const QUESTION_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'by', 'can', 'could',
  'do', 'does', 'for', 'from', 'has', 'have', 'how', 'i', 'if', 'in', 'is',
  'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'should', 'someone',
  'the', 'their', 'them', 'there', 'these', 'this', 'to', 'us', 'was',
  'were', 'what', 'when', 'where', 'whether', 'which', 'who', 'why',
  'will', 'with', 'would', 'you', 'your', 'we',
]);

export function normalizeRuleQuestion(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function meaningfulWords(normalized: string): string[] {
  return [...new Set(
    normalized.split(' ').filter((word) => word.length >= 2 && !QUESTION_WORDS.has(word)),
  )];
}

function matchScore(query: string, queryWords: string[], candidate: string): number {
  const normalizedCandidate = normalizeRuleQuestion(candidate);
  if (!normalizedCandidate) return 0;

  // An exact curated question or synonym is the strongest possible match.
  if (normalizedCandidate === query) return 1_000;

  const candidateWords = meaningfulWords(normalizedCandidate);
  if (!candidateWords.length || !candidateWords.every((word) => queryWords.includes(word))) return 0;

  // One common word is not enough to infer an official Yes/No/Depends verdict.
  // A long, curated single-word synonym may match a short question.
  if (candidateWords.length === 1) {
    return candidateWords[0].length >= 7 && queryWords.length <= 4 ? 50 : 0;
  }

  // Require significant query coverage, not substring hits such as "an"
  // inside "annexation" or a generic mention of a country.
  if (candidateWords.length / Math.max(queryWords.length, 1) < 0.33) return 0;

  return 100 + candidateWords.length * 20 + candidateWords.length / queryWords.length;
}

export function findRuleSearchQuickAnswer(query: string) {
  const normalized = normalizeRuleQuestion(query);
  if (!normalized) return null;
  const words = meaningfulWords(normalized);
  let best: { answer: (typeof QUICK_ANSWERS)[number]; score: number } | null = null;

  for (const answer of QUICK_ANSWERS) {
    const score = Math.max(
      matchScore(normalized, words, answer.question),
      ...answer.phrases.map((phrase) => matchScore(normalized, words, phrase)),
    );
    if (score > 0 && (!best || score > best.score)) best = { answer, score };
  }

  return best?.answer ?? null;
}
