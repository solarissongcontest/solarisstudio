import { createServerFn } from '@tanstack/react-start';

export type VotingLabDataInput = {
  editionId?: string | null;
  roundId?: string | null;
};

export const getVotingLabData = createServerFn({ method: 'POST' })
  .inputValidator((data: VotingLabDataInput) => ({
    editionId: data?.editionId ? String(data.editionId) : null,
    roundId: data?.roundId ? String(data.roundId) : null,
  }))
  .handler(async ({ data }) => {
    const { getVotingLabDataServer } = await import('@/integrations/televoting/voting-lab.server');
    return getVotingLabDataServer(data);
  });
