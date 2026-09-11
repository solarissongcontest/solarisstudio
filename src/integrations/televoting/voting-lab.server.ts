import { requireMergedTelevotingAdminServer } from '@/integrations/televoting/admin-session.server';
import { canonicalEditionForRound, loadCanonicalVotingContextServer } from '@/integrations/televoting/canonical-context.server';
import { televotingAdmin } from '@/integrations/televoting/client.server';
import type { VotingLabBallot } from '@/lib/voting-lab';

type RoundRow = {
  id: string;
  edition_id: string;
  name: string;
  status: string;
  created_at: string;
};

type SubmissionRow = {
  id: string;
  round_id: string;
  status: string | null;
};

type VoteEntryRow = {
  submission_id: string;
  target_country_code: string;
  points: number;
};

type RoundEntryRow = {
  entry_key: string;
  country_code: string | null;
  custom_name: string | null;
  short_name: string | null;
  entry_code: string | null;
  display_order: number;
};

type CountryRow = {
  code: string;
  name: string;
};

export type VotingLabRound = {
  id: string;
  name: string;
  status: string;
  canonicalEditionId: string | null;
};

export type VotingLabEntry = {
  id: string;
  name: string;
  code: string;
};

export type VotingLabData = {
  rounds: VotingLabRound[];
  selectedRoundId: string | null;
  ballots: VotingLabBallot[];
  entries: VotingLabEntry[];
};

export type VotingLabDataInput = {
  editionId?: string | null;
  roundId?: string | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? '').trim().toUpperCase();
}

export async function getVotingLabDataServer(input: VotingLabDataInput = {}): Promise<VotingLabData> {
  await requireMergedTelevotingAdminServer();

  const [roundResult, canonical] = await Promise.all([
    televotingAdmin
      .from('rounds')
      .select('id,edition_id,name,status,created_at')
      .order('created_at', { ascending: false }),
    loadCanonicalVotingContextServer(),
  ]);

  if (roundResult.error) throw new Error(roundResult.error.message);

  const allRounds = ((roundResult.data ?? []) as RoundRow[]).map((round) => ({
    row: round,
    canonicalEditionId: canonicalEditionForRound(canonical, round),
  }));

  const scopedRounds = input.editionId
    ? allRounds.filter((round) => round.canonicalEditionId === input.editionId)
    : allRounds;

  const rounds: VotingLabRound[] = scopedRounds.map(({ row, canonicalEditionId }) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    canonicalEditionId,
  }));

  if (!rounds.length) {
    return { rounds: [], selectedRoundId: null, ballots: [], entries: [] };
  }

  const selectedRound = input.roundId
    ? rounds.find((round) => round.id === input.roundId)
    : rounds[0];

  if (!selectedRound) throw new Error('The selected voting round is not available in this edition.');

  const submissionResult = await televotingAdmin
    .from('vote_submissions')
    .select('id,round_id,status')
    .eq('round_id', selectedRound.id)
    .neq('status', 'deleted')
    .order('id', { ascending: true });
  if (submissionResult.error) throw new Error(submissionResult.error.message);

  const submissions = (submissionResult.data ?? []) as SubmissionRow[];
  const submissionIds = submissions.map((submission) => submission.id);

  const [entryResult, catalogResult, countryResult] = await Promise.all([
    submissionIds.length
      ? televotingAdmin
        .from('vote_entries')
        .select('submission_id,target_country_code,points')
        .in('submission_id', submissionIds)
      : Promise.resolve({ data: [], error: null }),
    televotingAdmin
      .from('round_entries')
      .select('entry_key,country_code,custom_name,short_name,entry_code,display_order')
      .eq('round_id', selectedRound.id)
      .order('display_order', { ascending: true }),
    televotingAdmin.from('countries').select('code,name'),
  ]);

  if (entryResult.error) throw new Error(entryResult.error.message);
  if (catalogResult.error) throw new Error(catalogResult.error.message);
  if (countryResult.error) throw new Error(countryResult.error.message);

  const awardsBySubmission = new Map<string, VoteEntryRow[]>();
  for (const award of (entryResult.data ?? []) as VoteEntryRow[]) {
    const list = awardsBySubmission.get(award.submission_id) ?? [];
    list.push(award);
    awardsBySubmission.set(award.submission_id, list);
  }

  // Intentionally return synthetic ballot identities. Voting Lab needs the
  // shape of ballots, not usernames, voter countries, IP metadata, risk scores,
  // device hashes, or any other identifying / integrity information.
  const ballots: VotingLabBallot[] = submissions.map((submission, index) => {
    const syntheticId = `ballot-${index + 1}`;
    return {
      id: syntheticId,
      voterId: syntheticId,
      awards: (awardsBySubmission.get(submission.id) ?? []).map((award) => ({
        countryId: award.target_country_code,
        points: Number(award.points),
      })),
    };
  });

  const countries = new Map(
    ((countryResult.data ?? []) as CountryRow[]).map((country) => [normalize(country.code), country.name]),
  );
  const entries: VotingLabEntry[] = ((catalogResult.data ?? []) as RoundEntryRow[]).map((entry) => {
    const countryCode = normalize(entry.country_code);
    return {
      id: entry.entry_key,
      name: entry.custom_name || entry.short_name || countries.get(countryCode) || entry.entry_key,
      code: entry.entry_code || entry.country_code || entry.entry_key,
    };
  });

  return {
    rounds,
    selectedRoundId: selectedRound.id,
    ballots,
    entries,
  };
}
