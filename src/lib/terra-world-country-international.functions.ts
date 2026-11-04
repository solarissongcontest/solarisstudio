import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const directoryInput = z.object({
  page: z.number().int().min(0).max(200),
  search: z.string().max(120),
});

const countryInput = z.object({
  code: z.string().trim().min(1).max(16).regex(/^[a-zA-Z0-9_-]+$/),
});

export const getTerraWorldCountryDirectory = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => directoryInput.parse(input))
  .handler(async ({ data }) => {
    const { loadTerraWorldCountryDirectory } = await import(
      "@/integrations/v3/terra-world-country-international.server"
    );
    return loadTerraWorldCountryDirectory(data);
  });

export const getTerraWorldCountryInternational = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => countryInput.parse(input))
  .handler(async ({ data }) => {
    const { loadTerraWorldCountryInternational } = await import(
      "@/integrations/v3/terra-world-country-international.server"
    );
    return loadTerraWorldCountryInternational(data.code);
  });
