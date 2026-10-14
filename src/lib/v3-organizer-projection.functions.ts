import { createServerFn } from "@tanstack/react-start";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getV3OrganizerProjection = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId: string }) => {
    const editionId = String(data?.editionId ?? "").trim();
    if (!UUID.test(editionId)) throw new Error("Invalid edition id");
    return { editionId };
  })
  .handler(async ({ data }) => {
    const { loadV3OrganizerProjectionServer } =
      await import("@/lib/organizer-v3-projection.server");
    return loadV3OrganizerProjectionServer(data.editionId);
  });
