import { createServerFn } from "@tanstack/react-start";

import type { MergedTelevotingEditionLink } from "@/integrations/televoting/edition-links.server";

export const getMergedTelevotingEditionLinks = createServerFn({ method: "GET" }).handler(
  async (): Promise<MergedTelevotingEditionLink[]> => {
    const { listMergedTelevotingEditionLinksServer } = await import(
      "@/integrations/televoting/edition-links.server"
    );
    return listMergedTelevotingEditionLinksServer();
  },
);
