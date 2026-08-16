import { createServerFn } from "@tanstack/react-start";

export type MergedTelevotingEdition = {
  id: string;
  name: string;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
  round_count: number;
  vote_count: number;
};

export const listMergedTelevotingEditions = createServerFn({ method: "GET" }).handler(async () => {
  const { listMergedTelevotingEditionsServer } = await import(
    "@/integrations/televoting/editions.server"
  );
  return listMergedTelevotingEditionsServer() as Promise<MergedTelevotingEdition[]>;
});

export const createMergedTelevotingEdition = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string }) => {
    const name = String(data?.name ?? "").trim();
    if (!name) throw new Error("Edition name is required");
    if (name.length > 120) throw new Error("Edition name is too long");
    return { name };
  })
  .handler(async ({ data }) => {
    const { createMergedTelevotingEditionServer } = await import(
      "@/integrations/televoting/editions.server"
    );
    return createMergedTelevotingEditionServer(data.name);
  });

export const renameMergedTelevotingEdition = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; name: string }) => {
    if (!data?.id) throw new Error("Missing edition");
    const name = String(data.name ?? "").trim();
    if (!name) throw new Error("Edition name is required");
    if (name.length > 120) throw new Error("Edition name is too long");
    return { id: data.id, name };
  })
  .handler(async ({ data }) => {
    const { renameMergedTelevotingEditionServer } = await import(
      "@/integrations/televoting/editions.server"
    );
    return renameMergedTelevotingEditionServer(data);
  });

export const activateMergedTelevotingEdition = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => {
    if (!data?.id) throw new Error("Missing edition");
    return data;
  })
  .handler(async ({ data }) => {
    const { activateMergedTelevotingEditionServer } = await import(
      "@/integrations/televoting/editions.server"
    );
    return activateMergedTelevotingEditionServer(data.id);
  });

export const archiveMergedTelevotingEdition = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; archived: boolean }) => {
    if (!data?.id) throw new Error("Missing edition");
    return { id: data.id, archived: Boolean(data.archived) };
  })
  .handler(async ({ data }) => {
    const { archiveMergedTelevotingEditionServer } = await import(
      "@/integrations/televoting/editions.server"
    );
    return archiveMergedTelevotingEditionServer(data);
  });
