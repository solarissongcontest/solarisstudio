import { createServerFn } from "@tanstack/react-start";

export const getPublicShowTelevoteDetail = createServerFn({ method: "POST" })
  .inputValidator((data: { showId: string }) => ({
    showId: String(data?.showId ?? "").trim(),
  }))
  .handler(async ({ data }) => {
    if (!data.showId) return null;
    const { getPublicShowTelevoteDetailServer } = await import(
      "@/integrations/televoting/public-detail.server"
    );
    return getPublicShowTelevoteDetailServer(data.showId);
  });
