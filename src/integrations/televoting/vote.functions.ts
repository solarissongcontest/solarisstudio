import { createServerFn } from "@tanstack/react-start";

export type TelevotingVoteEntry = {
  target_country_code: string;
  points: number;
};

export const submitMergedTelevotingVote = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      roundId: string;
      username: string;
      countryCode: string;
      entries: TelevotingVoteEntry[];
      fingerprintHash?: string | null;
      deviceTokenHash?: string | null;
    }) => {
      if (!data?.roundId) throw new Error("Missing round");
      const username = String(data?.username ?? "").trim();
      if (username.length < 2 || username.length > 40) throw new Error("Username must be 2–40 characters");
      if (!data?.countryCode) throw new Error("Home country required");
      if (!Array.isArray(data.entries) || data.entries.length < 5) throw new Error("Vote for at least 5 entries");

      const total = data.entries.reduce((sum, entry) => sum + Number(entry.points || 0), 0);
      if (total !== 20) throw new Error("You must distribute exactly 20 points");
      if (data.entries.some((entry) => !entry.target_country_code || !Number.isInteger(entry.points) || entry.points < 1 || entry.points > 10)) {
        throw new Error("Each selected entry must receive between 1 and 10 points");
      }
      if (new Set(data.entries.map((entry) => entry.target_country_code)).size !== data.entries.length) {
        throw new Error("Duplicate voting entry");
      }

      return {
        ...data,
        username,
      };
    },
  )
  .handler(async ({ data }) => {
    const { submitMergedTelevotingVoteServer } = await import(
      "@/integrations/televoting/vote.server"
    );
    return submitMergedTelevotingVoteServer(data);
  });
