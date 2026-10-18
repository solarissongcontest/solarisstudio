import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const pairSchema = z.object({
  pair: z
    .string()
    .trim()
    .min(5)
    .max(80)
    .regex(/^[A-Za-z0-9-]+-vs-[A-Za-z0-9-]+$/i),
});

export const getV3RelationshipsIndexBundle = createServerFn({ method: "GET" }).handler(
  async () => {
    const { loadV3RelationshipsIndexBundle } = await import(
      "@/integrations/v3/relationships-source.server"
    );
    return loadV3RelationshipsIndexBundle();
  },
);

/** The browser supplies only a public pair code. Archive and publication truth stay server-owned. */
export const getV3RelationshipDetailBundle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => pairSchema.parse(input))
  .handler(async ({ data }) => {
    const { loadV3RelationshipDetailBundle } = await import(
      "@/integrations/v3/relationships-source.server"
    );
    return loadV3RelationshipDetailBundle(data.pair);
  });
